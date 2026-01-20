"""CLI interface for the Proj agent.

Usage:
    proj capture "Buy groceries"
    proj inbox
    proj review
    proj chat
"""

import typer
from rich.console import Console
from rich.panel import Panel
from rich.markdown import Markdown
from langchain_core.messages import HumanMessage

from datetime import datetime
from proj.agent import get_graph, create_proj_graph
from proj.state import ProjState, Project, TaskStatus
from proj.persistence import get_store

app = typer.Typer(help="Personal project management agent")
console = Console()

# Shared state (loaded from persistence)
_state: ProjState | None = None


def get_state() -> ProjState:
    """Get or load state from persistence."""
    global _state
    if _state is None:
        store = get_store()
        _state = store.load_state()
        console.print("[dim]State loaded from FalkorDB[/dim]" if store._use_falkor else "[dim]State loaded from JSON[/dim]")
    return _state


def save_state() -> None:
    """Save current state to persistence."""
    global _state
    if _state is not None:
        store = get_store()
        store.save_state(_state)


@app.command()
def capture(content: str):
    """Capture a task, idea, or note to inbox."""
    state = get_state()
    graph = get_graph()
    
    # Add user message
    state.messages.append(HumanMessage(content=f"capture: {content}"))
    
    # Run graph
    result = graph.invoke(state)
    
    # Update state
    global _state
    _state = ProjState(**result)
    
    # Show response
    if result.get("messages"):
        last_msg = result["messages"][-1]
        content = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
        console.print(Panel(content, title="Captured", border_style="green"))
    
    save_state()


@app.command()
def inbox():
    """View and triage inbox items."""
    state = get_state()
    graph = get_graph()
    
    state.messages.append(HumanMessage(content="triage inbox"))
    result = graph.invoke(state)
    
    global _state
    _state = ProjState(**result)
    
    if result.get("messages"):
        last_msg = result["messages"][-1]
        content = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
        console.print(Markdown(content))


@app.command()
def review():
    """Show today's priorities and review."""
    state = get_state()
    graph = get_graph()
    
    state.messages.append(HumanMessage(content="review my priorities"))
    result = graph.invoke(state)
    
    global _state
    _state = ProjState(**result)
    
    if result.get("messages"):
        last_msg = result["messages"][-1]
        content = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
        console.print(Markdown(content))


@app.command()
def resume(project: str | None = None):
    """Resume work on a project with context restoration."""
    state = get_state()
    graph = get_graph()
    
    if project:
        # Find project by name
        for p in state.projects.values():
            if p.name.lower() == project.lower():
                state.active_project_id = p.id
                break
    
    state.messages.append(HumanMessage(content="resume where I left off"))
    result = graph.invoke(state)
    
    global _state
    _state = ProjState(**result)
    
    if result.get("messages"):
        last_msg = result["messages"][-1]
        content = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
        console.print(Markdown(content))


@app.command()
def projects():
    """List all projects."""
    state = get_state()
    
    if not state.projects:
        console.print("[dim]No projects yet. Create one with:[/dim]")
        console.print("  proj create-project 'My Project'")
        return
    
    for p in state.projects.values():
        task_count = len([t for t in state.tasks.values() if t.project_id == p.id])
        console.print(f"• [bold]{p.name}[/bold] ({task_count} tasks) [{p.status.value}]")


@app.command(name="create-project")
def create_project(name: str, description: str | None = None):
    """Create a new project."""
    state = get_state()
    
    project = Project(name=name, description=description)
    state.projects[project.id] = project
    save_state()
    
    console.print(f"✅ Created project: [bold]{name}[/bold]")


@app.command()
def chat(message: str):
    """Chat with the proj agent."""
    state = get_state()
    graph = get_graph()
    
    state.messages.append(HumanMessage(content=message))
    result = graph.invoke(state)
    
    global _state
    _state = ProjState(**result)
    
    if result.get("messages"):
        last_msg = result["messages"][-1]
        content = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
        console.print(Markdown(content))


@app.command()
def status():
    """Show current agent status."""
    state = get_state()
    
    console.print(Panel(f"""
📁 Projects: {len(state.projects)}
✅ Tasks: {len(state.tasks)}
📥 Inbox: {len(state.inbox)}
🎯 Active: {state.active_project_id or 'None'}
    """.strip(), title="Status"))


@app.command()
def start(task_id: str):
    """Start working on a task."""
    state = get_state()

    if task_id not in state.tasks:
        console.print(f"❌ Task '{task_id}' not found.")
        raise typer.Exit(1)

    task = state.tasks[task_id]
    task.status = TaskStatus.IN_PROGRESS
    task.started_at = datetime.now()

    save_state()

    console.print(f"🚀 Started task: [bold]{task.title}[/bold]")


@app.command()
def complete(task_id: str):
    """Complete a task."""
    state = get_state()

    if task_id not in state.tasks:
        console.print(f"❌ Task '{task_id}' not found.")
        raise typer.Exit(1)

    task = state.tasks[task_id]
    task.status = TaskStatus.DONE
    task.completed_at = datetime.now()

    if task.started_at:
        duration = task.completed_at - task.started_at
        task.actual_duration_minutes = round(duration.total_seconds() / 60)

    save_state()

    console.print(f"✅ Completed task: [bold]{task.title}[/bold]")


if __name__ == "__main__":
    app()
