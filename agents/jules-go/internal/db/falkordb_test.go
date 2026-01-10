package db

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestMain(m *testing.M) {
	// Skip tests in CI environment
	if os.Getenv("CI") != "" {
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func setup(t *testing.T) (*Client, context.Context) {
	t.Helper()
	ctx := context.Background()
	client, err := NewClient(ctx, "localhost:6379")
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	// Clear the graph before each test
	_, err = client.rdb.Do(ctx, "GRAPH.QUERY", GraphName, "MATCH (n) DETACH DELETE n").Result()
	if err != nil {
		t.Fatalf("failed to clear graph: %v", err)
	}

	return client, ctx
}

func TestCRUDJulesSession(t *testing.T) {
	client, ctx := setup(t)
	defer client.Close()

	sessionID := uuid.New().String()
	now := time.Now().UTC().Truncate(time.Second)

	// Create
	session := &JulesSession{
		ID:        sessionID,
		Status:    "created",
		Repo:      "test-repo",
		Task:      "test-task",
		CreatedAt: now,
		UpdatedAt: now,
	}
	err := client.CreateJulesSession(ctx, session)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	// Read
	retrievedSession, err := client.GetJulesSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("failed to get session: %v", err)
	}
	if retrievedSession == nil {
		t.Fatalf("session not found")
	}

	if retrievedSession.ID != session.ID {
		t.Errorf("expected ID %s, got %s", session.ID, retrievedSession.ID)
	}
	if retrievedSession.Status != session.Status {
		t.Errorf("expected Status %s, got %s", session.Status, retrievedSession.Status)
	}
	if !retrievedSession.CreatedAt.Equal(session.CreatedAt) {
		t.Errorf("expected CreatedAt %v, got %v", session.CreatedAt, retrievedSession.CreatedAt)
	}

	// Update
	updatedAt := time.Now().UTC().Truncate(time.Second)
	session.Status = "updated"
	session.UpdatedAt = updatedAt

	err = client.UpdateJulesSession(ctx, session)
	if err != nil {
		t.Fatalf("failed to update session: %v", err)
	}

	retrievedSession, err = client.GetJulesSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("failed to get session after update: %v", err)
	}
	if retrievedSession.Status != "updated" {
		t.Errorf("expected updated status, got %s", retrievedSession.Status)
	}
	if !retrievedSession.UpdatedAt.Equal(updatedAt) {
		t.Errorf("expected UpdatedAt %v, got %v", updatedAt, retrievedSession.UpdatedAt)
	}

	// Delete
	err = client.DeleteJulesSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("failed to delete session: %v", err)
	}

	retrievedSession, err = client.GetJulesSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("failed to get session after delete: %v", err)
	}
	if retrievedSession != nil {
		t.Errorf("session not deleted")
	}
}

func TestGetNonExistentJulesSession(t *testing.T) {
	client, ctx := setup(t)
	defer client.Close()

	session, err := client.GetJulesSession(ctx, "non-existent-id")
	if err != nil {
		t.Fatalf("failed to get non-existent session: %v", err)
	}
	if session != nil {
		t.Errorf("expected nil for non-existent session, got %v", session)
	}
}

func TestStringEscaping(t *testing.T) {
	client, ctx := setup(t)
	defer client.Close()

	sessionID := uuid.New().String()
	now := time.Now().UTC().Truncate(time.Second)

	// Create a session with a task that contains a single quote
	taskWithQuote := "this is a task with a ' quote"
	session := &JulesSession{
		ID:        sessionID,
		Status:    "created",
		Repo:      "test-repo",
		Task:      taskWithQuote,
		CreatedAt: now,
		UpdatedAt: now,
	}
	err := client.CreateJulesSession(ctx, session)
	if err != nil {
		t.Fatalf("failed to create session with quote: %v", err)
	}

	// Read the session back and verify the task
	retrievedSession, err := client.GetJulesSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("failed to get session with quote: %v", err)
	}
	if retrievedSession == nil {
		t.Fatalf("session with quote not found")
	}
	if retrievedSession.Task != taskWithQuote {
		t.Errorf("expected task '%s', got '%s'", taskWithQuote, retrievedSession.Task)
	}
}

func TestBackslashEscaping(t *testing.T) {
	client, ctx := setup(t)
	defer client.Close()

	sessionID := uuid.New().String()
	now := time.Now().UTC().Truncate(time.Second)

	// Create a session with a task that contains a backslash
	taskWithBackslash := "this is a task with a \\ backslash"
	session := &JulesSession{
		ID:        sessionID,
		Status:    "created",
		Repo:      "test-repo",
		Task:      taskWithBackslash,
		CreatedAt: now,
		UpdatedAt: now,
	}
	err := client.CreateJulesSession(ctx, session)
	if err != nil {
		t.Fatalf("failed to create session with backslash: %v", err)
	}

	// Read the session back and verify the task
	retrievedSession, err := client.GetJulesSession(ctx, sessionID)
	if err != nil {
		t.Fatalf("failed to get session with backslash: %v", err)
	}
	if retrievedSession == nil {
		t.Fatalf("session with backslash not found")
	}
	if retrievedSession.Task != taskWithBackslash {
		t.Errorf("expected task '%s', got '%s'", taskWithBackslash, retrievedSession.Task)
	}
}
