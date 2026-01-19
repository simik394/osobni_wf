"""Estimation tools."""

from langchain_core.tools import tool

@tool
def update_estimates(estimates: list[dict]):
    """Update task estimates.

    Args:
        estimates: List of dicts with 'task_id' and 'estimated_minutes'.
    """
    # Logic to update estimates would go here
    return f"Updated {len(estimates)} estimates."
