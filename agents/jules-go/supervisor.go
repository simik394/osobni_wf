package jules

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Supervisor implements the Watchdog pattern for monitoring and healing failed sessions.
// Based on 2025 AI orchestration patterns - self-healing with reflection & repair loop.
type Supervisor struct {
	client       *Client
	input        chan Task
	feedback     chan RepairRequest
	logger       *slog.Logger
	pollInterval time.Duration
	maxRetries   int
	wg           sync.WaitGroup
	stopCh       chan struct{}
}

// Task represents a session task to be monitored.
type Task struct {
	SessionID   string
	Description string
	CreatedAt   time.Time
	Retries     int
}

// RepairRequest is sent when a session needs repair intervention.
type RepairRequest struct {
	Task         Task
	Error        error
	Context      string
	SuggestedFix string
	Timestamp    time.Time
}

// SupervisorConfig holds configuration for the Supervisor.
type SupervisorConfig struct {
	PollInterval time.Duration
	MaxRetries   int
	BufferSize   int
}

// DefaultSupervisorConfig returns sensible defaults.
func DefaultSupervisorConfig() SupervisorConfig {
	return SupervisorConfig{
		PollInterval: 30 * time.Second,
		MaxRetries:   3,
		BufferSize:   100,
	}
}

// NewSupervisor creates a new Supervisor with the given configuration.
func NewSupervisor(client *Client, logger *slog.Logger, cfg SupervisorConfig) *Supervisor {
	return &Supervisor{
		client:       client,
		input:        make(chan Task, cfg.BufferSize),
		feedback:     make(chan RepairRequest, cfg.BufferSize),
		logger:       logger.With("component", "supervisor"),
		pollInterval: cfg.PollInterval,
		maxRetries:   cfg.MaxRetries,
		stopCh:       make(chan struct{}),
	}
}

// Start begins the supervisor's monitoring loop.
func (s *Supervisor) Start(ctx context.Context) {
	s.wg.Add(1)
	go s.watch(ctx)
	s.logger.Info("Supervisor started", "poll_interval", s.pollInterval)
}

// Stop gracefully shuts down the supervisor.
func (s *Supervisor) Stop() {
	close(s.stopCh)
	s.wg.Wait()
	s.logger.Info("Supervisor stopped")
}

// Submit adds a task to be monitored.
func (s *Supervisor) Submit(task Task) {
	task.CreatedAt = time.Now()
	s.input <- task
}

// Repairs returns the channel for receiving repair requests.
func (s *Supervisor) Repairs() <-chan RepairRequest {
	return s.feedback
}

// watch is the main monitoring loop.
func (s *Supervisor) watch(ctx context.Context) {
	defer s.wg.Done()

	activeTasks := make(map[string]Task)
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("Context cancelled, stopping supervisor")
			return
		case <-s.stopCh:
			return
		case task := <-s.input:
			activeTasks[task.SessionID] = task
			s.logger.Info("Added task to monitor", "session_id", task.SessionID)
		case <-ticker.C:
			s.checkAllTasks(ctx, activeTasks)
		}
	}
}

// checkAllTasks polls all active tasks for status.
func (s *Supervisor) checkAllTasks(ctx context.Context, tasks map[string]Task) {
	for sessionID, task := range tasks {
		session, err := s.client.GetSession(ctx, sessionID)
		if err != nil {
			s.handleFailure(task, err, "Failed to get session status")
			if task.Retries >= s.maxRetries {
				delete(tasks, sessionID)
				s.logger.Warn("Max retries exceeded, removing task",
					"session_id", sessionID,
					"retries", task.Retries)
			} else {
				task.Retries++
				tasks[sessionID] = task
			}
			continue
		}

		// Check if session needs repair based on status
		// This is a placeholder - actual status checking depends on Jules API response format
		if s.needsRepair(session) {
			s.handleFailure(task, nil, "Session in failed state")
		}
	}
}

// needsRepair determines if a session requires intervention.
func (s *Supervisor) needsRepair(session *Session) bool {
	// Placeholder: implement actual status checking
	// In practice, check session.Status == "failed" or "blocked"
	return false
}

// handleFailure creates a repair request for a failed task.
func (s *Supervisor) handleFailure(task Task, err error, context string) {
	repair := RepairRequest{
		Task:         task,
		Error:        err,
		Context:      context,
		SuggestedFix: s.suggestFix(task, err),
		Timestamp:    time.Now(),
	}

	select {
	case s.feedback <- repair:
		s.logger.Info("Repair request created",
			"session_id", task.SessionID,
			"context", context)
	default:
		s.logger.Warn("Repair channel full, dropping request",
			"session_id", task.SessionID)
	}
}

// suggestFix generates a suggested fix based on error context.
func (s *Supervisor) suggestFix(task Task, err error) string {
	if err == nil {
		return "Retry the session with fresh context"
	}

	errStr := err.Error()
	switch {
	case contains(errStr, "rate limit"):
		return "Wait for rate limit to reset before retrying"
	case contains(errStr, "context length"):
		return "Trim conversation history and retry"
	case contains(errStr, "timeout"):
		return "Increase timeout and retry with smaller task"
	case contains(errStr, "authentication"):
		return "Check API key validity"
	default:
		return fmt.Sprintf("Manual investigation needed: %v", err)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > len(substr) && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
