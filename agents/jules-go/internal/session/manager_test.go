package session

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"testing"
)

// mockNotifier is a mock implementation of the Notifier interface for testing.
type mockNotifier struct {
	SendFunc func(ctx context.Context, title, message, priority string) error
}

func (m *mockNotifier) Send(ctx context.Context, title, message, priority string) error {
	if m.SendFunc != nil {
		return m.SendFunc(ctx, title, message, priority)
	}
	return nil
}

func newTestManager(concurrencyLimit int64) *Manager {
	return NewManager(slog.New(slog.NewTextHandler(io.Discard, nil)), &mockNotifier{}, concurrencyLimit)
}

func TestNewManager(t *testing.T) {
	m := newTestManager(5)
	if m == nil {
		t.Fatal("NewManager returned nil")
	}
	if m.sessions == nil {
		t.Error("NewManager did not initialize sessions map")
	}
}

func TestCreateSession(t *testing.T) {
	m := newTestManager(5)
	task := "test_task"

	session, err := m.CreateSession(task)
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	if session.Task != task {
		t.Errorf("expected task %q, got %q", task, session.Task)
	}
	if session.Status != StatusActive {
		t.Errorf("expected status %q, got %q", StatusActive, session.Status)
	}
	if m.GetSession(session.ID) == nil {
		t.Error("session not found in manager after creation")
	}
}

func TestGetSession(t *testing.T) {
	m := newTestManager(5)
	task := "test_task"

	session, _ := m.CreateSession(task)
	retrievedSession := m.GetSession(session.ID)

	if retrievedSession == nil {
		t.Fatal("GetSession returned nil for existing session")
	}
	if retrievedSession.ID != session.ID {
		t.Errorf("retrieved session ID does not match original")
	}
}

func TestDeleteSession(t *testing.T) {
	m := newTestManager(5)
	task := "test_task"

	session, _ := m.CreateSession(task)
	m.DeleteSession(session.ID)

	if m.GetSession(session.ID) != nil {
		t.Error("session found in manager after deletion")
	}
}

func TestListSessions(t *testing.T) {
	m := newTestManager(5)
	task1 := "task1"
	task2 := "task2"

	if _, err := m.CreateSession(task1); err != nil {
		t.Fatalf("CreateSession for task1 failed: %v", err)
	}
	if _, err := m.CreateSession(task2); err != nil {
		t.Fatalf("CreateSession for task2 failed: %v", err)
	}

	sessions := m.ListSessions()
	if len(sessions) != 2 {
		t.Errorf("expected 2 sessions, got %d", len(sessions))
	}
}

func TestUpdateSessionStatus(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	mockN := &mockNotifier{
		SendFunc: func(ctx context.Context, title, message, priority string) error {
			if title == "Session Completed" {
				defer wg.Done()
				if priority != "high" {
					t.Errorf("expected priority 'high', got '%s'", priority)
				}
			}
			return nil
		},
	}

	m := NewManager(slog.New(slog.NewTextHandler(io.Discard, nil)), mockN, 5)
	task := "test_task"

	session, _ := m.CreateSession(task)
	err := m.UpdateSessionStatus(session.ID, StatusCompleted)
	if err != nil {
		t.Fatalf("UpdateSessionStatus failed: %v", err)
	}

	updatedSession := m.GetSession(session.ID)
	if updatedSession.Status != StatusCompleted {
		t.Errorf("expected status %q, got %q", StatusCompleted, updatedSession.Status)
	}

	wg.Wait()
}

func TestConcurrencyLimit(t *testing.T) {
	concurrencyLimit := int64(5)
	m := newTestManager(concurrencyLimit)
	for i := 0; i < int(concurrencyLimit); i++ {
		_, err := m.CreateSession(fmt.Sprintf("task-%d", i))
		if err != nil {
			t.Fatalf("failed to create session %d: %v", i, err)
		}
	}

	_, err := m.CreateSession("overflow_task")
	if err == nil {
		t.Error("expected error when creating session beyond concurrency limit, but got nil")
	}
}

func TestThreadSafety(t *testing.T) {
	concurrencyLimit := int64(15)
	m := newTestManager(concurrencyLimit)
	var wg sync.WaitGroup
	numRoutines := 50

	// Create sessions concurrently
	for i := 0; i < numRoutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = m.CreateSession("some_task")
		}()
	}

	wg.Wait()

	// Validate that the number of created sessions does not exceed the limit
	sessions := m.ListSessions()
	if len(sessions) > int(concurrencyLimit) {
		t.Errorf("expected at most %d sessions, got %d", concurrencyLimit, len(sessions))
	}
}
