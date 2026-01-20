"""Triage tool for processing inbox items."""

from proj.state import InboxItem, Task, TaskStatus, ProjState


def triage_item(item: InboxItem, action: str, **kwargs) -> Task | None:
    """Process an inbox item with a triage action.
    
    Args:
        item: The inbox item to triage
        action: One of 'today', 'this_week', 'someday', 'project', 'delete'
        **kwargs: Additional params like project_id
    
    Returns:
        Created Task if applicable, None if deleted
    """
    if action == "delete":
        return None
    
    # Convert to task
    task = Task(
        title=item.content[:100],  # Truncate for title
        description=item.content if len(item.content) > 100 else None,
        status=TaskStatus.TODO,
    )
    
    if action == "today":
        task.priority = 1
    elif action == "this_week":
        task.priority = 2
    elif action == "someday":
        task.priority = 3
    elif action == "project":
        task.project_id = kwargs.get("project_id")
    
    return task


def auto_triage_suggestions(item: InboxItem, state: ProjState) -> list[dict]:
    """Generate triage suggestions based on content analysis.
    
    Args:
        item: The inbox item
        state: Current agent state for context
    
    Returns:
        List of suggested actions with confidence
    """
    suggestions = []
    content_lower = item.content.lower()
    
    # Check for project keywords
    for project in state.projects.values():
        if project.name.lower() in content_lower:
            suggestions.append({
                "action": "project",
                "project_id": project.id,
                "project_name": project.name,
                "confidence": 0.8,
            })
    
    # Check for urgency
    if any(w in content_lower for w in ["urgent", "asap", "today", "now"]):
        suggestions.append({
            "action": "today",
            "confidence": 0.7,
        })
    
    # Check for low priority
    if any(w in content_lower for w in ["someday", "maybe", "idea", "might"]):
        suggestions.append({
            "action": "someday",
            "confidence": 0.6,
        })
    
    # Default suggestion
    if not suggestions:
        suggestions.append({
            "action": "this_week",
            "confidence": 0.5,
        })
    
    return sorted(suggestions, key=lambda x: x["confidence"], reverse=True)


# Tool definition for LangGraph
triage_tool = {
    "name": "triage",
    "description": "Process inbox items. Assign to project, schedule, or delete.",
    "parameters": {
        "type": "object",
        "properties": {
            "item_id": {
                "type": "string",
                "description": "ID of the inbox item to triage",
            },
            "action": {
                "type": "string",
                "enum": ["today", "this_week", "someday", "project", "delete"],
                "description": "What to do with the item",
            },
            "project_id": {
                "type": "string",
                "description": "Project ID if action is 'project'",
            },
        },
        "required": ["item_id", "action"],
    },
}
