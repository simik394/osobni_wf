#!/usr/bin/env python3
"""
Task Planner CLI

Usage:
    python cli.py solve --input tasks.json
    python cli.py solve --input tasks.json --objective speed
    python cli.py batch --input tasks.json --max-parallel 15
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
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(1)
    
    args.func(args)


if __name__ == '__main__':
    main()
