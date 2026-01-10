"""
OR-Tools CP-SAT Solver for Multi-Objective Task Planning

Handles:
1. Dependency constraints (task A before task B)
2. Resource constraints (max parallel tasks)
3. File conflict detection (tasks touching same files can't run in parallel)
4. Multi-objective optimization via Pareto frontier
"""

from ortools.sat.python import cp_model
from models import Task, Goal, PlanRequest, PlanPath, PlanResult, Priority
from typing import Optional
from datetime import datetime, timedelta
import heapq


class TaskPlannerSolver:
    def __init__(self, request: PlanRequest):
        self.request = request
        self.tasks = {t.id: t for t in request.tasks}
        self.goals = {g.id: g for g in request.goals}
        
    def build_dependency_graph(self) -> dict[str, set[str]]:
        """Build adjacency list of task dependencies"""
        graph = {t.id: set() for t in self.request.tasks}
        for task in self.request.tasks:
            for dep in task.depends_on:
                if dep in graph:
                    graph[task.id].add(dep)
        return graph
    
    def topological_sort(self) -> list[str]:
        """Order tasks respecting dependencies"""
        graph = self.build_dependency_graph()
        in_degree = {t: 0 for t in graph}
        
        for node in graph:
            for dep in graph[node]:
                in_degree[node] += 1
        
        # Priority queue: (-priority, task_id)
        queue = []
        for task_id, degree in in_degree.items():
            if degree == 0:
                task = self.tasks[task_id]
                heapq.heappush(queue, (-task.priority.value, task_id))
        
        result = []
        while queue:
            _, task_id = heapq.heappop(queue)
            result.append(task_id)
            
            # Find tasks that depend on this one
            for other_id, deps in graph.items():
                if task_id in deps:
                    in_degree[other_id] -= 1
                    if in_degree[other_id] == 0:
                        other = self.tasks[other_id]
                        heapq.heappush(queue, (-other.priority.value, other_id))
        
        return result
    
    def detect_file_conflicts(self) -> dict[str, set[str]]:
        """Find tasks that touch the same files"""
        file_to_tasks: dict[str, set[str]] = {}
        for task in self.request.tasks:
            for f in task.affected_files:
                if f not in file_to_tasks:
                    file_to_tasks[f] = set()
                file_to_tasks[f].add(task.id)
        
        # Build conflict graph
        conflicts: dict[str, set[str]] = {t.id: set() for t in self.request.tasks}
        for file, task_ids in file_to_tasks.items():
            if len(task_ids) > 1:
                for t1 in task_ids:
                    for t2 in task_ids:
                        if t1 != t2:
                            conflicts[t1].add(t2)
        
        return conflicts
    
    def calculate_value_impact(self) -> dict[str, dict]:
        """
        Calculate the value each task blocks.
        
        Value Impact = How much downstream work is unlocked by completing this task
        
        Components:
        - direct_blockers: Tasks directly blocked by this one
        - transitive_blockers: All tasks transitively blocked
        - blocked_hours: Total hours of work blocked
        - blocked_goals: Goals that can't complete without this task
        - value_score: Composite score (0-100)
        """
        # Build reverse dependency graph (who I block)
        blocks: dict[str, set[str]] = {t.id: set() for t in self.request.tasks}
        for task in self.request.tasks:
            for dep_id in task.depends_on:
                if dep_id in blocks:
                    blocks[dep_id].add(task.id)
        
        results = {}
        
        for task in self.request.tasks:
            # Direct blockers
            direct = blocks[task.id]
            
            # Transitive blockers (DFS)
            transitive = set()
            stack = list(direct)
            while stack:
                blocked_id = stack.pop()
                if blocked_id not in transitive:
                    transitive.add(blocked_id)
                    stack.extend(blocks.get(blocked_id, []))
            
            # Blocked hours
            blocked_hours = sum(
                self.tasks[t].estimate_hours 
                for t in transitive if t in self.tasks
            )
            
            # Blocked goals
            blocked_goals = set()
            for goal in self.request.goals:
                goal_tasks = set(goal.tasks)
                # If this task is required for the goal AND blocks other goal tasks
                if task.id in goal_tasks and (transitive & goal_tasks):
                    blocked_goals.add(goal.id)
                # Or if this task is a prerequisite for goal tasks
                if transitive & goal_tasks:
                    blocked_goals.add(goal.id)
            
            # Value score (composite)
            # Weight: transitive count + hours blocked + goals blocked
            max_tasks = len(self.request.tasks)
            max_hours = sum(t.estimate_hours for t in self.request.tasks)
            max_goals = len(self.request.goals)
            
            score = 0.0
            if max_tasks > 0:
                score += 40 * (len(transitive) / max_tasks)  # 40% for task count
            if max_hours > 0:
                score += 40 * (blocked_hours / max_hours)    # 40% for hours
            if max_goals > 0:
                score += 20 * (len(blocked_goals) / max_goals)  # 20% for goals
            
            results[task.id] = {
                'task_id': task.id,
                'summary': task.summary,
                'direct_blockers': len(direct),
                'transitive_blockers': len(transitive),
                'blocked_tasks': list(transitive),
                'blocked_hours': blocked_hours,
                'blocked_goals': list(blocked_goals),
                'value_score': round(score, 1),
                'priority': task.priority.name,
            }
        
        return results
    
    def get_highest_value_tasks(self, limit: int = 10) -> list[dict]:
        """Get tasks sorted by value impact (most valuable first)"""
        impacts = self.calculate_value_impact()
        sorted_impacts = sorted(
            impacts.values(), 
            key=lambda x: x['value_score'], 
            reverse=True
        )
        return sorted_impacts[:limit]
    
    def select_parallel_batch(self, ordered_tasks: list[str], max_size: int) -> list[str]:
        """Select non-conflicting tasks for parallel execution"""
        conflicts = self.detect_file_conflicts()
        batch = []
        used_files: set[str] = set()
        
        for task_id in ordered_tasks:
            if len(batch) >= max_size:
                break
            
            task = self.tasks[task_id]
            
            # Check file conflicts
            has_conflict = any(f in used_files for f in task.affected_files)
            if not has_conflict:
                batch.append(task_id)
                used_files.update(task.affected_files)
        
        return batch
    
    def solve_with_cpsat(self) -> list[PlanPath]:
        """
        Use CP-SAT to find optimal task schedules
        Returns multiple Pareto-optimal paths
        """
        model = cp_model.CpModel()
        
        # Variables: start time for each task
        task_starts = {}
        task_ends = {}
        horizon = sum(t.estimate_hours for t in self.request.tasks) * 2
        
        for task in self.request.tasks:
            task_starts[task.id] = model.NewIntVar(0, horizon, f'start_{task.id}')
            task_ends[task.id] = model.NewIntVar(0, horizon, f'end_{task.id}')
            
            # Duration constraint
            model.Add(task_ends[task.id] == task_starts[task.id] + task.estimate_hours)
        
        # Dependency constraints
        for task in self.request.tasks:
            for dep_id in task.depends_on:
                if dep_id in task_ends:
                    model.Add(task_starts[task.id] >= task_ends[dep_id])
        
        # Objective: minimize makespan (for speed objective)
        makespan = model.NewIntVar(0, horizon, 'makespan')
        model.AddMaxEquality(makespan, list(task_ends.values()))
        model.Minimize(makespan)
        
        # Solve
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0
        status = solver.Solve(model)
        
        paths = []
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            # Extract solution
            schedule = []
            for task in self.request.tasks:
                start = solver.Value(task_starts[task.id])
                schedule.append((start, task.id))
            
            schedule.sort()
            task_sequence = [t[1] for t in schedule]
            
            # Build path
            path = self._build_path(task_sequence, solver.Value(makespan))
            paths.append(path)
        
        return paths
    
    def _build_path(self, task_sequence: list[str], total_hours: int) -> PlanPath:
        """Build PlanPath from task sequence"""
        goals_completed = []
        goals_partial = []
        
        completed_tasks = set(task_sequence)
        
        for goal in self.request.goals:
            goal_tasks = set(goal.tasks)
            if goal_tasks <= completed_tasks:
                goals_completed.append(goal.id)
            elif goal_tasks & completed_tasks:
                goals_partial.append(goal.id)
        
        # Calculate scores
        max_hours = self.request.available_hours * 4  # 4 weeks horizon
        speed_score = max(0, 100 - (total_hours / max_hours * 100))
        
        total_goals = len(self.request.goals)
        coverage_score = (len(goals_completed) / total_goals * 100) if total_goals > 0 else 0
        
        # Urgency score based on due dates, priority, and task coverage
        urgency_score = self._calculate_urgency_score(task_sequence)
        
        return PlanPath(
            task_sequence=task_sequence,
            total_hours=total_hours,
            goals_completed=goals_completed,
            goals_partial=goals_partial,
            speed_score=speed_score,
            coverage_score=coverage_score,
            urgency_score=urgency_score,
        )
    
    def _calculate_urgency_score(self, task_sequence: list[str]) -> float:
        """
        Calculate urgency score based on:
        - Days until due date (0-50 points)
        - Priority of tasks (0-30 points)
        - Issue age consideration (0-20 points)
        """
        if not task_sequence:
            return 50.0  # Default neutral score
        
        today = datetime.now()
        due_date_scores = []
        priority_scores = []
        
        for task_id in task_sequence:
            if task_id not in self.tasks:
                continue
            task = self.tasks[task_id]
            
            # Due date urgency (0-50)
            if task.due_date:
                try:
                    due = datetime.fromisoformat(task.due_date.replace('Z', '+00:00'))
                    days_until = (due.replace(tzinfo=None) - today).days
                    
                    if days_until <= 0:  # Overdue
                        due_date_scores.append(50.0)
                    elif days_until <= 3:  # Very urgent
                        due_date_scores.append(40.0)
                    elif days_until <= 7:  # Urgent
                        due_date_scores.append(30.0)
                    elif days_until <= 14:  # Soon
                        due_date_scores.append(20.0)
                    else:
                        due_date_scores.append(10.0)
                except (ValueError, TypeError):
                    pass  # Invalid date, skip
            
            # Priority urgency (0-30)
            priority_map = {
                Priority.SHOW_STOPPER: 30.0,
                Priority.CRITICAL: 24.0,
                Priority.MAJOR: 18.0,
                Priority.NORMAL: 12.0,
                Priority.MINOR: 6.0,
            }
            priority_scores.append(priority_map.get(task.priority, 12.0))
        
        # Calculate averages
        due_avg = sum(due_date_scores) / len(due_date_scores) if due_date_scores else 25.0
        priority_avg = sum(priority_scores) / len(priority_scores) if priority_scores else 15.0
        
        # Age bonus: more tasks = more potential urgency (0-20)
        age_score = min(20.0, len(task_sequence) * 2)
        
        return min(100.0, due_avg + priority_avg + age_score)
    
    def solve(self) -> PlanResult:
        """Main entry point - generate Pareto-optimal plans"""
        # Get dependency-sorted order
        ordered = self.topological_sort()
        
        # Get CP-SAT solutions
        cpsat_paths = self.solve_with_cpsat()
        
        # Select immediate batch
        immediate_batch = self.select_parallel_batch(ordered, self.request.max_parallel)
        
        # Find Pareto frontier
        pareto_paths = self._compute_pareto_frontier(cpsat_paths)
        
        # Select recommended path by weighted sum
        recommended = self._select_by_weights(pareto_paths)
        
        # Generate explanation
        explanation = self._generate_explanation(recommended, immediate_batch)
        
        return PlanResult(
            pareto_paths=pareto_paths,
            recommended_path=recommended,
            immediate_batch=immediate_batch,
            explanation=explanation,
        )
    
    def _compute_pareto_frontier(self, paths: list[PlanPath]) -> list[PlanPath]:
        """Filter to non-dominated solutions"""
        if not paths:
            return []
        
        frontier = []
        for candidate in paths:
            dominated = False
            for other in paths:
                if other != candidate and other.dominates(candidate):
                    dominated = True
                    break
            if not dominated:
                frontier.append(candidate)
        
        return frontier if frontier else paths[:1]
    
    def _select_by_weights(self, paths: list[PlanPath]) -> Optional[PlanPath]:
        """Select best path by weighted sum of objectives"""
        if not paths:
            return None
        
        weights = self.request.objective_weights
        
        def score(p: PlanPath) -> float:
            return (
                p.speed_score * weights.get('speed', 1.0) +
                p.coverage_score * weights.get('coverage', 1.0) +
                p.urgency_score * weights.get('urgency', 1.0)
            )
        
        return max(paths, key=score)
    
    def _generate_explanation(self, path: Optional[PlanPath], batch: list[str]) -> str:
        """Generate human-readable explanation"""
        lines = []
        
        lines.append("## Planning Decision")
        lines.append("")
        
        if batch:
            lines.append(f"### Immediate Batch ({len(batch)} tasks)")
            for task_id in batch:
                task = self.tasks[task_id]
                lines.append(f"- **{task_id}**: {task.summary}")
            lines.append("")
        
        if path:
            lines.append("### Recommended Path")
            lines.append(f"- Total duration: {path.total_hours}h")
            lines.append(f"- Goals completed: {len(path.goals_completed)}")
            lines.append(f"- Speed score: {path.speed_score:.1f}/100")
            lines.append(f"- Coverage score: {path.coverage_score:.1f}/100")
            lines.append("")
            lines.append("### Execution Order")
            for i, task_id in enumerate(path.task_sequence[:10], 1):
                task = self.tasks[task_id]
                lines.append(f"{i}. {task_id}: {task.summary}")
            if len(path.task_sequence) > 10:
                lines.append(f"... and {len(path.task_sequence) - 10} more")
        
        return "\n".join(lines)


def solve(request: PlanRequest) -> PlanResult:
    """Convenience function"""
    solver = TaskPlannerSolver(request)
    return solver.solve()
