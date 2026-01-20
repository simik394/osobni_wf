package queue

import "time"

// TaskPriority represents the priority of a task.
type TaskPriority int

const (
	PriorityLow    TaskPriority = 1
	PriorityNormal TaskPriority = 2
	PriorityHigh   TaskPriority = 3
)

// TaskStatus represents the status of a task.
type TaskStatus string

const (
	StatusQueued     TaskStatus = "queued"
	StatusProcessing TaskStatus = "processing"
	StatusDead       TaskStatus = "dead"
)

// Task represents a unit of work to be processed.
type Task struct {
	ID        string       `redis:"id"`
	IssueID   string       `redis:"issue_id"`
	Priority  TaskPriority `redis:"priority"`
	Status    TaskStatus   `redis:"status"`
	Payload   string       `redis:"payload"`
	CreatedAt time.Time    `redis:"created_at"`
	UpdatedAt time.Time    `redis:"updated_at"`
}
