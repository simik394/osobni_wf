import pytest
from proj.state import ProjState, Task, Project
from proj.persistence import ProjStore
import uuid
from datetime import datetime

# Reuse mock environment from previous tests setup, but simplified here for unit testing persistence specifically
@pytest.fixture
def store(tmp_path, monkeypatch):
    s = ProjStore()
    s._use_falkor = False
    monkeypatch.setattr("proj.persistence.falkordb.JSON_STATE_PATH", tmp_path / "state.json")
    return s

def test_relationship_updates(store):
    # Mock graph queries to verify relationship logic
    queries = []

    class MockGraph:
        def query(self, query, params=None):
            queries.append((query, params))
            return None

    class MockDB:
        def select_graph(self, name):
            return MockGraph()

    store._db = MockDB()
    store._graph = MockGraph()
    store._use_falkor = True # Enable falkor mode to test query generation
    store._ensure_schema = lambda: None

    # 1. Create a task with project
    t1 = Task(title="Task 1", project_id="proj_A")
    store.save_task(t1)

    # Verify BELONGS_TO creation
    # Should see DELETE first, then MERGE
    assert any("DELETE r" in q[0] and "BELONGS_TO" in q[0] for q in queries)
    assert any("MERGE (t)-[:BELONGS_TO]->(p)" in q[0] for q in queries)

    # Clear queries
    queries.clear()

    # 2. Update task to new project
    t1.project_id = "proj_B"
    store.save_task(t1)

    # Verify BELONGS_TO update
    # Should see DELETE first, then MERGE with new project
    delete_queries = [q for q in queries if "DELETE r" in q[0] and "BELONGS_TO" in q[0]]
    merge_queries = [q for q in queries if "MERGE (t)-[:BELONGS_TO]->(p)" in q[0]]

    assert len(delete_queries) == 1
    assert len(merge_queries) == 1
    assert merge_queries[0][1]["project_id"] == "proj_B"

def test_context_id_generation():
    from proj.state import Context
    c1 = Context(content="A", project_id="p1")
    c2 = Context(content="B", project_id="p1")
    assert c1.id != c2.id
    assert "ctx_" in c1.id
