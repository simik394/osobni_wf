"""Main LangGraph agent for project management.

This module defines the supervisor graph that routes to specialized sub-agents.
"""

from typing import Literal
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

from proj.state import ProjState, InboxItem, Task, TaskStatus
from proj.tools.capture import capture_tool
from proj.tools.triage import triage_tool
from proj.integrations.rsrch import query_rsrch


# System prompt for the supervisor
SUPERVISOR_PROMPT = """You are a personal project management assistant. Your role is to help the user:

1. **Capture** ideas, tasks, and notes quickly with zero friction
2. **Organize** work into projects and prioritize effectively
3. **Resume** context when returning to work after absence
4. **Review** progress and plan what's next

You have access to these tools:
- capture: Add items to inbox or directly to projects
- triage: Process inbox items
- query_rsrch: Search related research from the rsrch agent

Be concise and action-oriented. When the user shares something to capture, 
confirm briefly and suggest next steps. For reviews, provide clear summaries
with actionable items.

Current state summary:
- Projects: {project_count}
- Active tasks: {task_count}
- Inbox items: {inbox_count}
"""


def format_system_prompt(state: ProjState) -> str:
    """Format system prompt with current state context."""
    return SUPERVISOR_PROMPT.format(
        project_count=len(state.projects),
        task_count=len([t for t in state.tasks.values() if t.status == TaskStatus.TODO]),
        inbox_count=len(state.inbox),
    )


def supervisor_node(state: ProjState) -> dict:
    """Main supervisor that decides routing based on user intent.
    
    Analyzes the last message and routes to appropriate handler.
    """
    messages = state.messages
    if not messages:
        return {"next_agent": "respond"}
    
    last_message = messages[-1]
    content = last_message.content.lower() if hasattr(last_message, 'content') else ""
    
    # Simple intent detection (can be enhanced with LLM)
    if any(kw in content for kw in ["capture", "add", "note", "remember", "todo"]):
        return {"next_agent": "capture"}
    elif any(kw in content for kw in ["inbox", "triage", "process"]):
        return {"next_agent": "triage"}
    elif any(kw in content for kw in ["resume", "context", "where was i", "catch up"]):
        return {"next_agent": "resume"}
    elif any(kw in content for kw in ["review", "today", "priorities", "what's next"]):
        return {"next_agent": "review"}
    else:
        return {"next_agent": "respond"}


def capture_node(state: ProjState) -> dict:
    """Handle capture requests - add items to inbox or projects."""
    messages = state.messages
    if not messages:
        return {"messages": [AIMessage(content="What would you like to capture?")]}
    
    last_message = messages[-1]
    content = last_message.content if hasattr(last_message, 'content') else str(last_message)
    
    # Create inbox item from the message
    item = InboxItem(
        content=content,
        source="chat",
        context={"active_project": state.active_project_id}
    )
    
    new_inbox = state.inbox + [item]
    
    response = f"✅ Captured: \"{content[:50]}{'...' if len(content) > 50 else ''}\"\n\nAdded to inbox. Would you like to assign it to a project now?"
    
    return {
        "inbox": new_inbox,
        "messages": [AIMessage(content=response)],
        "next_agent": None,
    }


def triage_node(state: ProjState) -> dict:
    """Process inbox items."""
    inbox = state.inbox
    
    if not inbox:
        return {"messages": [AIMessage(content="📭 Inbox is empty! Nothing to triage.")]}
    
    # Show first item for triage
    item = inbox[0]
    response = f"""📥 **Inbox** ({len(inbox)} items)

**Next item:** {item.content}
_Captured {item.captured_at.strftime('%Y-%m-%d %H:%M')}_

What would you like to do?
1️⃣ Today - Add to today's focus
2️⃣ This week - Schedule for this week  
3️⃣ Project - Assign to a project
🗑️ Delete - Remove
⏭️ Skip - Decide later"""
    
    return {"messages": [AIMessage(content=response)]}


def resume_node(state: ProjState) -> dict:
    """Generate context restoration for returning to work."""
    if not state.active_project_id or state.active_project_id not in state.projects:
        # No active project - show overview
        projects = list(state.projects.values())
        if not projects:
            return {"messages": [AIMessage(content="You don't have any projects yet. Would you like to create one?")]}
        
        response = "🔄 **Welcome back!**\n\nYour projects:\n"
        for p in projects[:5]:
            task_count = len([t for t in state.tasks.values() if t.project_id == p.id and t.status == TaskStatus.TODO])
            response += f"• **{p.name}** ({task_count} tasks)\n"
        
        response += "\nWhich project would you like to work on?"
        return {"messages": [AIMessage(content=response)]}
    
    project = state.projects[state.active_project_id]
    tasks = [t for t in state.tasks.values() if t.project_id == project.id]
    in_progress = [t for t in tasks if t.status == TaskStatus.IN_PROGRESS]
    blocked = [t for t in tasks if t.status == TaskStatus.BLOCKED]
    
    response = f"""🔄 **Resuming: {project.name}**

"""
    if project.last_context:
        response += f"_Last time: {project.last_context}_\n\n"
    
    if in_progress:
        response += "**In Progress:**\n"
        for t in in_progress[:3]:
            response += f"• {t.title}\n"
        response += "\n"
    
    if blocked:
        response += "**Blocked:**\n"
        for t in blocked[:3]:
            response += f"• {t.title} - {t.blocked_by}\n"
        response += "\n"
    
    todo = [t for t in tasks if t.status == TaskStatus.TODO]
    if todo:
        response += f"**Suggested next:** {todo[0].title}"
    
    return {"messages": [AIMessage(content=response)]}


def review_node(state: ProjState) -> dict:
    """Generate daily/weekly review."""
    active_tasks = [t for t in state.tasks.values() if t.status == TaskStatus.TODO]
    
    # Sort by priority
    active_tasks.sort(key=lambda t: (t.priority, t.created_at))
    
    response = "🎯 **Today's Focus**\n\n"
    
    if not active_tasks:
        response += "No active tasks. Time to capture some work?\n"
    else:
        for i, task in enumerate(active_tasks[:5], 1):
            project_name = ""
            if task.project_id and task.project_id in state.projects:
                project_name = f"[{state.projects[task.project_id].name}] "
            response += f"{i}. {project_name}{task.title}\n"
    
    inbox_count = len(state.inbox)
    if inbox_count > 0:
        response += f"\n📥 {inbox_count} item(s) in inbox to triage"
    
    return {"messages": [AIMessage(content=response)]}


def respond_node(state: ProjState) -> dict:
    """Generic response handler for unrouted messages."""
    return {
        "messages": [AIMessage(content="How can I help you with your projects today? You can:\n• Capture a new task or idea\n• Review your priorities\n• Resume a project\n• Triage your inbox")],
        "next_agent": None,
    }


def route_after_supervisor(state: ProjState) -> Literal["capture", "triage", "resume", "review", "respond"]:
    """Route to the appropriate sub-agent based on supervisor decision."""
    return state.next_agent or "respond"


def create_proj_graph() -> StateGraph:
    """Create and compile the project management agent graph."""
    
    # Build the graph
    builder = StateGraph(ProjState)
    
    # Add nodes
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("capture", capture_node)
    builder.add_node("triage", triage_node)
    builder.add_node("resume", resume_node)
    builder.add_node("review", review_node)
    builder.add_node("respond", respond_node)
    
    # Set entry point
    builder.set_entry_point("supervisor")
    
    # Add conditional edges from supervisor
    builder.add_conditional_edges(
        "supervisor",
        route_after_supervisor,
        {
            "capture": "capture",
            "triage": "triage",
            "resume": "resume",
            "review": "review",
            "respond": "respond",
        }
    )
    
    # All sub-agents end after responding
    builder.add_edge("capture", END)
    builder.add_edge("triage", END)
    builder.add_edge("resume", END)
    builder.add_edge("review", END)
    builder.add_edge("respond", END)
    
    return builder.compile()


# Singleton graph instance
_graph = None

def get_graph() -> StateGraph:
    """Get or create the compiled graph."""
    global _graph
    if _graph is None:
        _graph = create_proj_graph()
    return _graph
