"""
Tests for YouTrack client integration.

Run with: pytest test_youtrack.py -v
"""
import pytest
from unittest.mock import patch, MagicMock
from models import Priority, Task
from youtrack_client import (
    map_priority, issue_to_task, fetch_project_tasks,
    get_next_task, YouTrackConfig
)


class TestMapPriority:
    """Test priority mapping from YouTrack to planner"""
    
    def test_show_stopper(self):
        assert map_priority("Show-stopper") == Priority.SHOW_STOPPER
    
    def test_critical(self):
        assert map_priority("Critical") == Priority.CRITICAL
    
    def test_major(self):
        assert map_priority("Major") == Priority.MAJOR
    
    def test_normal(self):
        assert map_priority("Normal") == Priority.NORMAL
    
    def test_minor(self):
        assert map_priority("Minor") == Priority.MINOR
    
    def test_none_returns_normal(self):
        assert map_priority(None) == Priority.NORMAL
    
    def test_unknown_returns_normal(self):
        assert map_priority("Unknown") == Priority.NORMAL


class TestIssueToTask:
    """Test conversion from YouTrack issue to Task"""
    
    def test_minimal_issue(self):
        issue = {
            "id": "TOOLS-123",
            "summary": "Test issue"
        }
        task = issue_to_task(issue)
        assert task.id == "TOOLS-123"
        assert task.summary == "Test issue"
        assert task.goal_id == "default"
        assert task.priority == Priority.NORMAL
        assert task.estimate_hours == 4
    
    def test_issue_with_priority(self):
        issue = {
            "id": "TOOLS-124",
            "summary": "Critical issue",
            "customFields": {
                "Priority": "Critical",
                "State": "In Progress"
            }
        }
        task = issue_to_task(issue)
        assert task.priority == Priority.CRITICAL
    
    def test_issue_empty_custom_fields(self):
        issue = {
            "id": "TOOLS-125",
            "summary": "No custom fields",
            "customFields": {}
        }
        task = issue_to_task(issue)
        assert task.priority == Priority.NORMAL


class TestFetchProjectTasks:
    """Test project task fetching"""
    
    def test_empty_issues(self):
        tasks, goals = fetch_project_tasks("TOOLS", issues=[])
        assert tasks == []
        assert goals == []
    
    def test_none_issues(self):
        tasks, goals = fetch_project_tasks("TOOLS", issues=None)
        assert tasks == []
        assert goals == []
    
    def test_with_issues(self):
        issues = [
            {"id": "TOOLS-1", "summary": "Task 1"},
            {"id": "TOOLS-2", "summary": "Task 2"},
        ]
        tasks, goals = fetch_project_tasks("TOOLS", issues=issues)
        assert len(tasks) == 2
        assert len(goals) >= 1  # At least default goal
        assert tasks[0].id == "TOOLS-1"


class TestGetNextTask:
    """Test next task recommendation"""
    
    def test_empty_project(self):
        result = get_next_task("EMPTY", issues=[])
        assert result is None
    
    def test_single_task(self):
        issues = [
            {"id": "TOOLS-1", "summary": "Only task"}
        ]
        result = get_next_task("TOOLS", issues=issues)
        assert result is not None
        assert result["task_id"] == "TOOLS-1"


class TestYouTrackConfig:
    """Test configuration dataclass"""
    
    def test_default_config(self):
        config = YouTrackConfig()
        assert config.base_url == "https://napoveda.youtrack.cloud"
        assert config.token == ""
    
    def test_custom_config(self):
        config = YouTrackConfig(
            base_url="https://custom.youtrack.cloud",
            token="secret"
        )
        assert config.base_url == "https://custom.youtrack.cloud"
        assert config.token == "secret"
