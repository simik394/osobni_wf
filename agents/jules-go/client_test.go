package jules

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func newTestClient(t *testing.T) *Client {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	client, err := NewClient("test-api-key", logger)
	if err != nil {
		t.Fatalf("failed to create test client: %v", err)
	}
	return client
}

func TestNewClient(t *testing.T) {
	t.Run("with API key", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		client, err := NewClient("test-api-key", logger)
		assert.NoError(t, err)
		assert.NotNil(t, client)
		assert.Equal(t, "test-api-key", client.apiKey)
	})

	t.Run("without API key", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(io.Discard, nil))
		client, err := NewClient("", logger)
		assert.Error(t, err)
		assert.Nil(t, client)
		assert.Contains(t, err.Error(), "JULES_API_KEY is required")
	})
}

func TestListSessions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/sessions", r.URL.Path)
		assert.Equal(t, "GET", r.Method)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sessionsResponse{
			Sessions: []*Session{
				{ID: "session-1", Name: "Session 1"},
				{ID: "session-2", Name: "Session 2"},
			},
		})
	}))
	defer server.Close()

	client := newTestClient(t)
	client.httpClient = server.Client()
	client.baseURL = server.URL

	sessions, err := client.ListSessions(context.Background())
	assert.NoError(t, err)
	assert.Len(t, sessions, 2)
	assert.Equal(t, "session-1", sessions[0].ID)
	assert.Equal(t, "Session 1", sessions[0].Name)
	assert.Equal(t, "session-2", sessions[1].ID)
	assert.Equal(t, "Session 2", sessions[1].Name)
}

func TestCreateSession(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/sessions", r.URL.Path)
		assert.Equal(t, "POST", r.Method)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&Session{
			ID:   "new-session-id",
			Name: "New Session",
		})
	}))
	defer server.Close()

	client := newTestClient(t)
	client.httpClient = server.Client()
	client.baseURL = server.URL

	session, err := client.CreateSession(context.Background())
	assert.NoError(t, err)
	assert.NotNil(t, session)
	assert.Equal(t, "new-session-id", session.ID)
	assert.Equal(t, "New Session", session.Name)
}

func TestGetSession(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/sessions/session-123", r.URL.Path)
			assert.Equal(t, "GET", r.Method)

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(&Session{
				ID:   "session-123",
				Name: "Test Session",
			})
		}))
		defer server.Close()

		client := newTestClient(t)
		client.httpClient = server.Client()
		client.baseURL = server.URL

		session, err := client.GetSession(context.Background(), "session-123")
		assert.NoError(t, err)
		assert.NotNil(t, session)
		assert.Equal(t, "session-123", session.ID)
		assert.Equal(t, "Test Session", session.Name)
	})

	t.Run("not found", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			assert.Equal(t, "/sessions/not-a-session", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			fmt.Fprintln(w, "Session not found")
		}))
		defer server.Close()

		client := newTestClient(t)
		client.httpClient = server.Client()
		client.baseURL = server.URL

		session, err := client.GetSession(context.Background(), "not-a-session")
		assert.Error(t, err)
		assert.Nil(t, session)
		assert.Contains(t, err.Error(), "Session not found")
	})
}

func TestApprovePlan(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/sessions/session-123/plan:approve", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		// The client uses x-goog-api-key, not Authorization Bearer
		assert.Equal(t, "test-api-key", r.Header.Get("x-goog-api-key"))

		var plan Plan
		err := json.NewDecoder(r.Body).Decode(&plan)
		assert.NoError(t, err)

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := newTestClient(t)
	client.httpClient = server.Client()
	client.baseURL = server.URL

	plan := Plan{}
	err := client.ApprovePlan(context.Background(), "session-123", plan)
	assert.NoError(t, err)
}
