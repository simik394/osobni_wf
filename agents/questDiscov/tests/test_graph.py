"""Tests for the graph module."""

import pytest

from src.graph import Question, QuestionGraph


@pytest.fixture
def graph():
    """Create a test graph instance."""
    g = QuestionGraph(graph_name="questDiscov_test")
    g.connect()
    g.clear()
    yield g
    g.clear()


class TestQuestionGraph:
    """Tests for QuestionGraph class."""

    def test_add_question(self, graph):
        """Test adding a question."""
        qid = graph.add_question("What is the meaning of life?", question_id="Q1")
        assert qid == "Q1"

        q = graph.get_question("Q1")
        assert q is not None
        assert q.text == "What is the meaning of life?"
        assert q.answered is False

    def test_add_question_auto_id(self, graph):
        """Test adding a question with auto-generated ID."""
        qid = graph.add_question("Test question")
        assert qid.startswith("Q")
        assert len(qid) == 9  # Q + 8 hex chars

    def test_add_dependency(self, graph):
        """Test adding a dependency."""
        graph.add_question("Question A", question_id="QA")
        graph.add_question("Question B", question_id="QB")

        success = graph.add_dependency("QA", "QB")
        assert success is True

        deps = graph.get_dependencies()
        assert ("QA", "QB") in deps

    def test_mark_answered(self, graph):
        """Test marking a question as answered."""
        graph.add_question("Test", question_id="Q1")

        success = graph.mark_answered("Q1")
        assert success is True

        q = graph.get_question("Q1")
        assert q.answered is True

    def test_get_unanswered(self, graph):
        """Test filtering unanswered questions."""
        graph.add_question("Q1 text", question_id="Q1")
        graph.add_question("Q2 text", question_id="Q2")
        graph.add_question("Q3 text", question_id="Q3")
        graph.mark_answered("Q2")

        unanswered = graph.get_unanswered()
        ids = {q.id for q in unanswered}

        assert "Q1" in ids
        assert "Q2" not in ids
        assert "Q3" in ids

    def test_update_scores(self, graph):
        """Test updating computed scores."""
        graph.add_question("Test", question_id="Q1")

        graph.update_scores("Q1", entropy=0.7, centrality=0.3, priority=0.5)

        q = graph.get_question("Q1")
        assert q.entropy == 0.7
        assert q.centrality == 0.3
        assert q.priority == 0.5

    def test_stats(self, graph):
        """Test getting graph statistics."""
        graph.add_question("Q1", question_id="Q1")
        graph.add_question("Q2", question_id="Q2")
        graph.add_dependency("Q1", "Q2")
        graph.mark_answered("Q2")

        stats = graph.stats()
        assert stats["questions"] == 2
        assert stats["dependencies"] == 1
        assert stats["answered"] == 1

    def test_get_all_questions(self, graph):
        """Test getting all questions."""
        graph.add_question("A", question_id="QA")
        graph.add_question("B", question_id="QB")
        graph.add_question("C", question_id="QC")

        questions = graph.get_all_questions()
        ids = {q.id for q in questions}

        assert ids == {"QA", "QB", "QC"}
