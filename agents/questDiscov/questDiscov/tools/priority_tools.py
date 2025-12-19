"""Priority computation tools for the LangGraph agent."""

from __future__ import annotations

import asyncio
import json
from typing import Optional

from langchain_core.tools import tool

from ..algorithms import (
    build_networkx_graph,
    compute_betweenness_centrality,
    get_blocking_count,
    get_ready_questions,
)
from ..graph import get_graph
from ..priority import PriorityWeights, compute_all_priorities


@tool
def compute_priorities(use_llm: bool = False, top_n: int = 5) -> str:
    """Compute priority scores for all unanswered questions.

    Combines entropy (uncertainty) and centrality (structural importance)
    to rank questions by value of answering them.

    Args:
        use_llm: Whether to use LLM for entropy estimation (slower but better)
        top_n: Number of top questions to return

    Returns:
        JSON array of top priority questions with scores and explanations
    """
    graph = get_graph()

    # Get data
    questions = graph.get_unanswered()
    all_questions = graph.get_all_questions()
    dependencies = graph.get_dependencies()

    if not questions:
        return json.dumps({"message": "No unanswered questions found"})

    # Build NetworkX graph for analysis
    nx_graph = build_networkx_graph(all_questions, dependencies)

    # Compute centrality
    centrality_scores = compute_betweenness_centrality(nx_graph)

    # Compute blocking counts
    blocking_counts = {q.id: get_blocking_count(nx_graph, q.id) for q in questions}

    # Compute priorities (async)
    prioritized = asyncio.run(
        compute_all_priorities(
            questions,
            centrality_scores,
            blocking_counts,
            use_llm=use_llm,
        )
    )

    # Update graph with computed scores
    for pq in prioritized:
        graph.update_scores(
            pq.id,
            entropy=pq.entropy,
            centrality=pq.centrality,
            priority=pq.priority_score,
        )

    # Return top N
    top = prioritized[:top_n]
    return json.dumps(
        [
            {
                "rank": i + 1,
                "id": pq.id,
                "text": pq.text,
                "priority_score": round(pq.priority_score, 3),
                "entropy": round(pq.entropy, 3),
                "centrality": round(pq.centrality, 3),
                "blocking_count": pq.blocking_count,
                "explanation": pq.explanation,
            }
            for i, pq in enumerate(top)
        ],
        indent=2,
    )


@tool
def get_ready_to_work() -> str:
    """Get questions that are ready to work on (all dependencies answered).

    Returns:
        JSON array of question IDs that can be addressed now
    """
    graph = get_graph()
    questions = graph.get_all_questions()
    dependencies = graph.get_dependencies()

    # Build graph
    nx_graph = build_networkx_graph(questions, dependencies)

    # Get answered set
    answered = {q.id for q in questions if q.answered}

    # Get ready questions
    ready_ids = get_ready_questions(nx_graph, answered)

    # Get full question data for ready ones
    ready_questions = [q for q in questions if q.id in ready_ids and not q.answered]

    return json.dumps(
        [
            {
                "id": q.id,
                "text": q.text,
                "priority": q.priority,
            }
            for q in ready_questions
        ],
        indent=2,
    )


@tool
def explain_priority(question_id: str) -> str:
    """Explain why a specific question has its priority score.

    Args:
        question_id: ID of the question to explain

    Returns:
        Detailed explanation of the priority factors
    """
    graph = get_graph()
    question = graph.get_question(question_id)

    if not question:
        return f"Question {question_id} not found"

    # Get graph data for context
    all_questions = graph.get_all_questions()
    dependencies = graph.get_dependencies()
    nx_graph = build_networkx_graph(all_questions, dependencies)

    centrality = compute_betweenness_centrality(nx_graph).get(question_id, 0)
    blocking = get_blocking_count(nx_graph, question_id)

    explanation = {
        "question_id": question_id,
        "text": question.text,
        "answered": question.answered,
        "factors": {
            "entropy": {
                "value": question.entropy,
                "interpretation": (
                    "High uncertainty - worth investigating"
                    if (question.entropy or 0) >= 0.7
                    else "Medium uncertainty"
                    if (question.entropy or 0) >= 0.4
                    else "Lower uncertainty"
                ),
            },
            "centrality": {
                "value": round(centrality, 3),
                "interpretation": (
                    "High structural importance - bridges different areas"
                    if centrality >= 0.2
                    else "Some structural importance"
                    if centrality > 0
                    else "Peripheral question"
                ),
            },
            "blocking_count": {
                "value": blocking,
                "interpretation": f"Answering this unblocks {blocking} other questions",
            },
        },
        "priority_score": question.priority,
    }

    return json.dumps(explanation, indent=2)
