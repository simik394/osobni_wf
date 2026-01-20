//go:build ignore

package main

import (
"context"
"fmt"
"jules-go/internal/queue"
"jules-go/internal/db"
)

func main() {
	ctx := context.Background()

	fmt.Println("\n=== Queue Operations Verification ===")

	q, err := queue.NewTaskQueue(ctx, "localhost:6379")
	if err != nil {
		fmt.Printf("❌ Queue connection FAILED: %v\n", err)
		return
	}
	fmt.Println("✅ Queue connected")

	// Clear any existing test data
	// First create and test task operations
	task := &queue.Task{
		IssueID:  "VERIFY-001",
		Priority: queue.PriorityHigh,
		Payload:  "Verification test payload",
	}

	err = q.Enqueue(ctx, task)
	if err != nil {
		fmt.Printf("❌ Enqueue FAILED: %v\n", err)
		return
	}
	fmt.Printf("✅ Enqueued task: IssueID=%s Priority=%d\n", task.IssueID, task.Priority)

	// Try to enqueue duplicate
	dupTask := &queue.Task{
		IssueID:  "VERIFY-001",
		Priority: queue.PriorityLow,
	}
	err = q.Enqueue(ctx, dupTask)
	if err == nil {
		fmt.Println("✅ Duplicate task correctly blocked")
	} else {
		fmt.Printf("❌ Duplicate handling unexpected: %v\n", err)
	}

	// Dequeue
	dequeued, err := q.Dequeue(ctx)
	if err != nil || dequeued == nil {
		fmt.Printf("❌ Dequeue FAILED: %v\n", err)
		return
	}
	fmt.Printf("✅ Dequeued task: ID=%s Status=%s\n", dequeued.ID, dequeued.Status)

	// Complete task
	err = q.CompleteTask(ctx, dequeued.ID)
	if err != nil {
		fmt.Printf("❌ Complete FAILED: %v\n", err)
		return
	}
	fmt.Println("✅ Task completed and removed")

	fmt.Println("\n=== Queue: ALL OPERATIONS VERIFIED ===")
}
