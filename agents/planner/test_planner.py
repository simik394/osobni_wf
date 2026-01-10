"""
Tests for the planner module models and solver.

Run with: pytest test_planner.py -v
"""
import pytest
from models import (
    Priority, Task, Goal, PlanPath, PlanRequest, PlanResult,
    load_from_json
)
from solver import TaskPlannerSolver, solve


class TestPriority:
    """Test Priority enum"""
    
    def test_priority_values(self):
        assert Priority.SHOW_STOPPER.value == 5
        assert Priority.CRITICAL.value == 4
        assert Priority.MAJOR.value == 3
        assert Priority.NORMAL.value == 2
        assert Priority.MINOR.value == 1
    
    def test_priority_ordering(self):
        assert Priority.SHOW_STOPPER.value > Priority.MINOR.value


class TestTask:
    """Test Task dataclass"""
    
    def test_task_creation_minimal(self):
        task = Task(id="T-1", summary="Test task", goal_id="G-1")
        assert task.id == "T-1"
        assert task.summary == "Test task"
        assert task.goal_id == "G-1"
        assert task.priority == Priority.NORMAL
        assert task.estimate_hours == 4
        assert task.depends_on == []
        assert task.blocks == []
        assert task.affected_files == []
        assert task.solver_hint is None
        assert task.due_date is None
    
    def test_task_creation_full(self):
        task = Task(
            id="T-2",
            summary="Full task",
            goal_id="G-1",
            priority=Priority.CRITICAL,
            estimate_hours=8,
            depends_on=["T-1"],
            blocks=["T-3"],
            affected_files=["file.go"],
            solver_hint="jules",
            due_date="2026-01-15"
        )
        assert task.priority == Priority.CRITICAL
        assert task.estimate_hours == 8
        assert "T-1" in task.depends_on
        assert "T-3" in task.blocks
        assert "file.go" in task.affected_files
        assert task.solver_hint == "jules"


class TestGoal:
    """Test Goal dataclass"""
    
    def test_goal_creation(self):
        goal = Goal(id="G-1", name="Test Goal")
        assert goal.id == "G-1"
        assert goal.name == "Test Goal"
        assert goal.priority == 1
        assert goal.tasks == []
    
    def test_goal_with_tasks(self):
        goal = Goal(id="G-2", name="Goal with tasks", priority=5, tasks=["T-1", "T-2"])
        assert goal.priority == 5
        assert len(goal.tasks) == 2


class TestPlanPath:
    """Test PlanPath dataclass and dominates method"""
    
    def test_planpath_creation(self):
        path = PlanPath(
            task_sequence=["T-1", "T-2"],
            total_hours=8,
            goals_completed=["G-1"],
            goals_partial=[],
            speed_score=80.0,
            coverage_score=100.0,
            urgency_score=50.0
        )
        assert path.total_hours == 8
        assert path.speed_score == 80.0
    
    def test_dominates_true(self):
        path1 = PlanPath(
            task_sequence=[], total_hours=4,
            goals_completed=[], goals_partial=[],
            speed_score=90.0, coverage_score=80.0, urgency_score=70.0
        )
        path2 = PlanPath(
            task_sequence=[], total_hours=8,
            goals_completed=[], goals_partial=[],
            speed_score=80.0, coverage_score=80.0, urgency_score=70.0
        )
        assert path1.dominates(path2) is True
    
    def test_dominates_false_worse_in_one(self):
        path1 = PlanPath(
            task_sequence=[], total_hours=4,
            goals_completed=[], goals_partial=[],
            speed_score=90.0, coverage_score=70.0, urgency_score=70.0
        )
        path2 = PlanPath(
            task_sequence=[], total_hours=8,
            goals_completed=[], goals_partial=[],
            speed_score=80.0, coverage_score=80.0, urgency_score=70.0
        )
        assert path1.dominates(path2) is False


class TestLoadFromJson:
    """Test JSON loading"""
    
    def test_load_minimal(self):
        data = {
            "tasks": [
                {"id": "T-1", "summary": "Task 1", "goal_id": "G-1"}
            ],
            "goals": [
                {"id": "G-1", "name": "Goal 1"}
            ]
        }
        request = load_from_json(data)
        assert len(request.tasks) == 1
        assert len(request.goals) == 1
        assert request.tasks[0].id == "T-1"
        assert request.available_hours == 40
        assert request.max_parallel == 15
    
    def test_load_with_priority(self):
        data = {
            "tasks": [
                {"id": "T-1", "summary": "Critical task", "goal_id": "G-1", "priority": "CRITICAL"}
            ],
            "goals": [{"id": "G-1", "name": "Goal 1"}]
        }
        request = load_from_json(data)
        assert request.tasks[0].priority == Priority.CRITICAL


class TestTaskPlannerSolver:
    """Test the CP-SAT solver"""
    
    @pytest.fixture
    def simple_request(self):
        return PlanRequest(
            tasks=[
                Task(id="T-1", summary="First task", goal_id="G-1", estimate_hours=2),
                Task(id="T-2", summary="Second task", goal_id="G-1", estimate_hours=3, depends_on=["T-1"]),
            ],
            goals=[
                Goal(id="G-1", name="Main Goal", tasks=["T-1", "T-2"])
            ],
            available_hours=40,
            max_parallel=5
        )
    
    def test_solver_creation(self, simple_request):
        solver = TaskPlannerSolver(simple_request)
        assert len(solver.tasks) == 2
        assert "T-1" in solver.tasks
        assert "T-2" in solver.tasks
    
    def test_topological_sort(self, simple_request):
        solver = TaskPlannerSolver(simple_request)
        order = solver.topological_sort()
        # T-1 must come before T-2
        assert order.index("T-1") < order.index("T-2")
    
    def test_build_dependency_graph(self, simple_request):
        solver = TaskPlannerSolver(simple_request)
        deps = solver.build_dependency_graph()
        assert "T-1" in deps
        # T-2 depends on T-1, so T-2's deps should contain T-1
        assert "T-1" in deps.get("T-2", set())
    
    def test_detect_file_conflicts(self):
        request = PlanRequest(
            tasks=[
                Task(id="T-1", summary="Task A", goal_id="G-1", affected_files=["api.go"]),
                Task(id="T-2", summary="Task B", goal_id="G-1", affected_files=["api.go", "db.go"]),
                Task(id="T-3", summary="Task C", goal_id="G-1", affected_files=["ui.ts"]),
            ],
            goals=[Goal(id="G-1", name="Goal", tasks=["T-1", "T-2", "T-3"])]
        )
        solver = TaskPlannerSolver(request)
        conflicts = solver.detect_file_conflicts()
        # T-1 and T-2 conflict on api.go (returns dict of sets)
        assert "T-2" in conflicts.get("T-1", set()) or "T-1" in conflicts.get("T-2", set())
        # T-3 doesn't conflict with T-1/T-2
        assert "T-3" not in conflicts.get("T-1", set())
    
    def test_calculate_value_impact(self, simple_request):
        solver = TaskPlannerSolver(simple_request)
        value_info = solver.calculate_value_impact()
        # T-1 blocks T-2, so T-1 should have value impact
        assert "T-1" in value_info
        assert value_info["T-1"]["blocked_hours"] >= 3  # T-2's hours
    
    def test_select_parallel_batch(self, simple_request):
        solver = TaskPlannerSolver(simple_request)
        order = solver.topological_sort()
        batch = solver.select_parallel_batch(order, max_size=5)
        # T-1 should be in the batch
        assert "T-1" in batch
        # The batch size should be limited
        assert len(batch) <= 5
    
    def test_solve_returns_result(self, simple_request):
        solver = TaskPlannerSolver(simple_request)
        result = solver.solve()
        assert isinstance(result, PlanResult)
        assert len(result.immediate_batch) > 0
        assert result.explanation is not None


class TestSolveConvenienceFunction:
    """Test the module-level solve function"""
    
    def test_solve_function(self):
        request = PlanRequest(
            tasks=[
                Task(id="T-1", summary="Single task", goal_id="G-1")
            ],
            goals=[Goal(id="G-1", name="Goal", tasks=["T-1"])]
        )
        result = solve(request)
        assert isinstance(result, PlanResult)
        assert "T-1" in result.immediate_batch
