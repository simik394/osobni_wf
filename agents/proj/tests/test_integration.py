"""Integration tests for the Proj agent.

These tests simulate a full user flow: capture -> persist -> resume.
"""

import pytest
import os
import time
from datetime import datetime
from proj.agent import create_proj_graph
from proj.persistence import ProjStore, get_store
from proj.state import ProjState, Task, Project
from langchain_core.messages import HumanMessage
from proj.intents.detector import IntentClassification

# Mock LLM and persistence for integration test speed and reliability
@pytest.fixture
def mock_integration_environment(monkeypatch, tmp_path):
    # Mock Store using JSON fallback in memory
    store = ProjStore()
    store._use_falkor = False

    # Override JSON path to use tmp_path
    monkeypatch.setattr("proj.persistence.falkordb.JSON_STATE_PATH", tmp_path / "state.json")

    # Mock Intent Detector to return deterministic results
    class MockDetector:
        def invoke(self, input):
            content = input["input"].lower()
            if "capture" in content or "add" in content:
                return IntentClassification(intent="capture", confidence=1.0, reasoning="Test")
            elif "resume" in content:
                return IntentClassification(intent="resume", confidence=1.0, reasoning="Test")
            elif "review" in content:
                 return IntentClassification(intent="review", confidence=1.0, reasoning="Test")
            return IntentClassification(intent="respond", confidence=1.0, reasoning="Test")

    monkeypatch.setattr("proj.intents.detector.get_intent_detector", lambda: MockDetector())

    # Use a fresh state for each test
    return store

def test_capture_and_persist(mock_integration_environment):
    store = mock_integration_environment
    graph = create_proj_graph()

    # Initial state
    state = ProjState()

    # 1. User captures a task
    state.messages.append(HumanMessage(content="Capture buy milk"))
    result = graph.invoke(state)

    # Verify capture
    new_state = ProjState(**result)
    assert len(new_state.inbox) == 1
    assert "buy milk" in new_state.inbox[0].content.lower()

    # 2. Persist
    store.save_state(new_state)

    # 3. Load state and verify
    loaded_state = store.load_state()
    assert len(loaded_state.inbox) == 1
    assert loaded_state.inbox[0].id == new_state.inbox[0].id

def test_resume_flow(mock_integration_environment):
    store = mock_integration_environment
    graph = create_proj_graph()

    # Setup state with a project
    state = ProjState()
    project = Project(name="Project X", last_context="Working on Phase 1")
    state.projects[project.id] = project
    state.active_project_id = project.id

    # 1. User asks to resume
    state.messages.append(HumanMessage(content="Resume work"))
    result = graph.invoke(state)

    # Verify resume response
    last_msg = result["messages"][-1].content
    assert "Resuming: Project X" in last_msg
    assert "Working on Phase 1" in last_msg
