"""
Solver Matcher - PM Agent Phase 1

Matches tasks to appropriate solvers based on:
- Task summary keywords
- Issue type
- Historical patterns (future)

Reference: SOLVER_REGISTRY.md
"""

import re
from dataclasses import dataclass
from typing import Optional
from models import Task


@dataclass
class SolverMatch:
    solver: str
    confidence: float  # 0-1
    reason: str
    tags: list[str]


# Keyword patterns for each solver
SOLVER_PATTERNS = {
    'jules': {
        'keywords': [
            'implement', 'create', 'add', 'build', 'refactor',
            'fix', 'bug', 'feature', 'code', 'function', 'class',
            'module', 'api', 'endpoint', 'test', 'pr', 'pull request'
        ],
        'file_extensions': ['.py', '.ts', '.js', '.go', '.rs', '.java'],
        'issue_types': ['Task', 'Bug', 'Feature'],
        'confidence_boost': 0.2,  # When file extensions match
    },
    'gemini': {
        'keywords': [
            'analyze', 'review', 'document', 'explain', 'describe',
            'readme', 'architecture', 'design', 'plan', 'spec',
            'audit', 'assess', 'evaluate', 'summarize'
        ],
        'file_extensions': ['.md', '.txt', '.rst'],
        'issue_types': ['Epic', 'Story', 'Documentation'],
        'confidence_boost': 0.15,
    },
    'perplexity': {
        'keywords': [
            'research', 'investigate', 'explore', 'compare',
            'find', 'search', 'alternatives', 'benchmark',
            'how to', 'what is', 'why', 'best practice'
        ],
        'file_extensions': [],
        'issue_types': ['Question', 'Research'],
        'confidence_boost': 0.1,
    },
    'angrav': {
        'keywords': [
            'automation', 'browser', 'scrape', 'web', 'ui',
            'studio', 'notebooklm', 'notebook'
        ],
        'file_extensions': [],
        'issue_types': ['Automation'],
        'confidence_boost': 0.1,
    },
    'local-slm': {
        'keywords': [
            'quick', 'simple', 'format', 'convert', 'parse',
            'extract', 'template'
        ],
        'file_extensions': [],
        'issue_types': [],
        'confidence_boost': 0.0,
    },
}

# Default solver when no match
DEFAULT_SOLVER = 'gemini'


def match_solver(task: Task, issue_type: Optional[str] = None) -> SolverMatch:
    """
    Match a task to the most appropriate solver.
    
    Args:
        task: Task object from planner
        issue_type: Optional YouTrack issue type (Epic, Task, Bug, etc.)
    
    Returns:
        SolverMatch with recommended solver and confidence
    """
    summary_lower = task.summary.lower()
    scores: dict[str, float] = {solver: 0.0 for solver in SOLVER_PATTERNS}
    reasons: dict[str, list[str]] = {solver: [] for solver in SOLVER_PATTERNS}
    
    for solver, patterns in SOLVER_PATTERNS.items():
        # Keyword matching
        for keyword in patterns['keywords']:
            if keyword in summary_lower:
                scores[solver] += 0.3
                reasons[solver].append(f'keyword "{keyword}"')
        
        # Issue type matching
        if issue_type and issue_type in patterns['issue_types']:
            scores[solver] += 0.4
            reasons[solver].append(f'type "{issue_type}"')
        
        # File extension matching (from affected_files)
        for ext in patterns['file_extensions']:
            if any(f.endswith(ext) for f in task.affected_files):
                scores[solver] += patterns['confidence_boost']
                reasons[solver].append(f'file extension "{ext}"')
    
    # Find best match
    best_solver = max(scores, key=scores.get)
    best_score = scores[best_solver]
    
    # Normalize confidence to 0-1
    confidence = min(1.0, best_score)
    
    # If no strong match, use default
    if confidence < 0.2:
        best_solver = DEFAULT_SOLVER
        confidence = 0.5
        reasons[best_solver] = ['default fallback']
    
    # Generate tags
    tags = [f'#{best_solver}']
    if confidence >= 0.7:
        tags.append('#auto-match')
    else:
        tags.append('#review-match')
    
    return SolverMatch(
        solver=best_solver,
        confidence=confidence,
        reason=', '.join(reasons[best_solver][:3]),  # Top 3 reasons
        tags=tags,
    )


def match_all(tasks: list[Task], issue_types: dict[str, str] = None) -> list[tuple[Task, SolverMatch]]:
    """
    Match all tasks to solvers.
    
    Args:
        tasks: List of Task objects
        issue_types: Optional dict mapping task_id → issue_type
    
    Returns:
        List of (task, solver_match) tuples
    """
    issue_types = issue_types or {}
    results = []
    
    for task in tasks:
        issue_type = issue_types.get(task.id)
        match = match_solver(task, issue_type)
        results.append((task, match))
    
    return results


def format_matches(matches: list[tuple[Task, SolverMatch]]) -> str:
    """Format matches for display"""
    lines = []
    lines.append("## Solver Matching Results")
    lines.append("")
    
    # Group by solver
    by_solver: dict[str, list] = {}
    for task, match in matches:
        if match.solver not in by_solver:
            by_solver[match.solver] = []
        by_solver[match.solver].append((task, match))
    
    for solver, items in sorted(by_solver.items()):
        lines.append(f"### {solver.upper()} ({len(items)} tasks)")
        for task, match in items:
            conf = f"{match.confidence:.0%}"
            lines.append(f"- **{task.id}**: {task.summary}")
            lines.append(f"  - Confidence: {conf} ({match.reason})")
            lines.append(f"  - Tags: {', '.join(match.tags)}")
        lines.append("")
    
    return "\n".join(lines)


# CLI integration
def cmd_match(args):
    """Match tasks to solvers"""
    import json
    from pathlib import Path
    from youtrack_client import fetch_project_tasks
    
    issues = []
    issue_types = {}
    
    # Load issues
    if hasattr(args, 'issues_file') and args.issues_file:
        data = json.loads(Path(args.issues_file).read_text())
        issues = data if isinstance(data, list) else data.get('issuesPage', [])
    else:
        print("Usage: python cli.py match -p PROJECT -f issues.json")
        return
    
    # Extract issue types
    for issue in issues:
        issue_id = issue.get('id', '')
        custom = issue.get('customFields', {})
        issue_types[issue_id] = custom.get('Type', '')
    
    # Convert to tasks
    tasks, _ = fetch_project_tasks(args.project, issues=issues)
    
    if not tasks:
        print("No tasks found")
        return
    
    # Match
    matches = match_all(tasks, issue_types)
    
    # Output
    print(format_matches(matches))
    
    if args.json:
        output = [
            {
                'task_id': task.id,
                'summary': task.summary,
                'solver': match.solver,
                'confidence': match.confidence,
                'reason': match.reason,
                'tags': match.tags,
            }
            for task, match in matches
        ]
        print(json.dumps(output, indent=2))
