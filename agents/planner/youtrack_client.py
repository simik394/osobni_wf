"""
YouTrack Client for Task Planner

Uses subprocess to call the planner's MCP integration via a simple wrapper.
This avoids direct REST API complexity and reuses the existing MCP auth.
"""

import subprocess
import json
from dataclasses import dataclass
from typing import Optional
from models import Task, Goal, Priority


def map_priority(yt_priority: Optional[str]) -> Priority:
    """Map YouTrack priority to planner Priority"""
    if not yt_priority:
        return Priority.NORMAL
    mapping = {
        'Show-stopper': Priority.SHOW_STOPPER,
        'Critical': Priority.CRITICAL,
        'Major': Priority.MAJOR,
        'Normal': Priority.NORMAL,
        'Minor': Priority.MINOR,
    }
    return mapping.get(yt_priority, Priority.NORMAL)


def issue_to_task(issue: dict) -> Task:
    """Convert YouTrack issue dict to planner Task"""
    custom = issue.get('customFields', {})
    
    priority_str = custom.get('Priority')
    state = custom.get('State', '')
    
    # Default estimate
    estimate_hours = 4
    
    # Check if completed
    completed = state in ('Fixed', 'Verified', 'Done', 'Closed', 'Completed')
    
    return Task(
        id=issue.get('id', ''),
        summary=issue.get('summary', ''),
        goal_id='default',  # Will be updated if subtask
        priority=map_priority(priority_str),
        estimate_hours=estimate_hours,
        depends_on=[],  # Would need to fetch links
        blocks=[],
        affected_files=[],
        solver_hint=None,
    )


def fetch_issues_via_cli(project: str, include_resolved: bool = False) -> list[dict]:
    """
    Fetch issues by calling a CLI tool or direct YouTrack query
    Since we're in a Python context, we'll simulate the MCP response structure
    """
    # This would be replaced with actual MCP call in production
    # For now, return empty to allow manual JSON input
    print(f"   Note: Direct YouTrack fetch requires MCP context")
    print(f"   Use: python cli.py sync --project {project} --from-mcp")
    return []


def fetch_project_tasks(project: str, issues: list[dict] = None) -> tuple[list[Task], list[Goal]]:
    """
    Fetch all tasks and goals for a project
    
    Args:
        project: YouTrack project key
        issues: Pre-fetched issues (from MCP or manual)
    """
    if issues is None:
        issues = []
    
    if not issues:
        return [], []
    
    # Convert to tasks
    tasks = [issue_to_task(issue) for issue in issues]
    
    # Build reverse dependencies (who I block)
    task_ids = {t.id for t in tasks}
    for task in tasks:
        for other in tasks:
            if task.id in other.depends_on:
                task.blocks.append(other.id)
    
    # Group into goals (by parent or create default)
    goal_map: dict[str, list[str]] = {}
    for task in tasks:
        if task.goal_id not in goal_map:
            goal_map[task.goal_id] = []
        goal_map[task.goal_id].append(task.id)
    
    goals = [
        Goal(
            id=goal_id,
            name=goal_id,
            priority=1,
            tasks=t_ids,
        )
        for goal_id, t_ids in goal_map.items()
    ]
    
    return tasks, goals


def get_next_task(project: str, issues: list[dict] = None) -> Optional[dict]:
    """Get the recommended next task for a project"""
    from solver import TaskPlannerSolver
    from models import PlanRequest
    
    tasks, goals = fetch_project_tasks(project, issues=issues)
    
    if not tasks:
        return None
    
    request = PlanRequest(tasks=tasks, goals=goals)
    solver = TaskPlannerSolver(request)
    
    # Get highest value tasks that are not blocked
    top_tasks = solver.get_highest_value_tasks(limit=5)
    
    # Filter to only unblocked tasks
    for task_info in top_tasks:
        task = solver.tasks[task_info['task_id']]
        # Check if all dependencies are resolved
        unresolved_deps = [d for d in task.depends_on if d in solver.tasks]
        if not unresolved_deps:
            return task_info
    
    # If all are blocked, return highest value anyway
    return top_tasks[0] if top_tasks else None


# Configuration for external use
@dataclass
class YouTrackConfig:
    base_url: str = 'https://napoveda.youtrack.cloud'
    token: str = ''

