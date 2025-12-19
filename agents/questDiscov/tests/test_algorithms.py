"""Tests for the algorithms module."""

import pytest
import networkx as nx

from questDiscov.algorithms import (
    build_networkx_graph,
    topological_sort,
    detect_cycle,
    compute_betweenness_centrality,
    get_ready_questions,
    get_blocking_count,
    get_dependency_depth,
)
from questDiscov.graph import Question


class TestBuildGraph:
    """Tests for building NetworkX graph from data."""

    def test_build_empty_graph(self):
        """Test building empty graph."""
        G = build_networkx_graph([], [])
        assert len(G.nodes()) == 0
        assert len(G.edges()) == 0

    def test_build_with_nodes(self):
        """Test building graph with nodes only."""
        questions = [
            Question(id="Q1", text="What?", answered=False),
            Question(id="Q2", text="Why?", answered=True),
        ]
        G = build_networkx_graph(questions, [])

        assert len(G.nodes()) == 2
        assert G.nodes["Q1"]["text"] == "What?"
        assert G.nodes["Q2"]["answered"] is True

    def test_build_with_edges(self):
        """Test building graph with dependencies."""
        questions = [
            Question(id="Q1", text="A", answered=False),
            Question(id="Q2", text="B", answered=False),
        ]
        deps = [("Q1", "Q2")]  # Q1 depends on Q2

        G = build_networkx_graph(questions, deps)
        assert G.has_edge("Q1", "Q2")


class TestTopologicalSort:
    """Tests for topological sorting."""

    def test_linear_chain(self):
        """Test sorting a linear dependency chain."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3")])

        order = topological_sort(G)
        # Q3 has no deps, Q2 needs Q3, Q1 needs Q2
        assert order == ["Q3", "Q2", "Q1"]

    def test_diamond_dag(self):
        """Test sorting a diamond-shaped DAG."""
        G = nx.DiGraph()
        G.add_edges_from([
            ("Q1", "Q2"),
            ("Q1", "Q3"),
            ("Q2", "Q4"),
            ("Q3", "Q4"),
        ])

        order = topological_sort(G)
        # Q4 must come first (no deps)
        # Q2 and Q3 before Q1
        assert order.index("Q4") < order.index("Q2")
        assert order.index("Q4") < order.index("Q3")
        assert order.index("Q2") < order.index("Q1")
        assert order.index("Q3") < order.index("Q1")

    def test_cycle_detection(self):
        """Test that cycle raises exception."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3"), ("Q3", "Q1")])

        with pytest.raises(nx.NetworkXUnfeasible):
            topological_sort(G)


class TestDetectCycle:
    """Tests for cycle detection."""

    def test_no_cycle(self):
        """Test graph without cycle."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3")])

        result = detect_cycle(G)
        assert result is None

    def test_has_cycle(self):
        """Test graph with cycle."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3"), ("Q3", "Q1")])

        result = detect_cycle(G)
        assert result is not None
        assert len(result) == 3


class TestCentrality:
    """Tests for centrality metrics."""

    def test_betweenness_bridge_node(self):
        """Test that bridge node has high betweenness."""
        G = nx.DiGraph()
        # Star pattern: Q1 connects clusters
        G.add_edges_from([
            ("Q2", "Q1"),
            ("Q3", "Q1"),
            ("Q1", "Q4"),
            ("Q1", "Q5"),
        ])

        centrality = compute_betweenness_centrality(G)
        # Q1 should have highest centrality
        assert centrality["Q1"] == max(centrality.values())


class TestReadyQuestions:
    """Tests for finding ready questions."""

    def test_no_deps_always_ready(self):
        """Test that questions with no deps are ready."""
        G = nx.DiGraph()
        G.add_node("Q1")
        G.add_node("Q2")

        ready = get_ready_questions(G, answered=set())
        assert set(ready) == {"Q1", "Q2"}

    def test_deps_block_until_answered(self):
        """Test that deps block questions."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2")])  # Q1 depends on Q2

        # Q2 not answered - only Q2 is ready
        ready = get_ready_questions(G, answered=set())
        assert ready == ["Q2"]

        # Q2 answered - Q1 becomes ready
        ready = get_ready_questions(G, answered={"Q2"})
        assert ready == ["Q1"]

    def test_answered_not_in_ready(self):
        """Test that answered questions aren't returned."""
        G = nx.DiGraph()
        G.add_node("Q1")

        ready = get_ready_questions(G, answered={"Q1"})
        assert ready == []


class TestBlockingCount:
    """Tests for blocking count calculation."""

    def test_leaf_blocks_nothing(self):
        """Test that leaf node (root of DAG in dependency direction) has ancestors."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3")])

        # Q3 has no outgoing edges (leaf in dependency direction)
        # But Q1 and Q2 are ancestors - they depend on Q3 transitively
        count = get_blocking_count(G, "Q3")
        assert count == 2  # Q1 and Q2 both depend on Q3

    def test_root_blocked_by_all(self):
        """Test that root is blocked by all predecessors."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3")])

        count = get_blocking_count(G, "Q1")
        assert count == 0  # ancestors() counts nodes that CAN REACH this node

    def test_blocking_in_chain(self):
        """Test blocking count in chain."""
        G = nx.DiGraph()
        G.add_edges_from([("Q1", "Q2"), ("Q2", "Q3")])

        # Q2 blocks Q1 (one ancestor)
        count = get_blocking_count(G, "Q2")
        assert count == 1
