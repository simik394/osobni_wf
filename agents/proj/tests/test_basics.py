import pytest
from datetime import datetime
from proj.state import ProjState, Task, Project, InboxItem, Context, Decision, TaskStatus
from proj.persistence.falkordb import ProjStore, get_store
import os
import json

# Mock FalkorDB connection for testing
class MockFalkorDB:
    def __init__(self, host, port):
        pass
    def select_graph(self, name):
        return MockGraph()

class MockGraph:
    def query(self, query, params=None):
        # Return empty result set for mocking
        return MockResultSet([])

class MockResultSet:
    def __init__(self, data):
        self.result_set = data

@pytest.fixture
def mock_store(monkeypatch):
    monkeypatch.setattr("proj.persistence.falkordb.FalkorDB", MockFalkorDB)
    # Force JSON fallback to avoid actual DB connection attempts if mocking fails
    store = ProjStore()
    store._use_falkor = False # Use JSON fallback for unit tests to be safe/simple
    # Use a temp file for JSON
    import tempfile
    from pathlib import Path
    temp_dir = tempfile.TemporaryDirectory()
    store._json_save_state = lambda s: None # Mock save to avoid writing to disk
    store._json_load_state = lambda: ProjState() # Mock load
    return store

def test_state_models():
    t = Task(title="Test Task")
    assert t.status == TaskStatus.TODO
    assert t.id.startswith("task_")

    p = Project(name="Test Project")
    assert p.id.startswith("proj_")

    i = InboxItem(content="Buy milk")
    assert i.id.startswith("inbox_")

    c = Context(content="Working on persistence", project_id="proj_1")
    assert c.id.startswith("ctx_")

    d = Decision(title="Use FalkorDB", rationale="Graph native", project_id="proj_1")
    assert d.id.startswith("dec_")

def test_store_methods(mock_store):
    p = Project(name="P1")
    mock_store.save_project(p)
    # Since we mocked save/load to do nothing/return empty, we just check no error raised.

from proj.intents.detector import detect_intent, IntentClassification

def test_intent_detection(monkeypatch):
    # Mock the LLM call
    class MockDetector:
        def invoke(self, input):
            return IntentClassification(intent="capture", confidence=0.9, reasoning="Test")

    monkeypatch.setattr("proj.intents.detector.get_intent_detector", lambda: MockDetector())

    result = detect_intent("remind me to sleep")
    assert result.intent == "capture"
    assert result.confidence == 0.9
