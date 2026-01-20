import pytest
from datetime import datetime, timedelta
from proj.state import ProjState, Task, Project, Context
from proj.agent import resume_node
from langchain_core.messages import AIMessage

def test_resume_node_with_context():
    state = ProjState()
    project = Project(name="Test Project")
    state.projects[project.id] = project
    state.active_project_id = project.id

    # Create a context
    context = Context(content="Working on integration tests", project_id=project.id)
    state.contexts[context.id] = context

    result = resume_node(state)
    message = result["messages"][0].content

    assert "Resuming: Test Project" in message
    assert "Working on integration tests" in message

def test_resume_node_no_context():
    state = ProjState()
    project = Project(name="New Project")
    state.projects[project.id] = project
    state.active_project_id = project.id

    result = resume_node(state)
    message = result["messages"][0].content

    assert "Resuming: New Project" in message
    assert "Context" not in message
