import pytest
from datetime import datetime, timedelta
from proj.state import ProjState, Task, TaskStatus
from proj.agent import review_node
from langchain_core.messages import HumanMessage
import time

def test_daily_review():
    state = ProjState()

    # We must ensure IDs are unique, because id generation uses datetime.now()
    # and if execution is fast they might clash if resolution is low (though strftime usually handles seconds, maybe not milliseconds in the format)
    # The format is %Y%m%d_%H%M%S. If called twice in same second, IDs collide.

    yesterday = datetime.now() - timedelta(days=1)

    # Task 1
    t1 = Task(id="task_1", title="Completed Yesterday", status=TaskStatus.DONE, completed_at=yesterday)
    state.tasks[t1.id] = t1

    # Task 2
    t2 = Task(id="task_2", title="Must do today", status=TaskStatus.TODO)
    state.tasks[t2.id] = t2

    state.messages.append(HumanMessage(content="review"))

    # Ensure state is populated correctly
    assert len(state.tasks) == 2
    assert state.tasks["task_1"].title == "Completed Yesterday"

    result = review_node(state)
    message = result["messages"][0].content

    assert "Daily Standup" in message
    assert "Yesterday's Wins" in message
    assert "Completed Yesterday" in message
    assert "Must do today" in message

def test_weekly_review():
    state = ProjState()
    # Add a task completed 3 days ago
    three_days_ago = datetime.now() - timedelta(days=3)
    t1 = Task(id="task_3", title="Completed Recently", status=TaskStatus.DONE, completed_at=three_days_ago)
    state.tasks[t1.id] = t1

    state.messages.append(HumanMessage(content="weekly review"))

    result = review_node(state)
    message = result["messages"][0].content

    assert "Weekly Review" in message
    assert "Completed last 7 days" in message
    assert "Completed Recently" in message
