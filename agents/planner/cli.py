#!/usr/bin/env python3
"""
Task Planner CLI

Usage:
    python cli.py solve --input tasks.json
    python cli.py solve --input tasks.json --objective speed
    python cli.py batch --input tasks.json --max-parallel 15
    python cli.py next --project SAM    # YouTrack integration
    python cli.py sync --project SAM    # Sync and plan
"""

import argparse
import json
import sys
from pathlib import Path

from models import load_from_json, PlanRequest
from solver import TaskPlannerSolver


def cmd_solve(args):
    """Solve and show recommended plan"""
    data = json.loads(Path(args.input).read_text())
    
    # Override weights if specified
    if args.objective:
        weights = {'speed': 0.5, 'coverage': 0.5, 'urgency': 0.5}
        weights[args.objective] = 2.0
        data['objective_weights'] = weights
    
    request = load_from_json(data)
    solver = TaskPlannerSolver(request)
    result = solver.solve()
    
    print(result.explanation)
    print()
    
    if args.json:
        output = {
            'recommended': {
                'tasks': result.recommended_path.task_sequence if result.recommended_path else [],
                'hours': result.recommended_path.total_hours if result.recommended_path else 0,
                'goals_completed': result.recommended_path.goals_completed if result.recommended_path else [],
            },
            'immediate_batch': result.immediate_batch,
            'pareto_count': len(result.pareto_paths),
        }
        print(json.dumps(output, indent=2))


def cmd_batch(args):
    """Get immediate dispatch batch only"""
    data = json.loads(Path(args.input).read_text())
    data['max_parallel'] = args.max_parallel
    
    request = load_from_json(data)
    solver = TaskPlannerSolver(request)
    result = solver.solve()
    
    print(f"## Immediate Batch ({len(result.immediate_batch)} tasks)")
    for task_id in result.immediate_batch:
        task = solver.tasks[task_id]
        print(f"- {task_id}: {task.summary}")
    
    if args.json:
        print()
        print(json.dumps({'batch': result.immediate_batch}, indent=2))


def cmd_value(args):
    """Show tasks ranked by value impact (which block the most downstream work)"""
    data = json.loads(Path(args.input).read_text())
    
    request = load_from_json(data)
    solver = TaskPlannerSolver(request)
    
    top_tasks = solver.get_highest_value_tasks(limit=args.limit)
    
    print("## Value-Blocking Analysis")
    print()
    print("Tasks ranked by how much downstream value they unlock:")
    print()
    
    for i, impact in enumerate(top_tasks, 1):
        print(f"### {i}. {impact['task_id']}: {impact['summary']}")
        print(f"   - Value Score: **{impact['value_score']}/100**")
        print(f"   - Blocks {impact['transitive_blockers']} tasks ({impact['blocked_hours']}h of work)")
        if impact['blocked_goals']:
            print(f"   - Required for goals: {', '.join(impact['blocked_goals'])}")
        print()
    
    if args.json:
        print(json.dumps(top_tasks, indent=2))


def cmd_demo(args):
    """Run with demo data"""
    demo_data = {
        'tasks': [
            {'id': 'T1', 'summary': 'Setup auth module', 'goal_id': 'G1', 'priority': 'MAJOR', 'estimate_hours': 8, 'affected_files': ['auth.py']},
            {'id': 'T2', 'summary': 'Add login endpoint', 'goal_id': 'G1', 'priority': 'NORMAL', 'estimate_hours': 4, 'depends_on': ['T1'], 'affected_files': ['auth.py', 'routes.py']},
            {'id': 'T3', 'summary': 'Add logout endpoint', 'goal_id': 'G1', 'priority': 'NORMAL', 'estimate_hours': 2, 'depends_on': ['T1'], 'affected_files': ['auth.py', 'routes.py']},
            {'id': 'T4', 'summary': 'Create user dashboard', 'goal_id': 'G2', 'priority': 'MAJOR', 'estimate_hours': 16, 'affected_files': ['dashboard.tsx']},
            {'id': 'T5', 'summary': 'Add metrics charts', 'goal_id': 'G2', 'priority': 'NORMAL', 'estimate_hours': 8, 'depends_on': ['T4'], 'affected_files': ['dashboard.tsx', 'charts.tsx']},
            {'id': 'T6', 'summary': 'Write documentation', 'goal_id': 'G3', 'priority': 'MINOR', 'estimate_hours': 4, 'affected_files': ['README.md']},
        ],
        'goals': [
            {'id': 'G1', 'name': 'Authentication', 'priority': 3, 'tasks': ['T1', 'T2', 'T3']},
            {'id': 'G2', 'name': 'Dashboard', 'priority': 2, 'tasks': ['T4', 'T5']},
            {'id': 'G3', 'name': 'Documentation', 'priority': 1, 'tasks': ['T6']},
        ],
        'available_hours': 40,
        'max_parallel': 5,
    }
    
    request = load_from_json(demo_data)
    solver = TaskPlannerSolver(request)
    result = solver.solve()
    
    print(result.explanation)


def cmd_next(args):
    """Get the next recommended task from YouTrack"""
    from youtrack_client import get_next_task, YouTrackConfig
    
    config = YouTrackConfig()
    if not config.token:
        print("⚠️  YOUTRACK_TOKEN not set. Using unauthenticated access.")
    
    print(f"🔍 Fetching tasks from YouTrack project: {args.project}")
    
    try:
        task = get_next_task(args.project, config)
        
        if task:
            print()
            print("## Next Recommended Task")
            print()
            print(f"### {task['task_id']}: {task['summary']}")
            print(f"- Priority: {task['priority']}")
            print(f"- Value Score: **{task['value_score']}/100**")
            print(f"- Blocks {task['transitive_blockers']} downstream tasks ({task['blocked_hours']}h)")
            if task['blocked_goals']:
                print(f"- Required for goals: {', '.join(task['blocked_goals'])}")
            print()
            print(f"🔗 Open: $YOUTRACK_BASE/issue/{task['task_id']}")
            
            if args.json:
                print()
                print(json.dumps(task, indent=2))
        else:
            print("✅ No pending tasks found!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


def cmd_sync(args):
    """Sync tasks from YouTrack and run planner"""
    from youtrack_client import fetch_project_tasks, issue_to_task
    from models import PlanRequest
    
    issues = []
    
    # Option 1: Read from JSON file
    if hasattr(args, 'issues_file') and args.issues_file:
        data = json.loads(Path(args.issues_file).read_text())
        issues = data if isinstance(data, list) else data.get('issuesPage', [])
    
    # Option 2: Read from stdin (pipe from MCP)
    elif not sys.stdin.isatty():
        data = json.load(sys.stdin)
        issues = data if isinstance(data, list) else data.get('issuesPage', [])
    
    # Option 3: No data provided
    else:
        print(f"## YouTrack Sync for: {args.project}")
        print()
        print("To use sync, pipe issues from MCP or provide a JSON file:")
        print()
        print("  Option 1: Use mcp_napovedayt_search_issues and pipe result")
        print(f"  Option 2: python cli.py sync -p {args.project} --issues-file issues.json")
        print()
        print("Example issues.json format:")
        print(json.dumps({
            "issuesPage": [
                {"id": "SAM-1", "summary": "Example task", "customFields": {"Priority": "Major", "State": "Open"}}
            ]
        }, indent=2))
        return
    
    print(f"🔄 Processing {len(issues)} issues from {args.project}")
    
    tasks, goals = fetch_project_tasks(args.project, issues=issues)
    
    print(f"   Mapped to {len(tasks)} tasks in {len(goals)} goal groups")
    
    if not tasks:
        print("✅ No open tasks found!")
        return
    
    # Run planner
    request = PlanRequest(
        tasks=tasks,
        goals=goals,
        max_parallel=args.max_parallel,
    )
    solver = TaskPlannerSolver(request)
    result = solver.solve()
    
    print()
    print(result.explanation)
    
    # Show value analysis
    print()
    print("## Value-Blocking Analysis (Top 5)")
    top_tasks = solver.get_highest_value_tasks(limit=5)
    for i, impact in enumerate(top_tasks, 1):
        blocked = f"blocks {impact['transitive_blockers']} tasks" if impact['transitive_blockers'] else "leaf task"
        print(f"{i}. {impact['task_id']}: {impact['summary']} ({blocked})")
    
    if args.json:
        print()
        output = {
            'tasks': len(tasks),
            'goals': len(goals),
            'immediate_batch': result.immediate_batch,
            'top_value': [t['task_id'] for t in top_tasks],
        }
        print(json.dumps(output, indent=2))


def main():
    parser = argparse.ArgumentParser(description='Multi-Objective Task Planner')
    subparsers = parser.add_subparsers(dest='command', help='Command')
    
    # solve command
    solve_parser = subparsers.add_parser('solve', help='Generate optimal plan')
    solve_parser.add_argument('--input', '-i', required=True, help='Input JSON file')
    solve_parser.add_argument('--objective', '-o', choices=['speed', 'coverage', 'urgency'], help='Prioritize objective')
    solve_parser.add_argument('--json', '-j', action='store_true', help='Output JSON')
    solve_parser.set_defaults(func=cmd_solve)
    
    # batch command
    batch_parser = subparsers.add_parser('batch', help='Get immediate dispatch batch')
    batch_parser.add_argument('--input', '-i', required=True, help='Input JSON file')
    batch_parser.add_argument('--max-parallel', '-p', type=int, default=15, help='Max parallel tasks')
    batch_parser.add_argument('--json', '-j', action='store_true', help='Output JSON')
    batch_parser.set_defaults(func=cmd_batch)
    
    # value command
    value_parser = subparsers.add_parser('value', help='Show tasks ranked by value impact')
    value_parser.add_argument('--input', '-i', required=True, help='Input JSON file')
    value_parser.add_argument('--limit', '-l', type=int, default=10, help='Number of tasks to show')
    value_parser.add_argument('--json', '-j', action='store_true', help='Output JSON')
    value_parser.set_defaults(func=cmd_value)
    
    # demo command
    demo_parser = subparsers.add_parser('demo', help='Run with demo data')
    demo_parser.set_defaults(func=cmd_demo)
    
    # next command (YouTrack)
    next_parser = subparsers.add_parser('next', help='Get next recommended task from YouTrack')
    next_parser.add_argument('--project', '-p', required=True, help='YouTrack project key (e.g., SAM)')
    next_parser.add_argument('--json', '-j', action='store_true', help='Output JSON')
    next_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose error output')
    next_parser.set_defaults(func=cmd_next)
    
    # sync command (YouTrack)
    sync_parser = subparsers.add_parser('sync', help='Sync from YouTrack and run planner')
    sync_parser.add_argument('--project', '-p', required=True, help='YouTrack project key (e.g., SAM)')
    sync_parser.add_argument('--issues-file', '-f', help='JSON file with issues (from MCP export)')
    sync_parser.add_argument('--max-parallel', '-m', type=int, default=15, help='Max parallel tasks')
    sync_parser.add_argument('--json', '-j', action='store_true', help='Output JSON')
    sync_parser.add_argument('--verbose', '-v', action='store_true', help='Verbose error output')
    sync_parser.set_defaults(func=cmd_sync)
    
    # match command (Solver Matcher)
    from solver_matcher import cmd_match
    match_parser = subparsers.add_parser('match', help='Match tasks to solvers')
    match_parser.add_argument('--project', '-p', required=True, help='YouTrack project key')
    match_parser.add_argument('--issues-file', '-f', required=True, help='JSON file with issues')
    match_parser.add_argument('--json', '-j', action='store_true', help='Output JSON')
    match_parser.set_defaults(func=cmd_match)
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(1)
    
    args.func(args)


if __name__ == '__main__':
    main()
