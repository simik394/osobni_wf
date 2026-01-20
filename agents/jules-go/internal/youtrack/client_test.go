package youtrack

import (
	"context"
	"log/slog"
	"os"
	"testing"
)

func TestNewClient(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	tests := []struct {
		name    string
		cfg     ClientConfig
		wantErr bool
	}{
		{
			name: "valid config",
			cfg: ClientConfig{
				BaseURL:    "https://example.youtrack.cloud",
				Token:      "test-token",
				ProjectKey: "TOOLS",
			},
			wantErr: false,
		},
		{
			name: "missing base URL",
			cfg: ClientConfig{
				Token:      "test-token",
				ProjectKey: "TOOLS",
			},
			wantErr: true,
		},
		{
			name: "missing token",
			cfg: ClientConfig{
				BaseURL:    "https://example.youtrack.cloud",
				ProjectKey: "TOOLS",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewClient(tt.cfg, logger)
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
				if client == nil {
					t.Error("expected non-nil client")
				}
			}
		})
	}
}

func TestIssueStruct(t *testing.T) {
	issue := Issue{
		Summary:     "Test issue",
		Description: "Test description",
		Project:     "TOOLS",
	}

	if issue.Summary != "Test issue" {
		t.Errorf("unexpected summary: %s", issue.Summary)
	}
}

func TestCommentStruct(t *testing.T) {
	comment := Comment{
		Text: "Test comment",
	}

	if comment.Text != "Test comment" {
		t.Errorf("unexpected text: %s", comment.Text)
	}
}

func TestClientConfig(t *testing.T) {
	cfg := ClientConfig{
		BaseURL:    "https://test.youtrack.cloud",
		Token:      "abc123",
		ProjectKey: "TEST",
	}

	if cfg.BaseURL != "https://test.youtrack.cloud" {
		t.Errorf("unexpected BaseURL: %s", cfg.BaseURL)
	}
	if cfg.Token != "abc123" {
		t.Errorf("unexpected Token: %s", cfg.Token)
	}
	if cfg.ProjectKey != "TEST" {
		t.Errorf("unexpected ProjectKey: %s", cfg.ProjectKey)
	}
}

func TestNewRequestHeaders(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	client, err := NewClient(ClientConfig{
		BaseURL: "https://test.youtrack.cloud",
		Token:   "test-token",
	}, logger)
	if err != nil {
		t.Fatalf("failed to create client: %v", err)
	}

	req, err := client.newRequest(context.Background(), "GET", "/api/issues", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	if auth := req.Header.Get("Authorization"); auth != "Bearer test-token" {
		t.Errorf("unexpected Authorization header: %s", auth)
	}
	if ct := req.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("unexpected Content-Type header: %s", ct)
	}
	if accept := req.Header.Get("Accept"); accept != "application/json" {
		t.Errorf("unexpected Accept header: %s", accept)
	}
}
