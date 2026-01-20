"""Capture tool for quick task/idea capture."""

from datetime import datetime
from proj.state import InboxItem, Task, TaskStatus


def capture_to_inbox(content: str, source: str = "manual", context: dict | None = None) -> InboxItem:
    """Capture an item to inbox for later triage.
    
    Args:
        content: The text to capture
        source: Where this came from (manual, voice, link, etc.)
        context: Additional metadata
    
    Returns:
        The created InboxItem
    """
    return InboxItem(
        content=content,
        source=source,
        context=context or {},
    )


def capture_to_task(
    title: str,
    project_id: str | None = None,
    description: str | None = None,
    priority: int = 2,
    due_date: datetime | None = None,
    tags: list[str] | None = None,
) -> Task:
    """Create a task directly, bypassing inbox.
    
    Args:
        title: Task title
        project_id: Optional project to assign to
        description: Optional details
        priority: 1=high, 2=medium, 3=low
        due_date: Optional deadline
        tags: Optional tags
    
    Returns:
        The created Task
    """
    return Task(
        title=title,
        project_id=project_id,
        description=description,
        priority=priority,
        due_date=due_date,
        tags=tags or [],
        status=TaskStatus.TODO,
    )


def parse_capture_intent(text: str) -> dict:
    """Parse natural language capture for smart defaults.
    
    Extracts:
    - Priority hints (urgent, asap, someday)
    - Date hints (tomorrow, next week)
    - Project hints (for project X, in X)
    
    Args:
        text: Raw input text
    
    Returns:
        Dict with parsed intent and defaults
    """
    result = {
        "content": text,
        "priority": 2,
        "project_hint": None,
        "date_hint": None,
    }
    
    text_lower = text.lower()
    
    # Priority detection
    if any(w in text_lower for w in ["urgent", "asap", "critical", "!"]):
        result["priority"] = 1
    elif any(w in text_lower for w in ["someday", "maybe", "eventually"]):
        result["priority"] = 3
    
    # Date detection (basic)
    if "tomorrow" in text_lower:
        result["date_hint"] = "tomorrow"
    elif "next week" in text_lower:
        result["date_hint"] = "next_week"
    elif "today" in text_lower:
        result["date_hint"] = "today"
    
    # Project detection
    for marker in ["for project", "in project", "project:"]:
        if marker in text_lower:
            idx = text_lower.find(marker) + len(marker)
            # Extract next word as project name
            rest = text[idx:].strip()
            if rest:
                project = rest.split()[0].strip(",:;")
                result["project_hint"] = project
                break
    
    return result


# Tool definition for LangGraph
capture_tool = {
    "name": "capture",
    "description": "Capture a task, idea, or note. Add to inbox for later triage, or directly to a project.",
    "parameters": {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "What to capture",
            },
            "project": {
                "type": "string",
                "description": "Optional project name to add directly to",
            },
            "priority": {
                "type": "integer",
                "description": "Priority 1=high, 2=medium, 3=low",
                "enum": [1, 2, 3],
            },
        },
        "required": ["content"],
    },
}
