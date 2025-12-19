"""CLI interface for questDiscov."""

from __future__ import annotations

import asyncio
import json
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .agent import run_agent_sync
from .algorithms import build_networkx_graph, compute_betweenness_centrality, get_blocking_count
from .graph import get_graph
from .priority import compute_all_priorities

app = typer.Typer(
    name="questDiscov",
    help="Research question prioritization agent",
    add_completion=False,
)
console = Console()


@app.command()
def status():
    """Show graph statistics."""
    try:
        graph = get_graph()
        stats = graph.stats()

        table = Table(title="questDiscov Status")
        table.add_column("Metric", style="cyan")
        table.add_column("Value", style="green")

        table.add_row("Questions", str(stats["questions"]))
        table.add_row("Dependencies", str(stats["dependencies"]))
        table.add_row("Answered", str(stats["answered"]))
        table.add_row(
            "Unanswered",
            str(stats["questions"] - stats["answered"]),
        )

        console.print(table)
    except Exception as e:
        console.print(f"[red]Error connecting to graph: {e}[/red]")
        console.print("[dim]Make sure FalkorDB is running[/dim]")


@app.command()
def add(
    text: str = typer.Argument(..., help="Question text"),
    question_id: Optional[str] = typer.Option(None, "--id", help="Custom question ID"),
    depends_on: Optional[list[str]] = typer.Option(
        None, "--depends-on", "-d", help="IDs of questions this depends on"
    ),
):
    """Add a new research question."""
    try:
        graph = get_graph()
        qid = graph.add_question(text, question_id=question_id)

        console.print(f"[green]Created question:[/green] {qid}")
        console.print(f"[dim]{text}[/dim]")

        if depends_on:
            for dep_id in depends_on:
                success = graph.add_dependency(qid, dep_id)
                if success:
                    console.print(f"  [cyan]→ depends on {dep_id}[/cyan]")
                else:
                    console.print(f"  [red]Failed to add dependency to {dep_id}[/red]")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@app.command()
def answer(question_id: str = typer.Argument(..., help="Question ID to mark answered")):
    """Mark a question as answered."""
    try:
        graph = get_graph()
        q = graph.get_question(question_id)

        if not q:
            console.print(f"[red]Question {question_id} not found[/red]")
            return

        success = graph.mark_answered(question_id)
        if success:
            console.print(f"[green]Marked as answered:[/green] {question_id}")
            console.print(f"[dim]{q.text}[/dim]")
        else:
            console.print(f"[red]Failed to update {question_id}[/red]")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@app.command()
def prioritize(
    top: int = typer.Option(5, "--top", "-n", help="Number of top questions to show"),
    use_llm: bool = typer.Option(False, "--llm", help="Use LLM for entropy estimation"),
    obsidian: bool = typer.Option(False, "--obsidian", help="Sync to Obsidian"),
):
    """Compute and display top priority questions."""
    try:
        graph = get_graph()

        questions = graph.get_unanswered()
        if not questions:
            console.print("[yellow]No unanswered questions[/yellow]")
            return

        all_questions = graph.get_all_questions()
        dependencies = graph.get_dependencies()

        # Build graph and compute metrics
        nx_graph = build_networkx_graph(all_questions, dependencies)
        centrality_scores = compute_betweenness_centrality(nx_graph)
        blocking_counts = {q.id: get_blocking_count(nx_graph, q.id) for q in questions}

        # Compute priorities
        prioritized = asyncio.run(
            compute_all_priorities(
                questions, centrality_scores, blocking_counts, use_llm=use_llm
            )
        )

        # Update graph
        for pq in prioritized:
            graph.update_scores(
                pq.id,
                entropy=pq.entropy,
                centrality=pq.centrality,
                priority=pq.priority_score,
            )

        # Display
        table = Table(title=f"Top {top} Priority Questions")
        table.add_column("#", style="bold")
        table.add_column("ID", style="cyan")
        table.add_column("Question")
        table.add_column("Priority", style="green")
        table.add_column("Details", style="dim")

        for i, pq in enumerate(prioritized[:top]):
            details = f"E:{pq.entropy:.2f} C:{pq.centrality:.2f}"
            if pq.blocking_count > 0:
                details += f" B:{pq.blocking_count}"
            table.add_row(
                str(i + 1),
                pq.id,
                pq.text[:60] + "..." if len(pq.text) > 60 else pq.text,
                f"{pq.priority_score:.3f}",
                details,
            )

        console.print(table)

        # Obsidian sync
        if obsidian:
            from .tools.obsidian_tools import format_priorities_markdown, write_priorities

            priorities_data = [
                {
                    "rank": i + 1,
                    "id": pq.id,
                    "text": pq.text,
                    "priority_score": pq.priority_score,
                    "entropy": pq.entropy,
                    "centrality": pq.centrality,
                    "blocking_count": pq.blocking_count,
                    "explanation": pq.explanation,
                }
                for i, pq in enumerate(prioritized[:top])
            ]
            md = format_priorities_markdown(priorities_data)
            result = write_priorities.invoke({
                "priorities_markdown": md,
                "file_path": "Research_Priorities.md",
            })
            console.print(f"[cyan]{result}[/cyan]")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        raise


@app.command()
def chat(query: str = typer.Argument(..., help="Question for the agent")):
    """Chat with the agent about your research."""
    try:
        console.print(f"[dim]Thinking...[/dim]")
        response = run_agent_sync(query)
        console.print(Panel(response, title="questDiscov Agent", border_style="green"))
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@app.command("list")
def list_questions(
    all: bool = typer.Option(False, "--all", "-a", help="Show all including answered"),
):
    """List all questions in the graph."""
    try:
        graph = get_graph()

        if all:
            questions = graph.get_all_questions()
        else:
            questions = graph.get_unanswered()

        if not questions:
            console.print("[yellow]No questions found[/yellow]")
            return

        table = Table(title="Questions")
        table.add_column("ID", style="cyan")
        table.add_column("Question")
        table.add_column("Status")
        table.add_column("Priority", style="green")

        for q in questions:
            status = "[green]✓[/green]" if q.answered else "[yellow]○[/yellow]"
            priority = f"{q.priority:.3f}" if q.priority else "-"
            table.add_row(
                q.id,
                q.text[:50] + "..." if len(q.text) > 50 else q.text,
                status,
                priority,
            )

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@app.command()
def deps(question_id: Optional[str] = typer.Argument(None, help="Show deps for specific ID")):
    """Show dependency relationships."""
    try:
        graph = get_graph()
        deps = graph.get_dependencies()

        if not deps:
            console.print("[yellow]No dependencies defined[/yellow]")
            return

        if question_id:
            # Filter to specific question
            deps = [d for d in deps if question_id in d]

        table = Table(title="Dependencies")
        table.add_column("Question", style="cyan")
        table.add_column("→", style="dim")
        table.add_column("Depends On", style="yellow")

        for from_id, to_id in deps:
            table.add_row(from_id, "→", to_id)

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


def main():
    """Entry point for the CLI."""
    app()


if __name__ == "__main__":
    main()
