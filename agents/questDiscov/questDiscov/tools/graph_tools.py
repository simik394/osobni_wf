"""Graph tools for the LangGraph agent."""

from __future__ import annotations

import json
from typing import Optional

from langchain_core.tools import tool

from ..graph import get_graph


@tool
def query_questions() -> str:
    """Get all questions in the knowledge graph.

    Returns JSON array of questions with id, text, answered status, and scores.
    """
    graph = get_graph()
    questions = graph.get_all_questions()
    return json.dumps(
        [
            {
                "id": q.id,
                "text": q.text,
                "answered": q.answered,
                "entropy": q.entropy,
                "centrality": q.centrality,
                "priority": q.priority,
            }
            for q in questions
        ],
        indent=2,
    )


@tool
def query_dependencies() -> str:
    """Get all dependency relationships in the graph.

    Returns JSON array of [from_id, to_id] pairs where from_id DEPENDS_ON to_id.
    """
    graph = get_graph()
    deps = graph.get_dependencies()
    return json.dumps(deps, indent=2)


@tool
def add_question(text: str, question_id: Optional[str] = None) -> str:
    """Add a new research question to the knowledge graph.

    Args:
        text: The question text
        question_id: Optional ID (will be auto-generated if not provided)

    Returns:
        The ID of the created question
    """
    graph = get_graph()
    qid = graph.add_question(text, question_id=question_id)
    return f"Created question {qid}: {text}"


@tool
def add_dependency(from_question_id: str, to_question_id: str) -> str:
    """Add a dependency relationship: from_question DEPENDS_ON to_question.

    This means to_question must be answered before from_question can be addressed.

    Args:
        from_question_id: ID of the question that has the dependency
        to_question_id: ID of the prerequisite question

    Returns:
        Confirmation message
    """
    graph = get_graph()
    success = graph.add_dependency(from_question_id, to_question_id)
    if success:
        return f"Added dependency: {from_question_id} depends on {to_question_id}"
    return f"Failed to add dependency - check that both questions exist"


@tool
def mark_answered(question_id: str) -> str:
    """Mark a question as answered.

    Args:
        question_id: ID of the question to mark

    Returns:
        Confirmation message
    """
    graph = get_graph()
    success = graph.mark_answered(question_id)
    if success:
        return f"Marked {question_id} as answered"
    return f"Question {question_id} not found"


@tool
def get_graph_stats() -> str:
    """Get statistics about the knowledge graph.

    Returns:
        JSON with counts of questions, dependencies, and answered questions
    """
    graph = get_graph()
    stats = graph.stats()
    return json.dumps(stats, indent=2)
