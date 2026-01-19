"""State models for the Proj agent.

This module defines the core data models and state schema for the
personal project management agent.
"""

from datetime import datetime
from enum import Enum
from typing import Annotated, Any
from pydantic import BaseModel, Field
from langgraph.graph.message import add_messages


class TaskStatus(str, Enum):
    """Task lifecycle status."""
    INBOX = "inbox"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    ARCHIVED = "archived"


class ProjectStatus(str, Enum):
    """Project lifecycle status."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class EnergyLevel(str, Enum):
    """Task energy requirement."""
    HIGH = "high"      # Deep work, creative
    MEDIUM = "medium"  # Standard tasks
    LOW = "low"        # Administrative, mechanical
    ANY = "any"        # Flexible


class Task(BaseModel):
    """A single actionable task."""
    id: str = Field(default_factory=lambda: f"task_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    title: str
    description: str | None = None
    project_id: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: int = 2  # 1=high, 2=medium, 3=low
    energy: EnergyLevel = EnergyLevel.MEDIUM
    due_date: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    tags: list[str] = Field(default_factory=list)
    blocked_by: str | None = None  # Task ID or description
    notes: str | None = None


class InboxItem(BaseModel):
    """Raw captured item before triage."""
    id: str = Field(default_factory=lambda: f"inbox_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    content: str
    source: str = "manual"  # manual, voice, link, etc.
    captured_at: datetime = Field(default_factory=datetime.now)
    context: dict[str, Any] = Field(default_factory=dict)  # Additional metadata


class Project(BaseModel):
    """A project containing related tasks."""
    id: str = Field(default_factory=lambda: f"proj_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    name: str
    description: str | None = None
    status: ProjectStatus = ProjectStatus.ACTIVE
    goal: str | None = None  # What does "done" look like?
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    last_accessed: datetime = Field(default_factory=datetime.now)
    importance: int = Field(default=5, ge=1, le=10)  # 1-10 scale
    decay_rate: float = Field(default=0.05)  # Daily decay factor
    energy_level: EnergyLevel = EnergyLevel.MEDIUM
    tags: list[str] = Field(default_factory=list)
    # Context restoration
    last_context: str | None = None  # Breadcrumb for resuming


class ContextBriefing(BaseModel):
    """Context restoration for project resume."""
    project_id: str
    absence_days: int
    summary: str
    in_progress: list[str]  # Task titles
    blockers: list[str]
    suggested_next: str | None = None


class ProjState(BaseModel):
    """Main state for the Proj agent graph.
    
    This is the shared state passed between all nodes in the LangGraph.
    """
    # Core data
    projects: dict[str, Project] = Field(default_factory=dict)
    tasks: dict[str, Task] = Field(default_factory=dict)
    inbox: list[InboxItem] = Field(default_factory=list)
    
    # Current context
    active_project_id: str | None = None
    current_task_id: str | None = None
    
    # Conversation history (for LLM)
    messages: Annotated[list, add_messages] = Field(default_factory=list)
    
    # Session metadata
    user_energy: EnergyLevel = EnergyLevel.MEDIUM
    last_interaction: datetime = Field(default_factory=datetime.now)
    
    # Agent routing
    next_agent: str | None = None  # Which sub-agent to route to
    
    class Config:
        arbitrary_types_allowed = True


def get_project_tasks(state: ProjState, project_id: str) -> list[Task]:
    """Get all tasks for a project."""
    return [t for t in state.tasks.values() if t.project_id == project_id]


def get_active_tasks(state: ProjState) -> list[Task]:
    """Get all non-archived, non-done tasks."""
    return [
        t for t in state.tasks.values()
        if t.status not in (TaskStatus.DONE, TaskStatus.ARCHIVED)
    ]


def get_inbox_count(state: ProjState) -> int:
    """Get number of items in inbox."""
    return len(state.inbox)
