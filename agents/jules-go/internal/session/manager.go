package session

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"sync"
	"time"
)

const (
	// StatusActive indicates that the session is currently active.
	StatusActive = "active"
	// StatusCompleted indicates that the session has completed successfully.
	StatusCompleted = "completed"
	// StatusFailed indicates that the session has failed.
	StatusFailed = "failed"
)

const concurrencyLimit = 15

// Session holds the metadata for a single session.
type Session struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	Task      string    `json:"task"`
}

// Manager is responsible for managing the lifecycle of sessions.
// It is thread-safe.
type Manager struct {
	sessions map[string]*Session
	mutex    sync.RWMutex
	logger   *slog.Logger
}

// NewManager creates and returns a new session Manager.
func NewManager(logger *slog.Logger) *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
		logger:   logger.With("component", "session-manager"),
	}
}

// generateID creates a cryptographically secure random string to be used as a session ID.
func generateID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// CreateSession creates a new session for a given task.
// It returns an error if the concurrency limit is reached.
func (m *Manager) CreateSession(task string) (*Session, error) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if len(m.sessions) >= concurrencyLimit {
		m.logger.Warn("concurrency limit reached", "limit", concurrencyLimit)
		return nil, errors.New("concurrency limit reached")
	}

	id, err := generateID()
	if err != nil {
		m.logger.Error("failed to generate session ID", "err", err)
		return nil, errors.New("failed to generate session ID")
	}

	session := &Session{
		ID:        id,
		Status:    StatusActive,
		CreatedAt: time.Now(),
		Task:      task,
	}

	m.sessions[id] = session
	m.logger.Info("session created", "session_id", id, "task", task)
	return session, nil
}

// GetSession retrieves a session by its ID.
// It returns nil if the session is not found.
func (m *Manager) GetSession(id string) *Session {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	session, _ := m.sessions[id]
	return session
}

// ListSessions returns a slice of all current sessions.
func (m *Manager) ListSessions() []*Session {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	sessions := make([]*Session, 0, len(m.sessions))
	for _, session := range m.sessions {
		sessions = append(sessions, session)
	}
	return sessions
}

// DeleteSession removes a session from the manager.
func (m *Manager) DeleteSession(id string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if _, ok := m.sessions[id]; ok {
		delete(m.sessions, id)
		m.logger.Info("session deleted", "session_id", id)
	}
}

// UpdateSessionStatus updates the status of a specific session.
// It returns an error if the session is not found.
func (m *Manager) UpdateSessionStatus(id, status string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	session, ok := m.sessions[id]
	if !ok {
		m.logger.Warn("attempted to update non-existent session", "session_id", id)
		return errors.New("session not found")
	}

	session.Status = status
	m.logger.Info("session status updated", "session_id", id, "new_status", status)
	return nil
}
