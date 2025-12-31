"""
Solver Matcher - PM Agent Phase 1

Matches tasks to solvers based on (priority order):
1. Task complexity/size → Bigger tasks need more capable solvers
2. Current availability + Historical success → What's available + what worked
3. Explicit tags in YouTrack → Manual override

Reference: SOLVER_REGISTRY.md
"""

import json
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path
from models import Task


@dataclass
class SolverMatch:
    solver: str
    confidence: float  # 0-1
    reason: str
    fallback: Optional[str] = None  # Alternative if primary unavailable


@dataclass
class SolverCapability:
    """Solver with its capabilities and constraints"""
    name: str
    max_complexity: int  # 1-10, higher = can handle more complex tasks
    concurrency: int  # Max parallel sessions
    strengths: list[str] = field(default_factory=list)
    
    
# Solver capabilities (from SOLVER_REGISTRY.md)
SOLVERS = {
    'local-slm': SolverCapability(
        name='local-slm',
        max_complexity=3,  # Simple tasks only
        concurrency=999,   # Unlimited
        strengths=['quick', 'simple', 'offline'],
    ),
    'gemini': SolverCapability(
        name='gemini',
        max_complexity=7,  # Analysis, planning
        concurrency=10,    # Rate limited
        strengths=['analysis', 'planning', 'docs'],
    ),
    'perplexity': SolverCapability(
        name='perplexity',
        max_complexity=5,  # Research tasks
        concurrency=1,
        strengths=['research', 'web'],
    ),
    'angrav': SolverCapability(
        name='angrav',
        max_complexity=6,  # Browser automation
        concurrency=3,
        strengths=['automation', 'browser'],
    ),
    'jules': SolverCapability(
        name='jules',
        max_complexity=10,  # Full implementation
        concurrency=15,
        strengths=['code', 'implementation', 'refactor'],
    ),
}


def estimate_complexity(task: Task) -> int:
    """
    Estimate task complexity on 1-10 scale.
    
    Based on:
    - Estimate hours (more hours = higher complexity)
    - Number of files affected
    - Priority (higher priority often means more critical/complex)
    """
    complexity = 1
    
    # Estimate hours → complexity
    hours = task.estimate_hours
    if hours <= 1:
        complexity = 2
    elif hours <= 4:
        complexity = 4
    elif hours <= 8:
        complexity = 6
    elif hours <= 16:
        complexity = 8
    else:
        complexity = 10
    
    # Files affected boost
    if len(task.affected_files) > 5:
        complexity = min(10, complexity + 2)
    elif len(task.affected_files) > 2:
        complexity = min(10, complexity + 1)
    
    # Priority boost
    priority_boost = {
        'SHOW_STOPPER': 2,
        'CRITICAL': 1,
        'MAJOR': 0,
        'NORMAL': 0,
        'MINOR': -1,
    }
    complexity = max(1, min(10, complexity + priority_boost.get(task.priority.name, 0)))
    
    return complexity


def check_availability(solver_name: str) -> bool:
    """
    Check if solver is currently available.
    
    Current status:
    - perplexity: UNAVAILABLE (no subscription)
    - others: available
    
    TODO: Integrate with Redis rate limit storage
    """
    # Solvers currently unavailable
    UNAVAILABLE = {
        'perplexity',  # No subscription
    }
    
    if solver_name in UNAVAILABLE:
        return False
    
    # In production: also check Redis for rate limits
    return True


def get_historical_success(solver_name: str, task: Task) -> float:
    """
    Get historical success rate for this solver on similar tasks.
    
    Returns: 0-1 score (higher = better performance)
    
    Uses actual completion history for calibration.
    """
    try:
        from history_tracker import load_history, calculate_calibration
        
        completions = load_history()
        if len(completions) < 3:
            return 0.7  # Default when insufficient data
        
        stats = calculate_calibration(completions)
        
        # Get solver-specific ratio
        if solver_name in stats.by_solver:
            ratio = stats.by_solver[solver_name]
            
            # Convert ratio to score (closer to 1.0 = better)
            # ratio < 1: faster than expected = good
            # ratio > 1: slower than expected = less good
            if ratio <= 1.0:
                score = 0.8 + (1.0 - ratio) * 0.2  # 0.8-1.0
            else:
                score = max(0.3, 0.8 - (ratio - 1.0) * 0.3)  # 0.3-0.8
            
            return score
        
        return 0.7  # Default for unknown solver
        
    except Exception:
        return 0.7  # Default on any error


def extract_tags(issue: dict) -> list[str]:
    """Extract solver hint tags from YouTrack issue"""
    # Look for tags like #jules, #angrav, #gemini, etc.
    tags = []
    
    # Check if tags field exists
    if 'tags' in issue:
        for tag in issue.get('tags', []):
            tag_name = tag.get('name', '') if isinstance(tag, dict) else tag
            if tag_name.startswith('#'):
                tags.append(tag_name[1:])
            elif tag_name in SOLVERS:
                tags.append(tag_name)
    
    # Also check description for #solver mentions
    description = issue.get('description', '') or ''
    for solver in SOLVERS:
        if f'#{solver}' in description.lower():
            tags.append(solver)
    
    return list(set(tags))


def match_solver(
    task: Task,
    issue: dict = None,
    require_available: bool = True
) -> SolverMatch:
    """
    Match a task to the most appropriate solver.
    
    Priority:
    1. Explicit tags (manual override)
    2. Complexity-based matching
    3. Historical success rate
    4. Availability check
    """
    issue = issue or {}
    
    # 1. Check for explicit tags (highest priority override)
    explicit_tags = extract_tags(issue)
    if explicit_tags:
        for tag in explicit_tags:
            if tag in SOLVERS:
                if not require_available or check_availability(tag):
                    return SolverMatch(
                        solver=tag,
                        confidence=1.0,
                        reason=f'explicit tag #{tag}',
                        fallback=None,
                    )
    
    # 2. Estimate task complexity
    complexity = estimate_complexity(task)
    
    # 3. Find solvers that can handle this complexity
    capable_solvers = [
        (name, cap) for name, cap in SOLVERS.items()
        if cap.max_complexity >= complexity
    ]
    
    if not capable_solvers:
        # Fallback to most capable
        capable_solvers = [('jules', SOLVERS['jules'])]
    
    # 4. Filter by availability
    if require_available:
        available_solvers = [
            (name, cap) for name, cap in capable_solvers
            if check_availability(name)
        ]
        if available_solvers:
            capable_solvers = available_solvers
    
    # 5. Score by historical success + complexity fit
    scored = []
    for name, cap in capable_solvers:
        history_score = get_historical_success(name, task)
        
        # Prefer solvers closest to required complexity (don't overkill)
        complexity_fit = 1 - abs(cap.max_complexity - complexity) / 10
        
        total_score = history_score * 0.6 + complexity_fit * 0.4
        scored.append((name, total_score, cap))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    
    best_name, best_score, best_cap = scored[0]
    fallback = scored[1][0] if len(scored) > 1 else None
    
    return SolverMatch(
        solver=best_name,
        confidence=best_score,
        reason=f'complexity {complexity}/10 → {best_name} (max: {best_cap.max_complexity})',
        fallback=fallback,
    )


def match_all(
    tasks: list[Task],
    issues: list[dict] = None
) -> list[tuple[Task, SolverMatch]]:
    """Match all tasks to solvers"""
    issues = issues or []
    issue_map = {i.get('id', ''): i for i in issues}
    
    results = []
    for task in tasks:
        issue = issue_map.get(task.id, {})
        match = match_solver(task, issue)
        results.append((task, match))
    
    return results


def format_matches(matches: list[tuple[Task, SolverMatch]]) -> str:
    """Format matches for display"""
    lines = []
    lines.append("## Solver Matching Results")
    lines.append("")
    lines.append("| Task | Complexity | Solver | Confidence | Reason |")
    lines.append("|------|------------|--------|------------|--------|")
    
    for task, match in matches:
        complexity = estimate_complexity(task)
        conf = f"{match.confidence:.0%}"
        fallback = f" (fallback: {match.fallback})" if match.fallback else ""
        lines.append(f"| {task.id} | {complexity}/10 | **{match.solver}** | {conf} | {match.reason}{fallback} |")
    
    lines.append("")
    
    # Summary by solver
    by_solver: dict[str, int] = {}
    for _, match in matches:
        by_solver[match.solver] = by_solver.get(match.solver, 0) + 1
    
    lines.append("### Summary")
    for solver, count in sorted(by_solver.items(), key=lambda x: -x[1]):
        lines.append(f"- **{solver}**: {count} tasks")
    
    return "\n".join(lines)


# CLI integration
def cmd_match(args):
    """Match tasks to solvers"""
    from youtrack_client import fetch_project_tasks
    
    issues = []
    
    if hasattr(args, 'issues_file') and args.issues_file:
        data = json.loads(Path(args.issues_file).read_text())
        issues = data if isinstance(data, list) else data.get('issuesPage', [])
    else:
        print("Usage: python cli.py match -p PROJECT -f issues.json")
        return
    
    tasks, _ = fetch_project_tasks(args.project, issues=issues)
    
    if not tasks:
        print("No tasks found")
        return
    
    matches = match_all(tasks, issues)
    print(format_matches(matches))
    
    if args.json:
        output = [
            {
                'task_id': task.id,
                'summary': task.summary,
                'complexity': estimate_complexity(task),
                'solver': match.solver,
                'confidence': match.confidence,
                'reason': match.reason,
                'fallback': match.fallback,
            }
            for task, match in matches
        ]
        print()
        print(json.dumps(output, indent=2))
