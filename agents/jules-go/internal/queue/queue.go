package queue

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"jules-go/internal/db"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// TaskQueue is a persistent task queue backed by FalkorDB.
type TaskQueue struct {
	rdb *redis.Client
}

// NewTaskQueue creates a new TaskQueue.
func NewTaskQueue(ctx context.Context, addr string) (*TaskQueue, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return &TaskQueue{rdb: rdb}, nil
}

// Enqueue adds a task to the queue.
func (q *TaskQueue) Enqueue(ctx context.Context, task *Task) error {
	// 1. Check for duplicates based on IssueID for queued or processing tasks
	checkQuery := `
		MATCH (t:Task {issue_id: $issue_id})
		WHERE t.status IN ['queued', 'processing']
		RETURN t
	`
	checkParams := map[string]interface{}{"issue_id": task.IssueID}
	parameterizedCheck, err := db.BuildParameterizedQuery(checkQuery, checkParams)
	if err != nil {
		return fmt.Errorf("failed to build duplicate check query: %w", err)
	}

	res, err := q.rdb.Do(ctx, "GRAPH.QUERY", db.GraphName, parameterizedCheck).Result()
	if err != nil {
		return fmt.Errorf("failed to check for duplicate task: %w", err)
	}

	results, ok := res.([]interface{})
	if !ok {
		return fmt.Errorf("invalid response format for duplicate check")
	}
	if len(results) > 1 {
		data, ok := results[1].([]interface{})
		if ok && len(data) > 0 {
			slog.Info("task with this issue ID already exists", "issue_id", task.IssueID)
			return nil // Task already exists, do not enqueue
		}
	}

	// 2. Enqueue the task
	task.ID = uuid.NewString()
	task.Status = StatusQueued
	task.CreatedAt = time.Now().UTC()
	task.UpdatedAt = time.Now().UTC()

	createQuery := `
		CREATE (t:Task {
			id: $id,
			issue_id: $issue_id,
			priority: $priority,
			status: $status,
			payload: $payload,
			created_at: $created_at,
			updated_at: $updated_at
		})
	`
	createParams := map[string]interface{}{
		"id":         task.ID,
		"issue_id":   task.IssueID,
		"priority":   int(task.Priority),
		"status":     string(task.Status),
		"payload":    task.Payload,
		"created_at": task.CreatedAt.Unix(),
		"updated_at": task.UpdatedAt.Unix(),
	}

	parameterizedCreate, err := db.BuildParameterizedQuery(createQuery, createParams)
	if err != nil {
		return fmt.Errorf("failed to build create query: %w", err)
	}

	_, err = q.rdb.Do(ctx, "GRAPH.QUERY", db.GraphName, parameterizedCreate).Result()
	if err != nil {
		return fmt.Errorf("failed to enqueue task: %w", err)
	}

	slog.Info("task enqueued successfully", "task_id", task.ID, "issue_id", task.IssueID)
	return nil
}

// Dequeue retrieves and locks the highest-priority task from the queue.
func (q *TaskQueue) Dequeue(ctx context.Context) (*Task, error) {
	query := `
		MATCH (t:Task {status: 'queued'})
		WITH t
		ORDER BY t.priority DESC, t.created_at ASC
		LIMIT 1
		SET t.status = 'processing', t.updated_at = $now
		RETURN t.id, t.issue_id, t.priority, t.status, t.payload, t.created_at, t.updated_at
	`
	params := map[string]interface{}{
		"now": time.Now().UTC().Unix(),
	}

	parameterizedQuery, err := db.BuildParameterizedQuery(query, params)
	if err != nil {
		return nil, fmt.Errorf("failed to build dequeue query: %w", err)
	}

	res, err := q.rdb.Do(ctx, "GRAPH.QUERY", db.GraphName, parameterizedQuery).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to dequeue task: %w", err)
	}

	results, ok := res.([]interface{})
	if !ok || len(results) < 2 {
		return nil, nil // No task found or invalid response
	}

	header, ok := results[0].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format: header is not an array")
	}
	colIndex := make(map[string]int)
	for i, col := range header {
		colName, _ := col.(string)
		colIndex[colName] = i
	}

	data, ok := results[1].([]interface{})
	if !ok || len(data) == 0 {
		return nil, nil // No task in the queue
	}

	row, ok := data[0].([]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid row format")
	}

	id, ok := row[colIndex["t.id"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid id format in dequeue")
	}
	issueID, ok := row[colIndex["t.issue_id"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid issue_id format in dequeue")
	}
	priority, err := db.SafeToInt64(row[colIndex["t.priority"]])
	if err != nil {
		return nil, fmt.Errorf("invalid priority format in dequeue: %w", err)
	}
	status, ok := row[colIndex["t.status"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid status format in dequeue")
	}
	payload, ok := row[colIndex["t.payload"]].(string)
	if !ok {
		return nil, fmt.Errorf("invalid payload format in dequeue")
	}
	createdAt, err := db.SafeToInt64(row[colIndex["t.created_at"]])
	if err != nil {
		return nil, fmt.Errorf("invalid created_at format in dequeue: %w", err)
	}
	updatedAt, err := db.SafeToInt64(row[colIndex["t.updated_at"]])
	if err != nil {
		return nil, fmt.Errorf("invalid updated_at format in dequeue: %w", err)
	}

	task := &Task{
		ID:        id,
		IssueID:   issueID,
		Priority:  TaskPriority(priority),
		Status:    TaskStatus(status),
		Payload:   payload,
		CreatedAt: time.Unix(createdAt, 0),
		UpdatedAt: time.Unix(updatedAt, 0),
	}

	slog.Info("task dequeued for processing", "task_id", task.ID)
	return task, nil
}

// CompleteTask marks a task as completed by deleting it.
func (q *TaskQueue) CompleteTask(ctx context.Context, taskID string) error {
	query := `MATCH (t:Task {id: $id}) DELETE t`
	params := map[string]interface{}{"id": taskID}
	parameterizedQuery, err := db.BuildParameterizedQuery(query, params)
	if err != nil {
		return fmt.Errorf("failed to build complete task query: %w", err)
	}
	_, err = q.rdb.Do(ctx, "GRAPH.QUERY", db.GraphName, parameterizedQuery).Result()
	if err != nil {
		return fmt.Errorf("failed to complete task %s: %w", taskID, err)
	}
	slog.Info("task completed and removed", "task_id", taskID)
	return nil
}

// FailTask moves a task to the dead-letter queue.
func (q *TaskQueue) FailTask(ctx context.Context, taskID string) error {
	query := `
		MATCH (t:Task {id: $id})
		SET t.status = 'dead', t.updated_at = $now
	`
	params := map[string]interface{}{
		"id":  taskID,
		"now": time.Now().UTC().Unix(),
	}
	parameterizedQuery, err := db.BuildParameterizedQuery(query, params)
	if err != nil {
		return fmt.Errorf("failed to build fail task query: %w", err)
	}
	_, err = q.rdb.Do(ctx, "GRAPH.QUERY", db.GraphName, parameterizedQuery).Result()
	if err != nil {
		return fmt.Errorf("failed to move task %s to dead-letter queue: %w", taskID, err)
	}
	slog.Warn("task moved to dead-letter queue", "task_id", taskID)
	return nil
}
