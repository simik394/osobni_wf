"""
Multi-Objective Task Planner using OR-Tools

Uses CP-SAT solver for:
- Dependency-aware scheduling
- Multi-objective optimization (speed vs coverage)
- Pareto frontier generation
- Parallel batch selection with conflict detection

No LLM required - pure algorithmic solution.
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import json


class Priority(Enum):
    SHOW_STOPPER = 5
    CRITICAL = 4
    MAJOR = 3
    NORMAL = 2
    MINOR = 1


@dataclass
class Task:
    id: str
    summary: str
    goal_id: str
    priority: Priority = Priority.NORMAL
    estimate_hours: int = 4
    depends_on: list[str] = field(default_factory=list)
    blocks: list[str] = field(default_factory=list)
    affected_files: list[str] = field(default_factory=list)
    solver_hint: Optional[str] = None  # angrav, jules, gemini, etc.
    due_date: Optional[str] = None


@dataclass
class Goal:
    id: str
    name: str
    priority: int = 1  # Higher = more important
    tasks: list[str] = field(default_factory=list)


@dataclass
class PlanPath:
    """A possible execution path"""
    task_sequence: list[str]  # Ordered task IDs
    total_hours: int
    goals_completed: list[str]
    goals_partial: list[str]  # Goals with some tasks done
    
    # Multi-objective scores (all 0-100, higher = better)
    speed_score: float  # Inverse of duration
    coverage_score: float  # Goals completed
    urgency_score: float  # Deadline alignment
    
    def dominates(self, other: 'PlanPath') -> bool:
        """True if self is better in at least one dimension and not worse in any"""
        dominated = False
        for self_val, other_val in [
            (self.speed_score, other.speed_score),
            (self.coverage_score, other.coverage_score),
            (self.urgency_score, other.urgency_score),
        ]:
            if self_val < other_val:
                return False  # Worse in one dimension
            if self_val > other_val:
                dominated = True
        return dominated


@dataclass 
class PlanRequest:
    """Input for the planner"""
    tasks: list[Task]
    goals: list[Goal]
    available_hours: int = 40  # Weekly capacity
    max_parallel: int = 15  # Jules slots
    objective_weights: dict = field(default_factory=lambda: {
        'speed': 1.0,
        'coverage': 1.0, 
        'urgency': 1.0
    })


@dataclass
class PlanResult:
    """Output from the planner"""
    pareto_paths: list[PlanPath]  # Non-dominated solutions
    recommended_path: PlanPath  # Best by weighted sum
    immediate_batch: list[str]  # Tasks to dispatch now (no conflicts)
    explanation: str  # Human-readable reasoning


def load_from_json(data: dict) -> PlanRequest:
    """Load PlanRequest from JSON"""
    tasks = [
        Task(
            id=t['id'],
            summary=t['summary'],
            goal_id=t['goal_id'],
            priority=Priority[t.get('priority', 'NORMAL').upper()],
            estimate_hours=t.get('estimate_hours', 4),
            depends_on=t.get('depends_on', []),
            blocks=t.get('blocks', []),
            affected_files=t.get('affected_files', []),
            solver_hint=t.get('solver_hint'),
            due_date=t.get('due_date'),
        )
        for t in data['tasks']
    ]
    
    goals = [
        Goal(
            id=g['id'],
            name=g['name'],
            priority=g.get('priority', 1),
            tasks=g.get('tasks', []),
        )
        for g in data['goals']
    ]
    
    return PlanRequest(
        tasks=tasks,
        goals=goals,
        available_hours=data.get('available_hours', 40),
        max_parallel=data.get('max_parallel', 15),
        objective_weights=data.get('objective_weights', {
            'speed': 1.0, 'coverage': 1.0, 'urgency': 1.0
        })
    )
