package notify

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNtfyClient_Send(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST request, got %s", r.Method)
		}

		title := r.Header.Get("Title")
		if title != "Test Title" {
			t.Errorf("Expected title 'Test Title', got '%s'", title)
		}

		priority := r.Header.Get("Priority")
		if priority != "high" {
			t.Errorf("Expected priority 'high', got '%s'", priority)
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("Failed to read request body: %v", err)
		}
		if string(body) != "Test Message" {
			t.Errorf("Expected body 'Test Message', got '%s'", string(body))
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewNtfyClient(server.URL, "test-topic")
	err := client.Send(context.Background(), "Test Title", "Test Message", "high")
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}
}

func TestNtfyClient_SendWithTags(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST request, got %s", r.Method)
		}

		title := r.Header.Get("Title")
		if title != "Test Title With Tags" {
			t.Errorf("Expected title 'Test Title With Tags', got '%s'", title)
		}

		tagsHeader := r.Header.Get("Tags")
		expectedTags := "tag1,tag2"
		if tagsHeader != expectedTags {
			t.Errorf("Expected tags '%s', got '%s'", expectedTags, tagsHeader)
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("Failed to read request body: %v", err)
		}
		if string(body) != "Test Message With Tags" {
			t.Errorf("Expected body 'Test Message With Tags', got '%s'", string(body))
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	client := NewNtfyClient(server.URL, "test-topic")
	err := client.SendWithTags(context.Background(), "Test Title With Tags", "Test Message With Tags", []string{"tag1", "tag2"})
	if err != nil {
		t.Fatalf("SendWithTags failed: %v", err)
	}
}
