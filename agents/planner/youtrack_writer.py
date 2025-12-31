"""
YouTrack Writer - PM Agent Phase 2

Updates YouTrack issues based on planner recommendations:
- Add solver tags (#jules, #angrav, etc.)
- Update priority based on value score
- Mark issues as blocked/ready based on dependencies

Uses MCP (mcp_napovedayt) for all updates.
"""

import json
from dataclasses import dataclass
from typing import Optional, Callable
from models import Task
from solver_matcher import SolverMatch


@dataclass
class IssueUpdate:
    """Represents an update to be applied to a YouTrack issue"""
    issue_id: str
    add_tags: list[str] = None
    remove_tags: list[str] = None
    priority: Optional[str] = None
    state: Optional[str] = None
    comment: Optional[str] = None
    
    def __post_init__(self):
        self.add_tags = self.add_tags or []
        self.remove_tags = self.remove_tags or []


# Priority mapping from value score to YouTrack priority
VALUE_TO_PRIORITY = {
    (80, 100): 'Critical',
    (60, 80): 'Major',
    (40, 60): 'Normal',
    (20, 40): 'Minor',
    (0, 20): 'Minor',
}


def value_score_to_priority(value_score: float) -> str:
    """Convert value score (0-100) to YouTrack priority"""
    for (low, high), priority in VALUE_TO_PRIORITY.items():
        if low <= value_score < high:
            return priority
    return 'Normal'


def create_solver_update(
    task: Task,
    match: SolverMatch,
    value_score: float = None,
    is_blocked: bool = False
) -> IssueUpdate:
    """
    Create an IssueUpdate for a task based on solver matching.
    
    Args:
        task: The task being updated
        match: Solver match result
        value_score: Optional value-blocking score
        is_blocked: Whether task is blocked by dependencies
    """
    add_tags = []
    remove_tags = []
    
    # Add solver tag
    add_tags.append(match.solver)
    
    # Add confidence tag
    if match.confidence >= 0.7:
        add_tags.append('auto-dispatch')
    else:
        add_tags.append('review-dispatch')
    
    # Remove other solver tags (exclusive assignment)
    all_solvers = ['jules', 'angrav', 'gemini', 'perplexity', 'local-slm']
    for solver in all_solvers:
        if solver != match.solver:
            remove_tags.append(solver)
    
    # Priority from value score
    priority = None
    if value_score is not None:
        priority = value_score_to_priority(value_score)
    
    # State based on blocked status
    state = None
    if is_blocked:
        state = 'Blocked'
    
    # Comment with recommendation
    comment = f"🤖 PM Agent: Recommended solver **{match.solver}** ({match.confidence:.0%} confidence)\n"
    comment += f"Reason: {match.reason}"
    if match.fallback:
        comment += f"\nFallback: {match.fallback}"
    
    return IssueUpdate(
        issue_id=task.id,
        add_tags=add_tags,
        remove_tags=remove_tags,
        priority=priority,
        state=state,
        comment=comment,
    )


def format_updates(updates: list[IssueUpdate]) -> str:
    """Format updates for preview/approval"""
    lines = []
    lines.append("## Proposed YouTrack Updates")
    lines.append("")
    
    for update in updates:
        lines.append(f"### {update.issue_id}")
        
        if update.add_tags:
            lines.append(f"- **Add tags**: {', '.join(update.add_tags)}")
        if update.remove_tags:
            lines.append(f"- **Remove tags**: {', '.join(update.remove_tags)}")
        if update.priority:
            lines.append(f"- **Set priority**: {update.priority}")
        if update.state:
            lines.append(f"- **Set state**: {update.state}")
        if update.comment:
            lines.append(f"- **Add comment**: _{update.comment[:50]}..._")
        lines.append("")
    
    return "\n".join(lines)


# MCP-based update functions (to be called from CLI with MCP access)

def apply_tag_update(issue_id: str, tag: str, operation: str = 'add') -> dict:
    """
    Generate MCP call parameters for tag update.
    
    Returns dict compatible with mcp_napovedayt_manage_issue_tags
    """
    return {
        'issueId': issue_id,
        'tag': tag,
        'operation': operation,  # 'add' or 'remove'
    }


def apply_priority_update(issue_id: str, priority: str) -> dict:
    """
    Generate MCP call parameters for priority update.
    
    Returns dict compatible with mcp_napovedayt_update_issue
    """
    return {
        'issueId': issue_id,
        'customFields': {'Priority': priority},
    }


def apply_comment(issue_id: str, text: str) -> dict:
    """
    Generate MCP call parameters for adding a comment.
    
    Returns dict compatible with mcp_napovedayt_add_issue_comment
    """
    return {
        'issueId': issue_id,
        'text': text,
    }


def generate_mcp_calls(update: IssueUpdate) -> list[tuple[str, dict]]:
    """
    Generate list of MCP calls to apply an update.
    
    Returns: List of (mcp_function_name, parameters) tuples
    """
    calls = []
    
    # Tag updates
    for tag in update.add_tags:
        calls.append(('manage_issue_tags', apply_tag_update(update.issue_id, tag, 'add')))
    
    for tag in update.remove_tags:
        calls.append(('manage_issue_tags', apply_tag_update(update.issue_id, tag, 'remove')))
    
    # Priority update
    if update.priority:
        calls.append(('update_issue', apply_priority_update(update.issue_id, update.priority)))
    
    # Comment
    if update.comment:
        calls.append(('add_issue_comment', apply_comment(update.issue_id, update.comment)))
    
    return calls


# CLI integration
def cmd_apply(args):
    """Apply solver recommendations to YouTrack"""
    from pathlib import Path
    from youtrack_client import fetch_project_tasks
    from solver_matcher import match_all
    from solver import TaskPlannerSolver
    from models import PlanRequest
    
    issues = []
    
    if hasattr(args, 'issues_file') and args.issues_file:
        data = json.loads(Path(args.issues_file).read_text())
        issues = data if isinstance(data, list) else data.get('issuesPage', [])
    else:
        print("Usage: python cli.py apply -p PROJECT -f issues.json")
        return
    
    # Get tasks
    tasks, goals = fetch_project_tasks(args.project, issues=issues)
    
    if not tasks:
        print("No tasks found")
        return
    
    # Match solvers
    matches = match_all(tasks, issues)
    
    # Get value scores
    request = PlanRequest(tasks=tasks, goals=goals)
    solver = TaskPlannerSolver(request)
    value_impacts = solver.calculate_value_impact()
    
    # Generate updates
    updates = []
    for task, match in matches:
        value_score = value_impacts.get(task.id, {}).get('value_score', 50)
        
        # Check if blocked (has unresolved dependencies)
        is_blocked = any(dep in solver.tasks for dep in task.depends_on)
        
        update = create_solver_update(task, match, value_score, is_blocked)
        updates.append(update)
    
    # Preview
    print(format_updates(updates))
    
    # Generate MCP calls
    if args.execute:
        print("## MCP Calls to Execute")
        print("")
        for update in updates:
            calls = generate_mcp_calls(update)
            for func, params in calls:
                print(f"mcp_napovedayt_{func}({json.dumps(params)})")
            print("")
    else:
        print("---")
        print("Run with `--execute` to generate MCP call commands")
