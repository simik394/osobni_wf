"""FastAPI server for Proj agent.

Exposes endpoints for capturing, resuming, and reviewing.
"""

import os
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from datetime import datetime

from proj.agent import get_graph, create_proj_graph
from proj.state import ProjState, Project
from proj.persistence import get_store
# Import YouTrack integration stub
from proj.integrations.youtrack import get_youtrack_client

app = FastAPI(title="Proj Agent API")

class CaptureRequest(BaseModel):
    content: str
    source: Optional[str] = "api"

class ResumeRequest(BaseModel):
    project_name: Optional[str] = None

class ReviewRequest(BaseModel):
    scope: str = "daily"

class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    status: str
    task_count: int

@app.on_event("startup")
async def startup_event():
    """Initialize store on startup."""
    get_store()

@app.post("/capture")
async def capture_item(request: CaptureRequest):
    """Capture a new item to the inbox."""
    store = get_store()
    state = store.load_state()
    graph = get_graph()

    # Add capture message
    state.messages.append(HumanMessage(content=f"capture: {request.content}"))

    # Invoke graph
    result = graph.invoke(state)

    # Save state
    new_state = ProjState(**result)
    store.save_state(new_state)

    # Extract response
    response_msg = "Captured"
    if result.get("messages"):
        last_msg = result["messages"][-1]
        response_msg = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)

    # Optional: Integration with YouTrack (Stubbed)
    # if request.source == "youtrack":
    #     yt = get_youtrack_client()
    #     yt.create_issue("PROJ", "Captured via API", request.content)

    return {"status": "success", "message": response_msg}

@app.get("/projects", response_model=List[ProjectResponse])
async def list_projects():
    """List all projects."""
    store = get_store()
    state = store.load_state()

    projects = []
    for p in state.projects.values():
        task_count = len([t for t in state.tasks.values() if t.project_id == p.id])
        projects.append(ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            status=p.status.value,
            task_count=task_count
        ))
    return projects

@app.post("/resume")
async def resume_work(request: ResumeRequest):
    """Resume work on a project."""
    store = get_store()
    state = store.load_state()
    graph = get_graph()

    if request.project_name:
         for p in state.projects.values():
            if p.name.lower() == request.project_name.lower():
                state.active_project_id = p.id
                break

    state.messages.append(HumanMessage(content="resume"))
    result = graph.invoke(state)

    new_state = ProjState(**result)
    store.save_state(new_state)

    response_msg = "Resumed"
    if result.get("messages"):
        last_msg = result["messages"][-1]
        response_msg = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)

    return {"message": response_msg}

@app.post("/review")
async def review_work(request: ReviewRequest):
    """Trigger a review."""
    store = get_store()
    state = store.load_state()
    graph = get_graph()

    state.messages.append(HumanMessage(content="review"))
    result = graph.invoke(state)

    new_state = ProjState(**result)
    store.save_state(new_state)

    response_msg = "Reviewed"
    if result.get("messages"):
        last_msg = result["messages"][-1]
        response_msg = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)

    return {"message": response_msg}
