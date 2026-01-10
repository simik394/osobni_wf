package jules

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"jules-go/internal/logging"
	"log/slog"
	"net/http"
)

const (
	apiBaseURL = "https://jules.googleapis.com/v1alpha"
)

// Client is a client for the Jules API.
type Client struct {
	apiKey     string
	httpClient *http.Client
	logger     *slog.Logger
	baseURL    string
}

// NewClient creates a new Jules API client.
func NewClient(apiKey string, logger *slog.Logger) (*Client, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("JULES_API_KEY is required")
	}

	return &Client{
		apiKey:     apiKey,
		httpClient: &http.Client{},
		logger:     logger.With("component", "jules-client"),
		baseURL:    apiBaseURL,
	}, nil
}

// Session represents a Jules session.
type Session struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Add other session fields as needed
}

// Activity represents a Jules activity.
type Activity struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	// Add other activity fields as needed
}

// Plan represents a Jules plan.
type Plan struct {
	// Define plan structure as needed
}

// CreateSession creates a new Jules session.
func (c *Client) CreateSession(ctx context.Context) (*Session, error) {
	req, err := c.newRequest(ctx, "POST", c.baseURL+"/sessions", nil)
	if err != nil {
		return nil, err
	}

	var session Session
	if _, err := c.do(req, &session); err != nil {
		return nil, err
	}

	return &session, nil
}

// GetSession retrieves a Jules session.
func (c *Client) GetSession(ctx context.Context, sessionID string) (*Session, error) {
	url := fmt.Sprintf("%s/sessions/%s", c.baseURL, sessionID)
	req, err := c.newRequest(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	var session Session
	if _, err := c.do(req, &session); err != nil {
		return nil, err
	}

	return &session, nil
}

// ListSessions lists Jules sessions.
func (c *Client) ListSessions(ctx context.Context) ([]*Session, error) {
	req, err := c.newRequest(ctx, "GET", c.baseURL+"/sessions", nil)
	if err != nil {
		return nil, err
	}

	var sessions []*Session
	if _, err := c.do(req, &sessions); err != nil {
		return nil, err
	}

	return sessions, nil
}

// ListActivities lists Jules activities for a session.
func (c *Client) ListActivities(ctx context.Context, sessionID string) ([]*Activity, error) {
	url := fmt.Sprintf("%s/sessions/%s/activities", c.baseURL, sessionID)
	req, err := c.newRequest(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	var activities []*Activity
	if _, err := c.do(req, &activities); err != nil {
		return nil, err
	}

	return activities, nil
}

// ApprovePlan approves a plan for a session.
func (c *Client) ApprovePlan(ctx context.Context, sessionID string, plan Plan) error {
	url := fmt.Sprintf("%s/sessions/%s/plan:approve", c.baseURL, sessionID)
	req, err := c.newRequest(ctx, "POST", url, plan)
	if err != nil {
		return err
	}

	_, err = c.do(req, nil)
	return err
}

func (c *Client) newRequest(ctx context.Context, method, url string, body interface{}) (*http.Request, error) {
	logger := logging.FromContext(ctx)

	var buf io.ReadWriter
	if body != nil {
		buf = &bytes.Buffer{}
		enc := json.NewEncoder(buf)
		enc.SetEscapeHTML(false)
		if err := enc.Encode(body); err != nil {
			logger.Error("failed to encode request body", "err", err)
			return nil, err
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, url, buf)
	if err != nil {
		logger.Error("failed to create new request", "err", err)
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	return req, nil
}

func (c *Client) do(req *http.Request, v interface{}) (*http.Response, error) {
	logger := logging.FromContext(req.Context()).With(
		"method", req.Method,
		"url", req.URL.String(),
	)

	logger.Info("sending API request")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		logger.Error("API request failed", "err", err)
		return nil, err
	}
	defer resp.Body.Close()

	logger = logger.With("status_code", resp.StatusCode)

	if resp.StatusCode >= 200 && resp.StatusCode <= 299 {
		logger.Info("API request successful")
		if v != nil {
			if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
				logger.Error("failed to decode successful response", "err", err)
				return nil, fmt.Errorf("error decoding response: %w", err)
			}
		}
		return resp, nil
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	logger.Error("API request returned error", "response_body", string(bodyBytes))
	return resp, fmt.Errorf("API error: %s", string(bodyBytes))
}
