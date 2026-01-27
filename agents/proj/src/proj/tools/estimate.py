"""Tool for updating task estimates."""
from langchain_core.tools import tool
from proj.state import ProjState, Task

@tool
def update_estimates(state: ProjState, estimates: dict[str, int]) -> dict:
    """Update task estimates in the state.

    Args:
        state: The current ProjState.
        estimates: A dictionary mapping task IDs to estimated durations in minutes.

    Returns:
        A dictionary with the updated tasks.
    """
    updated_tasks = state.tasks.copy()
    for task_id, duration in estimates.items():
        if task_id in updated_tasks:
            updated_tasks[task_id].estimated_duration_minutes = duration
    return {"tasks": updated_tasks}
