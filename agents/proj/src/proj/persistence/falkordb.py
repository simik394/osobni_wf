"""FalkorDB persistence for Proj agent state.

Primary storage backend with JSON fallback.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from falkordb import FalkorDB

from proj.state import ProjState, Project, Task, InboxItem, Context, Decision, TaskStatus, ProjectStatus, EnergyLevel


# FalkorDB connection
FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6379"))
GRAPH_NAME = "proj_agent"

# JSON fallback path
JSON_STATE_PATH = Path.home() / ".proj" / "state.json"


class ProjStore:
    """State storage with FalkorDB primary and JSON fallback."""
    
    def __init__(self):
        self._db: FalkorDB | None = None
        self._graph = None
        self._use_falkor = True
    
    def _get_db(self):
        """Get or create FalkorDB connection."""
        if self._db is None:
            try:
                self._db = FalkorDB(host=FALKORDB_HOST, port=FALKORDB_PORT)
                self._graph = self._db.select_graph(GRAPH_NAME)
                self._ensure_schema()
            except Exception as e:
                print(f"[ProjStore] FalkorDB unavailable: {e}, using JSON fallback")
                self._use_falkor = False
        return self._graph
    
    def _ensure_schema(self):
        """Create indexes if needed."""
        try:
            self._graph.query("CREATE INDEX FOR (p:Project) ON (p.id)")
            self._graph.query("CREATE INDEX FOR (t:Task) ON (t.id)")
            self._graph.query("CREATE INDEX FOR (i:InboxItem) ON (i.id)")
            self._graph.query("CREATE INDEX FOR (c:Context) ON (c.id)")
            self._graph.query("CREATE INDEX FOR (d:Decision) ON (d.id)")
        except Exception:
            pass  # Indexes may already exist
    
    # =========================================================================
    # FalkorDB Operations
    # =========================================================================
    
    def save_project(self, project: Project) -> str:
        """Save or update a project."""
        if not self._use_falkor:
            return self._json_save_project(project)
        
        graph = self._get_db()
        query = """
        MERGE (p:Project {id: $id})
        SET p.name = $name,
            p.description = $description,
            p.status = $status,
            p.goal = $goal,
            p.created_at = $created_at,
            p.updated_at = $updated_at,
            p.last_touched = $last_touched,
            p.tags = $tags,
            p.last_context = $last_context
        RETURN p.id
        """
        result = graph.query(query, {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "status": project.status.value,
            "goal": project.goal,
            "created_at": project.created_at.isoformat(),
            "updated_at": datetime.now().isoformat(),
            "last_touched": project.last_touched.isoformat(),
            "tags": json.dumps(project.tags),
            "last_context": project.last_context,
        })
        return project.id
    
    def save_task(self, task: Task) -> str:
        """Save or update a task."""
        if not self._use_falkor:
            return self._json_save_task(task)
        
        graph = self._get_db()
        query = """
        MERGE (t:Task {id: $id})
        SET t.title = $title,
            t.description = $description,
            t.project_id = $project_id,
            t.status = $status,
            t.priority = $priority,
            t.energy = $energy,
            t.due_date = $due_date,
            t.created_at = $created_at,
            t.updated_at = $updated_at,
            t.tags = $tags,
            t.blocked_by = $blocked_by,
            t.notes = $notes,
            t.estimated_duration_minutes = $estimated_duration_minutes,
            t.actual_duration_minutes = $actual_duration_minutes,
            t.started_at = $started_at,
            t.completed_at = $completed_at
        RETURN t.id
        """
        result = graph.query(query, {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "project_id": task.project_id,
            "status": task.status.value,
            "priority": task.priority,
            "energy": task.energy.value,
            "due_date": task.due_date.isoformat() if task.due_date else None,
            "created_at": task.created_at.isoformat(),
            "updated_at": datetime.now().isoformat(),
            "tags": json.dumps(task.tags),
            "blocked_by": task.blocked_by,
            "notes": task.notes,
            "estimated_duration_minutes": task.estimated_duration_minutes,
            "actual_duration_minutes": task.actual_duration_minutes,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        })
        
        # Update project relationship (BELONGS_TO)
        # First delete existing relationship to ensure consistency
        graph.query("""
            MATCH (t:Task {id: $task_id})-[r:BELONGS_TO]->()
            DELETE r
        """, {"task_id": task.id})

        if task.project_id:
            graph.query("""
                MATCH (t:Task {id: $task_id}), (p:Project {id: $project_id})
                MERGE (t)-[:BELONGS_TO]->(p)
            """, {"task_id": task.id, "project_id": task.project_id})

        # Update blocker relationship (DEPENDS_ON)
        # First delete existing relationship
        graph.query("""
            MATCH (t:Task {id: $task_id})-[r:DEPENDS_ON]->()
            DELETE r
        """, {"task_id": task.id})

        if task.blocked_by:
             # Just checking if it looks like a task ID
             if task.blocked_by.startswith("task_"):
                 graph.query("""
                    MATCH (t:Task {id: $task_id}), (b:Task {id: $blocker_id})
                    MERGE (t)-[:DEPENDS_ON]->(b)
                 """, {"task_id": task.id, "blocker_id": task.blocked_by})
        
        return task.id
    
    def save_inbox_item(self, item: InboxItem) -> str:
        """Save an inbox item."""
        if not self._use_falkor:
            return self._json_save_inbox_item(item)
        
        graph = self._get_db()
        query = """
        MERGE (i:InboxItem {id: $id})
        SET i.content = $content,
            i.source = $source,
            i.captured_at = $captured_at,
            i.context = $context
        RETURN i.id
        """
        result = graph.query(query, {
            "id": item.id,
            "content": item.content,
            "source": item.source,
            "captured_at": item.captured_at.isoformat(),
            "context": json.dumps(item.context),
        })
        return item.id

    def save_context(self, context: Context) -> str:
        """Save a context node."""
        if not self._use_falkor:
            return self._json_save_context(context)

        graph = self._get_db()
        query = """
        MERGE (c:Context {id: $id})
        SET c.content = $content,
            c.project_id = $project_id,
            c.created_at = $created_at
        RETURN c.id
        """
        graph.query(query, {
            "id": context.id,
            "content": context.content,
            "project_id": context.project_id,
            "created_at": context.created_at.isoformat()
        })

        # Relationship (CONTEXT_FOR)
        # Clear existing
        graph.query("""
            MATCH (c:Context {id: $id})-[r:CONTEXT_FOR]->()
            DELETE r
        """, {"id": context.id})

        if context.project_id:
            graph.query("""
                MATCH (c:Context {id: $id}), (p:Project {id: $project_id})
                MERGE (c)-[:CONTEXT_FOR]->(p)
            """, {"id": context.id, "project_id": context.project_id})

        return context.id

    def save_decision(self, decision: Decision) -> str:
        """Save a decision node."""
        if not self._use_falkor:
            return self._json_save_decision(decision)

        graph = self._get_db()
        query = """
        MERGE (d:Decision {id: $id})
        SET d.title = $title,
            d.rationale = $rationale,
            d.project_id = $project_id,
            d.task_id = $task_id,
            d.status = $status,
            d.created_at = $created_at
        RETURN d.id
        """
        graph.query(query, {
            "id": decision.id,
            "title": decision.title,
            "rationale": decision.rationale,
            "project_id": decision.project_id,
            "task_id": decision.task_id,
            "status": decision.status,
            "created_at": decision.created_at.isoformat()
        })

        # Update relationships
        # Clear existing BELONGS_TO
        graph.query("""
            MATCH (d:Decision {id: $id})-[r:BELONGS_TO]->()
            DELETE r
        """, {"id": decision.id})

        if decision.project_id:
            graph.query("""
                MATCH (d:Decision {id: $id}), (p:Project {id: $project_id})
                MERGE (d)-[:BELONGS_TO]->(p)
            """, {"id": decision.id, "project_id": decision.project_id})

        if decision.task_id:
            graph.query("""
                MATCH (d:Decision {id: $id}), (t:Task {id: $task_id})
                MERGE (d)-[:BELONGS_TO]->(t)
            """, {"id": decision.id, "task_id": decision.task_id})

        return decision.id
    
    def delete_inbox_item(self, item_id: str) -> bool:
        """Delete an inbox item."""
        if not self._use_falkor:
            return self._json_delete_inbox_item(item_id)
        
        graph = self._get_db()
        graph.query("MATCH (i:InboxItem {id: $id}) DELETE i", {"id": item_id})
        return True
    
    def load_state(self) -> ProjState:
        """Load full state from storage."""
        if not self._use_falkor:
            return self._json_load_state()
        
        graph = self._get_db()
        state = ProjState()
        
        # Load projects
        result = graph.query("MATCH (p:Project) RETURN p")
        for record in result.result_set:
            node = record[0]
            props = node.properties
            project = Project(
                id=props["id"],
                name=props["name"],
                description=props.get("description"),
                status=ProjectStatus(props.get("status", "active")),
                goal=props.get("goal"),
                created_at=datetime.fromisoformat(props["created_at"]),
                updated_at=datetime.fromisoformat(props.get("updated_at", props["created_at"])),
                last_touched=datetime.fromisoformat(props.get("last_touched", props["created_at"])),
                tags=json.loads(props.get("tags", "[]")),
                last_context=props.get("last_context"),
            )
            state.projects[project.id] = project
        
        # Load tasks
        result = graph.query("MATCH (t:Task) RETURN t")
        for record in result.result_set:
            node = record[0]
            props = node.properties
            task = Task(
                id=props["id"],
                title=props["title"],
                description=props.get("description"),
                project_id=props.get("project_id"),
                status=TaskStatus(props.get("status", "todo")),
                priority=int(props.get("priority", 2)),
                energy=EnergyLevel(props.get("energy", "medium")),
                due_date=datetime.fromisoformat(props["due_date"]) if props.get("due_date") else None,
                created_at=datetime.fromisoformat(props["created_at"]),
                updated_at=datetime.fromisoformat(props.get("updated_at", props["created_at"])),
                tags=json.loads(props.get("tags", "[]")),
                blocked_by=props.get("blocked_by"),
                notes=props.get("notes"),
                estimated_duration_minutes=int(props["estimated_duration_minutes"]) if props.get("estimated_duration_minutes") else None,
                actual_duration_minutes=int(props["actual_duration_minutes"]) if props.get("actual_duration_minutes") else None,
                started_at=datetime.fromisoformat(props["started_at"]) if props.get("started_at") else None,
                completed_at=datetime.fromisoformat(props["completed_at"]) if props.get("completed_at") else None,
            )
            state.tasks[task.id] = task
        
        # Load inbox
        result = graph.query("MATCH (i:InboxItem) RETURN i ORDER BY i.captured_at DESC")
        for record in result.result_set:
            node = record[0]
            props = node.properties
            item = InboxItem(
                id=props["id"],
                content=props["content"],
                source=props.get("source", "manual"),
                captured_at=datetime.fromisoformat(props["captured_at"]),
                context=json.loads(props.get("context", "{}")),
            )
            state.inbox.append(item)

        # Load contexts
        result = graph.query("MATCH (c:Context) RETURN c")
        for record in result.result_set:
            node = record[0]
            props = node.properties
            context = Context(
                id=props["id"],
                content=props["content"],
                project_id=props["project_id"],
                created_at=datetime.fromisoformat(props["created_at"]),
            )
            state.contexts[context.id] = context

        # Load decisions
        result = graph.query("MATCH (d:Decision) RETURN d")
        for record in result.result_set:
            node = record[0]
            props = node.properties
            decision = Decision(
                id=props["id"],
                title=props["title"],
                rationale=props["rationale"],
                project_id=props.get("project_id"),
                task_id=props.get("task_id"),
                status=props.get("status", "proposed"),
                created_at=datetime.fromisoformat(props["created_at"]),
            )
            state.decisions[decision.id] = decision
        
        return state
    
    def save_state(self, state: ProjState) -> None:
        """Save full state to storage."""
        for project in state.projects.values():
            self.save_project(project)
        for task in state.tasks.values():
            self.save_task(task)
        for item in state.inbox:
            self.save_inbox_item(item)
        for context in state.contexts.values():
            self.save_context(context)
        for decision in state.decisions.values():
            self.save_decision(decision)
    
    # =========================================================================
    # JSON Fallback Operations
    # =========================================================================
    
    def _json_load_state(self) -> ProjState:
        """Load state from JSON file."""
        if not JSON_STATE_PATH.exists():
            return ProjState()
        
        try:
            data = json.loads(JSON_STATE_PATH.read_text())
            state = ProjState()
            
            for pid, pdata in data.get("projects", {}).items():
                state.projects[pid] = Project(**pdata)
            
            for tid, tdata in data.get("tasks", {}).items():
                state.tasks[tid] = Task(**tdata)
            
            for idata in data.get("inbox", []):
                state.inbox.append(InboxItem(**idata))

            for cid, cdata in data.get("contexts", {}).items():
                state.contexts[cid] = Context(**cdata)

            for did, ddata in data.get("decisions", {}).items():
                state.decisions[did] = Decision(**ddata)
            
            return state
        except Exception as e:
            print(f"[ProjStore] Failed to load JSON state: {e}")
            return ProjState()
    
    def _json_save_state(self, state: ProjState) -> None:
        """Save state to JSON file."""
        JSON_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        data = {
            "projects": {pid: p.model_dump(mode="json") for pid, p in state.projects.items()},
            "tasks": {tid: t.model_dump(mode="json") for tid, t in state.tasks.items()},
            "inbox": [i.model_dump(mode="json") for i in state.inbox],
            "contexts": {cid: c.model_dump(mode="json") for cid, c in state.contexts.items()},
            "decisions": {did: d.model_dump(mode="json") for did, d in state.decisions.items()},
        }
        
        JSON_STATE_PATH.write_text(json.dumps(data, indent=2, default=str))
    
    def _json_save_project(self, project: Project) -> str:
        state = self._json_load_state()
        state.projects[project.id] = project
        self._json_save_state(state)
        return project.id
    
    def _json_save_task(self, task: Task) -> str:
        state = self._json_load_state()
        state.tasks[task.id] = task
        self._json_save_state(state)
        return task.id
    
    def _json_save_inbox_item(self, item: InboxItem) -> str:
        state = self._json_load_state()
        state.inbox.append(item)
        self._json_save_state(state)
        return item.id

    def _json_save_context(self, context: Context) -> str:
        state = self._json_load_state()
        state.contexts[context.id] = context
        self._json_save_state(state)
        return context.id

    def _json_save_decision(self, decision: Decision) -> str:
        state = self._json_load_state()
        state.decisions[decision.id] = decision
        self._json_save_state(state)
        return decision.id
    
    def _json_delete_inbox_item(self, item_id: str) -> bool:
        state = self._json_load_state()
        state.inbox = [i for i in state.inbox if i.id != item_id]
        self._json_save_state(state)
        return True


# Singleton store instance
_store: ProjStore | None = None


def get_store() -> ProjStore:
    """Get or create the store singleton."""
    global _store
    if _store is None:
        _store = ProjStore()
    return _store
