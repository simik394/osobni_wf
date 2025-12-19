"""Priority scoring pipeline for question prioritization.

Combines entropy (uncertainty) and centrality (structural importance)
to produce a final priority score.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .graph import Question


@dataclass
class PriorityWeights:
    """Weights for priority score calculation."""

    entropy: float = 0.5
    centrality: float = 0.5

    def __post_init__(self):
        total = self.entropy + self.centrality
        if abs(total - 1.0) > 0.01:
            # Normalize
            self.entropy /= total
            self.centrality /= total


@dataclass
class PrioritizedQuestion:
    """A question with computed priority information."""

    id: str
    text: str
    priority_score: float
    entropy: float
    centrality: float
    blocking_count: int = 0
    explanation: str = ""


async def estimate_entropy_llm(
    question_text: str,
    context: Optional[list[str]] = None,
) -> float:
    """Use LLM to estimate uncertainty (entropy) for a question.

    Asks the model: "How uncertain is the answer to this question?"

    Args:
        question_text: The research question
        context: Optional context from related notes/knowledge

    Returns:
        Entropy value between 0 (certain) and 1 (very uncertain)
    """
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp"),
        temperature=0,
    )

    context_str = ""
    if context:
        context_str = f"\n\nContext:\n" + "\n".join(f"- {c}" for c in context[:5])

    prompt = f"""Rate the uncertainty of this research question on a scale from 0.0 to 1.0.

- 0.0 = The answer is well-known and easily found
- 0.5 = The answer requires some investigation but is probably knowable
- 1.0 = The answer is highly uncertain, may require original research

Question: {question_text}{context_str}

Reply with ONLY a number between 0.0 and 1.0, nothing else."""

    response = await llm.ainvoke(prompt)
    try:
        entropy = float(response.content.strip())
        return max(0.0, min(1.0, entropy))  # Clamp to [0, 1]
    except ValueError:
        return 0.5  # Default to medium uncertainty


def estimate_entropy_heuristic(question: "Question") -> float:
    """Estimate entropy using simple heuristics (no LLM).

    Uses question characteristics to estimate uncertainty.
    """
    text = question.text.lower()

    # Questions with "how" or "why" tend to be more uncertain
    uncertainty_markers = ["how", "why", "what if", "could", "should", "might"]
    certainty_markers = ["is", "does", "what is", "when", "where"]

    score = 0.5  # Start neutral

    for marker in uncertainty_markers:
        if marker in text:
            score += 0.1

    for marker in certainty_markers:
        if marker in text:
            score -= 0.1

    # Longer questions tend to be more complex/uncertain
    word_count = len(text.split())
    if word_count > 20:
        score += 0.1
    elif word_count < 5:
        score -= 0.1

    return max(0.0, min(1.0, score))


def compute_priority_score(
    entropy: float,
    centrality: float,
    weights: Optional[PriorityWeights] = None,
) -> float:
    """Compute composite priority score.

    Args:
        entropy: Uncertainty score (0-1)
        centrality: Structural importance score (0-1)
        weights: Optional custom weights

    Returns:
        Priority score (0-1)
    """
    w = weights or PriorityWeights()
    return w.entropy * entropy + w.centrality * centrality


def rank_questions(
    questions: list[PrioritizedQuestion],
) -> list[PrioritizedQuestion]:
    """Sort questions by priority score descending."""
    return sorted(questions, key=lambda q: q.priority_score, reverse=True)


def generate_explanation(pq: PrioritizedQuestion) -> str:
    """Generate a human-readable explanation for the priority score."""
    parts = []

    if pq.entropy >= 0.7:
        parts.append("High uncertainty (worth investigating)")
    elif pq.entropy >= 0.4:
        parts.append("Medium uncertainty")
    else:
        parts.append("Relatively certain (may already be known)")

    if pq.centrality >= 0.3:
        parts.append("high structural importance (bridges knowledge areas)")
    elif pq.centrality > 0:
        parts.append("some structural importance")

    if pq.blocking_count > 0:
        parts.append(f"blocks {pq.blocking_count} other questions")

    return "; ".join(parts) if parts else "No specific priority factors"


async def compute_all_priorities(
    questions: list["Question"],
    centrality_scores: dict[str, float],
    blocking_counts: Optional[dict[str, int]] = None,
    weights: Optional[PriorityWeights] = None,
    use_llm: bool = False,
) -> list[PrioritizedQuestion]:
    """Compute priorities for all questions.

    Args:
        questions: List of unanswered questions
        centrality_scores: Dict of question_id -> centrality
        blocking_counts: Optional dict of question_id -> blocking count
        weights: Priority weights
        use_llm: Whether to use LLM for entropy estimation

    Returns:
        List of PrioritizedQuestion sorted by priority
    """
    blocking_counts = blocking_counts or {}
    prioritized = []

    for q in questions:
        # Get or estimate entropy
        if q.entropy is not None:
            entropy = q.entropy
        elif use_llm:
            entropy = await estimate_entropy_llm(q.text)
        else:
            entropy = estimate_entropy_heuristic(q)

        # Get centrality
        centrality = centrality_scores.get(q.id, 0.0)

        # Compute priority
        priority = compute_priority_score(entropy, centrality, weights)

        pq = PrioritizedQuestion(
            id=q.id,
            text=q.text,
            priority_score=priority,
            entropy=entropy,
            centrality=centrality,
            blocking_count=blocking_counts.get(q.id, 0),
        )
        pq.explanation = generate_explanation(pq)
        prioritized.append(pq)

    return rank_questions(prioritized)
