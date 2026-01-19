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
from .models import Task
from .solver_registry import SOLVER_REGISTRY as SOLVERS, SolverCapability


@dataclass
class SolverMatch:
    solver: str
    confidence: float  # 0-1
    reason: str
    fallback: Optional[str] = None  # Alternative if primary unavailable


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
    
    Uses Redis rate limit storage from angrav.
    Falls back to static config if Redis unavailable.
    """
    # Static unavailable list
    STATIC_UNAVAILABLE = {
        'perplexity',  # No subscription
    }
    
    if solver_name in STATIC_UNAVAILABLE:
        return False
    
    # Try Redis check
    try:
        from availability_checker import check_solver_availability
        
        avail = check_solver_availability(solver_name)
        return avail.available
        
    except Exception:
        # Redis unavailable, assume available
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
    Match a task to the most appropriate solver using advanced routing.

    Matching Priority:
    1.  **Explicit Tags**: Manual override via YouTrack issue tags (e.g., `#jules`).
    2.  **Regex Match**: High-confidence match on task summary keywords.
    3.  **Capability Match**: Score based on file types, required tools, and tags.
    4.  **Complexity & Availability**: Filter by complexity and current availability.
    5.  **Historical Performance**: Final score weighted by historical success.
    """
    issue = issue or {}
    
    # 1. Check for explicit tags (highest priority)
    explicit_tags = extract_tags(issue)
    if explicit_tags:
        for tag in explicit_tags:
            if tag in SOLVERS and (not require_available or check_availability(tag)):
                return SolverMatch(
                    solver=tag,
                    confidence=1.0,
                    reason=f'explicit tag #{tag}',
                    fallback=None,
                )

    # 2. Regex-based matching from summary
    summary = task.summary
    for solver in SOLVERS.values():
        if solver.summary_regex and solver.summary_regex.search(summary):
            if not require_available or check_availability(solver.name):
                return SolverMatch(
                    solver=solver.name,
                    confidence=0.9,
                    reason=f"summary regex match on '{solver.summary_regex.pattern}'",
                    fallback=None,
                )

    # 3. If no regex match, score by capability
    complexity = estimate_complexity(task)
    
    # Filter by complexity and availability first
    candidate_solvers = [
        s for s in SOLVERS.values()
        if s.max_complexity >= complexity
    ]
    if require_available:
        candidate_solvers = [s for s in candidate_solvers if check_availability(s.name)]

    if not candidate_solvers:
        # Fallback to most capable if no candidates found
        return SolverMatch(solver='jules', confidence=0.3, reason='fallback to most capable', fallback='gemini')

    # Score remaining candidates
    scored = []
    for solver in candidate_solvers:
        # Capability score (file types, tools)
        cap_score = 0.0
        # Check file type support
        if solver.supported_file_types:
            affected_exts = {Path(f).suffix for f in task.affected_files if Path(f).suffix}
            if affected_exts and any(ext in solver.supported_file_types for ext in affected_exts):
                cap_score += 0.4
        
        # Add other capability checks here in the future (e.g., required_tools)

        # Historical performance score
        history_score = get_historical_success(solver.name, task)

        # Complexity fit (prefer solvers closer to the task complexity)
        complexity_fit = 1 - abs(solver.max_complexity - complexity) / 10

        # Weighted final score
        total_score = (cap_score * 0.3) + (history_score * 0.4) + (complexity_fit * 0.3)
        scored.append((solver, total_score))

    scored.sort(key=lambda x: x[1], reverse=True)

    best_solver, best_score = scored[0]
    fallback_solver = scored[1][0] if len(scored) > 1 else None

    return SolverMatch(
        solver=best_solver.name,
        confidence=best_score,
        reason=f"capability match (comp: {complexity}, score: {best_score:.2f})",
        fallback=fallback_solver.name if fallback_solver else None,
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
