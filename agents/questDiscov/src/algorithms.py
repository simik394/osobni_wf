"""Graph algorithms for question prioritization.

Implements topological sorting, centrality metrics, and dependency analysis.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import networkx as nx

if TYPE_CHECKING:
    from .graph import Question


def build_networkx_graph(
    questions: list["Question"],
    dependencies: list[tuple[str, str]],
) -> nx.DiGraph:
    """Convert FalkorDB data to NetworkX for algorithm execution.

    Args:
        questions: List of Question objects
        dependencies: List of (from_id, to_id) tuples

    Returns:
        NetworkX directed graph
    """
    G = nx.DiGraph()

    # Add nodes with attributes
    for q in questions:
        G.add_node(
            q.id,
            text=q.text,
            answered=q.answered,
            entropy=q.entropy,
            centrality=q.centrality,
        )

    # Add edges (from depends on to)
    for from_id, to_id in dependencies:
        G.add_edge(from_id, to_id)

    return G


def topological_sort(graph: nx.DiGraph) -> list[str]:
    """Return questions in valid dependency order using Kahn's algorithm.

    Questions are ordered such that dependencies come before dependents.

    Args:
        graph: NetworkX directed graph

    Returns:
        List of question IDs in topological order

    Raises:
        nx.NetworkXUnfeasible: If the graph contains a cycle
    """
    try:
        # NetworkX topological_sort returns nodes in order where
        # for every edge (u, v), u comes before v
        # Since our edges are "from DEPENDS_ON to", we want to reverse
        # so that prerequisites come first
        order = list(nx.topological_sort(graph))
        # Reverse because we want dependencies first
        return list(reversed(order))
    except nx.NetworkXUnfeasible as e:
        raise nx.NetworkXUnfeasible(
            "Graph contains a cycle - cannot determine valid order"
        ) from e


def detect_cycle(graph: nx.DiGraph) -> list[str] | None:
    """Detect if graph has a cycle.

    Returns:
        List of node IDs forming a cycle, or None if no cycle exists
    """
    try:
        cycle = nx.find_cycle(graph)
        return [edge[0] for edge in cycle]
    except nx.NetworkXNoCycle:
        return None


def compute_betweenness_centrality(
    graph: nx.DiGraph,
    normalized: bool = True,
) -> dict[str, float]:
    """Compute betweenness centrality for all nodes.

    Betweenness centrality measures how often a node lies on shortest paths
    between other nodes. High betweenness = "bridge" between knowledge domains.

    Args:
        graph: NetworkX directed graph
        normalized: Whether to normalize values to [0, 1]

    Returns:
        Dict mapping node ID to centrality score
    """
    return nx.betweenness_centrality(graph, normalized=normalized)


def compute_in_degree_centrality(graph: nx.DiGraph) -> dict[str, float]:
    """Compute in-degree centrality (how many questions depend on this one).

    High in-degree = many things depend on this question being answered.

    Returns:
        Dict mapping node ID to normalized in-degree
    """
    return nx.in_degree_centrality(graph)


def compute_out_degree_centrality(graph: nx.DiGraph) -> dict[str, float]:
    """Compute out-degree centrality (how many dependencies this question has).

    High out-degree = this question has many prerequisites.

    Returns:
        Dict mapping node ID to normalized out-degree
    """
    return nx.out_degree_centrality(graph)


def get_ready_questions(
    graph: nx.DiGraph,
    answered: set[str],
) -> list[str]:
    """Return questions with all dependencies satisfied.

    A question is "ready" if:
    1. It is not answered
    2. All its dependencies (successors in our graph) are answered

    Args:
        graph: NetworkX directed graph
        answered: Set of answered question IDs

    Returns:
        List of question IDs that are ready to work on
    """
    ready = []

    for node in graph.nodes():
        # Skip if already answered
        if node in answered:
            continue

        # Get dependencies (nodes this one points to)
        dependencies = set(graph.successors(node))

        # Ready if all dependencies are answered
        if dependencies.issubset(answered):
            ready.append(node)

    return ready


def get_blocking_count(graph: nx.DiGraph, question_id: str) -> int:
    """Count how many unanswered questions are blocked by this one.

    This is the number of nodes that have a path from them to this node.

    Args:
        graph: NetworkX directed graph
        question_id: The question to analyze

    Returns:
        Number of questions that depend (directly or indirectly) on this one
    """
    # Find all nodes that can reach this node
    ancestors = nx.ancestors(graph, question_id)
    return len(ancestors)


def get_dependency_depth(graph: nx.DiGraph, question_id: str) -> int:
    """Get the longest path from this node to a leaf (no dependencies).

    Higher depth = more prerequisites to satisfy first.

    Returns:
        Maximum path length to a node with no outgoing edges
    """
    if not graph.has_node(question_id):
        return 0

    # Get all paths from this node
    successors = list(graph.successors(question_id))
    if not successors:
        return 0

    max_depth = 0
    for succ in successors:
        depth = get_dependency_depth(graph, succ)
        max_depth = max(max_depth, depth + 1)

    return max_depth
