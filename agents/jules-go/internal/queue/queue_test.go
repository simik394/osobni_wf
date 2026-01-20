package queue

import (
	"context"
	"testing"

	"jules-go/internal/db"
)

func setupQueue(t *testing.T) (*TaskQueue, context.Context) {
	t.Helper()
	ctx := context.Background()
	q, err := NewTaskQueue(ctx, "localhost:6379")
	if err != nil {
		t.Fatalf("failed to create task queue: %v", err)
	}

	// Clear the graph before each test
	_, err = q.rdb.Do(ctx, "GRAPH.QUERY", db.GraphName, "MATCH (n) DETACH DELETE n").Result()
	if err != nil {
		t.Fatalf("failed to clear graph: %v", err)
	}

	return q, ctx
}

func TestEnqueueDequeue(t *testing.T) {
	q, ctx := setupQueue(t)

	task := &Task{
		IssueID:  "test-issue-1",
		Priority: PriorityNormal,
		Payload:  "test payload",
	}

	err := q.Enqueue(ctx, task)
	if err != nil {
		t.Fatalf("failed to enqueue task: %v", err)
	}

	dequeuedTask, err := q.Dequeue(ctx)
	if err != nil {
		t.Fatalf("failed to dequeue task: %v", err)
	}

	if dequeuedTask == nil {
		t.Fatalf("expected a task, got nil")
	}

	if dequeuedTask.IssueID != task.IssueID {
		t.Errorf("expected issue ID %s, got %s", task.IssueID, dequeuedTask.IssueID)
	}
	if dequeuedTask.Status != StatusProcessing {
		t.Errorf("expected status 'processing', got '%s'", dequeuedTask.Status)
	}
}

func TestTaskDeduplication(t *testing.T) {
	q, ctx := setupQueue(t)

	task1 := &Task{
		IssueID:  "dedup-issue",
		Priority: PriorityNormal,
	}
	task2 := &Task{
		IssueID:  "dedup-issue",
		Priority: PriorityHigh,
	}

	// Enqueue the first task
	if err := q.Enqueue(ctx, task1); err != nil {
		t.Fatalf("failed to enqueue first task: %v", err)
	}

	// Attempt to enqueue the second task with the same issue ID
	if err := q.Enqueue(ctx, task2); err != nil {
		t.Fatalf("enqueueing duplicate task failed: %v", err)
	}

	// Dequeue the one and only task
	dequeued, err := q.Dequeue(ctx)
	if err != nil {
		t.Fatalf("failed to dequeue task: %v", err)
	}
	if dequeued == nil {
		t.Fatal("did not dequeue a task when one was expected")
	}

	// Try to dequeue again, should be empty
	shouldBeNil, err := q.Dequeue(ctx)
	if err != nil {
		t.Fatalf("failed to dequeue from empty queue: %v", err)
	}
	if shouldBeNil != nil {
		t.Errorf("expected empty queue, but got a task: %+v", shouldBeNil)
	}
}

func TestPriorityHandling(t *testing.T) {
	q, ctx := setupQueue(t)

	taskLow := &Task{IssueID: "issue-low", Priority: PriorityLow}
	taskNormal := &Task{IssueID: "issue-normal", Priority: PriorityNormal}
	taskHigh := &Task{IssueID: "issue-high", Priority: PriorityHigh}

	// Enqueue in random order
	q.Enqueue(ctx, taskNormal)
	q.Enqueue(ctx, taskHigh)
	q.Enqueue(ctx, taskLow)

	// Dequeue and check order
	high, _ := q.Dequeue(ctx)
	if high == nil {
		t.Fatal("expected high priority task, got nil")
	}
	if high.Priority != PriorityHigh {
		t.Errorf("expected high priority, got %d", high.Priority)
	}

	normal, _ := q.Dequeue(ctx)
	if normal == nil {
		t.Fatal("expected normal priority task, got nil")
	}
	if normal.Priority != PriorityNormal {
		t.Errorf("expected normal priority, got %d", normal.Priority)
	}

	low, _ := q.Dequeue(ctx)
	if low == nil {
		t.Fatal("expected low priority task, got nil")
	}
	if low.Priority != PriorityLow {
		t.Errorf("expected low priority, got %d", low.Priority)
	}
}

func TestFailAndCompleteTask(t *testing.T) {
	q, ctx := setupQueue(t)

	task := &Task{IssueID: "issue-fail"}
	q.Enqueue(ctx, task)

	dequeued, _ := q.Dequeue(ctx)

	// Fail the task
	err := q.FailTask(ctx, dequeued.ID)
	if err != nil {
		t.Fatalf("failed to fail task: %v", err)
	}

	// Verify it's in a dead state (cannot be dequeued)
	shouldBeNil, _ := q.Dequeue(ctx)
	if shouldBeNil != nil {
		t.Error("dequeued a task that should be dead")
	}

	// Now test completion
	taskToComplete := &Task{IssueID: "issue-complete"}
	q.Enqueue(ctx, taskToComplete)
	dequeuedComplete, _ := q.Dequeue(ctx)

	err = q.CompleteTask(ctx, dequeuedComplete.ID)
	if err != nil {
		t.Fatalf("failed to complete task: %v", err)
	}

	shouldBeNil, _ = q.Dequeue(ctx)
	if shouldBeNil != nil {
		t.Error("dequeued a task that should have been completed")
	}
}

func TestDequeueEmpty(t *testing.T) {
	q, ctx := setupQueue(t)

	task, err := q.Dequeue(ctx)
	if err != nil {
		t.Fatalf("dequeue from empty queue failed: %v", err)
	}
	if task != nil {
		t.Errorf("expected nil from empty queue, got %+v", task)
	}
}
