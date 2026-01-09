package jules

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

const (
	apiBaseURL = "https://jules.googleapis.com/v1alpha"
)

// Client is a client for the Jules API.
type Client struct {
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Jules API client.
func NewClient() (*Client, error) {
	apiKey := os.Getenv("JULES_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("JULES_API_KEY environment variable not set")
	}

	return &Client{
		apiKey:     apiKey,
		httpClient: &http.Client{},
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
	req, err := c.newRequest(ctx, "POST", apiBaseURL+"/sessions", nil)
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
	url := fmt.Sprintf("%s/sessions/%s", apiBaseURL, sessionID)
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
	req, err := c.newRequest(ctx, "GET", apiBaseURL+"/sessions", nil)
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
	url := fmt.Sprintf("%s/sessions/%s/activities", apiBaseURL, sessionID)
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
	url := fmt.Sprintf("%s/sessions/%s/plan:approve", apiBaseURL, sessionID)
	req, err := c.newRequest(ctx, "POST", url, plan)
	if err != nil {
		return err
	}

	_, err = c.do(req, nil)
	return err
}

func (c *Client) newRequest(ctx context.Context, method, url string, body interface{}) (*http.Request, error) {
	var buf io.ReadWriter
	if body != nil {
		buf = &bytes.Buffer{}
		enc := json.NewEncoder(buf)
		enc.SetEscapeHTML(false)
		if err := enc.Encode(body); err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, url, buf)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	return req, nil
}

func (c *Client) do(req *http.Request, v interface{}) (*http.Response, error) {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode <= 299 {
		if v != nil {
			if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
				return nil, fmt.Errorf("error decoding response: %w", err)
			}
		}
		return resp, nil
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	return resp, fmt.Errorf("API error: %s", string(bodyBytes))
}
