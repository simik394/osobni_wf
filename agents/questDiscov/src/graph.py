"""FalkorDB graph operations for questDiscov.

Manages a knowledge graph of research questions and their dependencies.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Question:
    """A research question in the graph."""

    id: str
    text: str
    answered: bool = False
    entropy: Optional[float] = None
    centrality: Optional[float] = None
    priority: Optional[float] = None


class QuestionGraph:
    """Manages question/dependency graph in FalkorDB."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        graph_name: str = "questDiscov",
    ):
        """Initialize connection to FalkorDB.

        Args:
            host: FalkorDB host (default: from env or localhost)
            port: FalkorDB port (default: from env or 6379)
            graph_name: Name of the graph to use
        """
        self.host = host or os.getenv("FALKORDB_HOST", "localhost")
        self.port = port or int(os.getenv("FALKORDB_PORT", "6379"))
        self.graph_name = graph_name
        self._db = None
        self._graph = None

    def connect(self) -> "QuestionGraph":
        """Establish connection to FalkorDB."""
        from falkordb import FalkorDB

        self._db = FalkorDB(host=self.host, port=self.port)
        self._graph = self._db.select_graph(self.graph_name)
        return self

    @property
    def graph(self):
        """Get the graph, connecting if necessary."""
        if self._graph is None:
            self.connect()
        return self._graph

    def add_question(
        self,
        text: str,
        question_id: Optional[str] = None,
        answered: bool = False,
    ) -> str:
        """Add a research question node.

        Args:
            text: The question text
            question_id: Optional ID (auto-generated if not provided)
            answered: Whether the question has been answered

        Returns:
            The question ID
        """
        qid = question_id or f"Q{uuid.uuid4().hex[:8]}"
        query = """
            MERGE (q:Question {id: $id})
            SET q.text = $text, q.answered = $answered
            RETURN q.id
        """
        self.graph.query(query, {"id": qid, "text": text, "answered": answered})
        return qid

    def add_dependency(self, from_id: str, to_id: str) -> bool:
        """Create DEPENDS_ON edge: from_id depends on to_id.

        Args:
            from_id: Question that has the dependency
            to_id: Question that must be answered first

        Returns:
            True if edge was created
        """
        query = """
            MATCH (from:Question {id: $from_id})
            MATCH (to:Question {id: $to_id})
            MERGE (from)-[r:DEPENDS_ON]->(to)
            RETURN r
        """
        result = self.graph.query(query, {"from_id": from_id, "to_id": to_id})
        return len(result.result_set) > 0

    def get_question(self, question_id: str) -> Optional[Question]:
        """Get a single question by ID."""
        query = """
            MATCH (q:Question {id: $id})
            RETURN q.id, q.text, q.answered, q.entropy, q.centrality, q.priority
        """
        result = self.graph.query(query, {"id": question_id})
        if result.result_set:
            row = result.result_set[0]
            return Question(
                id=row[0],
                text=row[1],
                answered=bool(row[2]),
                entropy=row[3],
                centrality=row[4],
                priority=row[5],
            )
        return None

    def get_all_questions(self) -> list[Question]:
        """Return all questions with properties."""
        query = """
            MATCH (q:Question)
            RETURN q.id, q.text, q.answered, q.entropy, q.centrality, q.priority
            ORDER BY q.id
        """
        result = self.graph.query(query)
        return [
            Question(
                id=row[0],
                text=row[1],
                answered=bool(row[2]) if row[2] is not None else False,
                entropy=row[3],
                centrality=row[4],
                priority=row[5],
            )
            for row in result.result_set
        ]

    def get_dependencies(self) -> list[tuple[str, str]]:
        """Return all dependency edges as (from_id, to_id) tuples."""
        query = """
            MATCH (from:Question)-[:DEPENDS_ON]->(to:Question)
            RETURN from.id, to.id
        """
        result = self.graph.query(query)
        return [(row[0], row[1]) for row in result.result_set]

    def mark_answered(self, question_id: str) -> bool:
        """Mark a question as answered.

        Returns:
            True if question was found and updated
        """
        query = """
            MATCH (q:Question {id: $id})
            SET q.answered = true
            RETURN q.id
        """
        result = self.graph.query(query, {"id": question_id})
        return len(result.result_set) > 0

    def get_unanswered(self) -> list[Question]:
        """Get all unanswered questions."""
        query = """
            MATCH (q:Question)
            WHERE q.answered = false OR q.answered IS NULL
            RETURN q.id, q.text, q.answered, q.entropy, q.centrality, q.priority
            ORDER BY q.id
        """
        result = self.graph.query(query)
        return [
            Question(
                id=row[0],
                text=row[1],
                answered=False,
                entropy=row[3],
                centrality=row[4],
                priority=row[5],
            )
            for row in result.result_set
        ]

    def update_scores(
        self,
        question_id: str,
        entropy: Optional[float] = None,
        centrality: Optional[float] = None,
        priority: Optional[float] = None,
    ) -> bool:
        """Update computed scores for a question."""
        updates = []
        params = {"id": question_id}

        if entropy is not None:
            updates.append("q.entropy = $entropy")
            params["entropy"] = entropy
        if centrality is not None:
            updates.append("q.centrality = $centrality")
            params["centrality"] = centrality
        if priority is not None:
            updates.append("q.priority = $priority")
            params["priority"] = priority

        if not updates:
            return False

        query = f"""
            MATCH (q:Question {{id: $id}})
            SET {', '.join(updates)}
            RETURN q.id
        """
        result = self.graph.query(query, params)
        return len(result.result_set) > 0

    def clear(self) -> int:
        """Delete all nodes and relationships. Returns count deleted."""
        query = "MATCH (n) DETACH DELETE n"
        self.graph.query(query)
        # Get count of remaining (should be 0)
        count_query = "MATCH (n) RETURN count(n)"
        result = self.graph.query(count_query)
        return 0 if result.result_set[0][0] == 0 else -1

    def stats(self) -> dict:
        """Get graph statistics."""
        questions_query = "MATCH (q:Question) RETURN count(q)"
        deps_query = "MATCH ()-[r:DEPENDS_ON]->() RETURN count(r)"
        answered_query = "MATCH (q:Question) WHERE q.answered = true RETURN count(q)"

        q_result = self.graph.query(questions_query)
        d_result = self.graph.query(deps_query)
        a_result = self.graph.query(answered_query)

        return {
            "questions": q_result.result_set[0][0] if q_result.result_set else 0,
            "dependencies": d_result.result_set[0][0] if d_result.result_set else 0,
            "answered": a_result.result_set[0][0] if a_result.result_set else 0,
        }


# Singleton instance for convenience
_graph_instance: Optional[QuestionGraph] = None


def get_graph() -> QuestionGraph:
    """Get the global QuestionGraph instance."""
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = QuestionGraph()
    return _graph_instance
