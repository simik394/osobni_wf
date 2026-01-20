package youtrack

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

const (
	defaultTimeout = 30 * time.Second
)

// Client is a YouTrack API client for Jules agent.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
	logger     *slog.Logger
	projectKey string
}

// ClientConfig holds configuration for YouTrack client.
type ClientConfig struct {
	BaseURL    string // e.g., "https://napoveda.youtrack.cloud"
	Token      string // Permanent token
	ProjectKey string // Default project key for issues
}

// Issue represents a YouTrack issue.
type Issue struct {
	ID          string   `json:"id,omitempty"`
	Summary     string   `json:"summary"`
	Description string   `json:"description,omitempty"`
	Project     string   `json:"-"` // Not sent in JSON, derived from idReadable
	State       string   `json:"state,omitempty"`
	Type        string   `json:"type,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// IssueCreateRequest represents the request body for creating an issue.
type IssueCreateRequest struct {
	Project struct {
		ID string `json:"id"`
	} `json:"project"`
	Summary     string `json:"summary"`
	Description string `json:"description,omitempty"`
}

// Comment represents a YouTrack comment.
type Comment struct {
	Text string `json:"text"`
}

// NewClient creates a new YouTrack client.
func NewClient(cfg ClientConfig, logger *slog.Logger) (*Client, error) {
	if cfg.BaseURL == "" {
		return nil, fmt.Errorf("YouTrack base URL is required")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("YouTrack token is required")
	}

	return &Client{
		baseURL:    cfg.BaseURL,
		token:      cfg.Token,
		projectKey: cfg.ProjectKey,
		httpClient: &http.Client{Timeout: defaultTimeout},
		logger:     logger.With("component", "youtrack-client"),
	}, nil
}

// CreateIssue creates a new issue in YouTrack.
// Issues created by Jules are tagged with "jules-discovered".
func (c *Client) CreateIssue(ctx context.Context, issue Issue) (*Issue, error) {
	projectID := issue.Project
	if projectID == "" {
		projectID = c.projectKey
	}

	reqBody := map[string]interface{}{
		"project": map[string]string{
			"id": projectID,
		},
		"summary":     issue.Summary,
		"description": issue.Description,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal issue: %w", err)
	}

	req, err := c.newRequest(ctx, "POST", "/api/issues", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	var created Issue
	if err := c.do(req, &created); err != nil {
		return nil, fmt.Errorf("failed to create issue: %w", err)
	}

	// Add jules-discovered tag
	if err := c.AddTag(ctx, created.ID, "jules-discovered"); err != nil {
		c.logger.Warn("failed to add jules-discovered tag", "issueID", created.ID, "err", err)
	}

	c.logger.Info("created YouTrack issue", "issueID", created.ID, "summary", issue.Summary)
	return &created, nil
}

// AddComment adds a comment to an issue.
func (c *Client) AddComment(ctx context.Context, issueID string, text string) error {
	comment := Comment{Text: text}
	jsonBody, err := json.Marshal(comment)
	if err != nil {
		return fmt.Errorf("failed to marshal comment: %w", err)
	}

	path := fmt.Sprintf("/api/issues/%s/comments", url.PathEscape(issueID))
	req, err := c.newRequest(ctx, "POST", path, bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}

	if err := c.do(req, nil); err != nil {
		return fmt.Errorf("failed to add comment: %w", err)
	}

	c.logger.Info("added comment to issue", "issueID", issueID)
	return nil
}

// AddTag adds a tag to an issue.
func (c *Client) AddTag(ctx context.Context, issueID string, tagName string) error {
	tagBody := map[string]interface{}{
		"name": tagName,
	}
	jsonBody, err := json.Marshal(tagBody)
	if err != nil {
		return fmt.Errorf("failed to marshal tag: %w", err)
	}

	path := fmt.Sprintf("/api/issues/%s/tags", url.PathEscape(issueID))
	req, err := c.newRequest(ctx, "POST", path, bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}

	if err := c.do(req, nil); err != nil {
		return fmt.Errorf("failed to add tag: %w", err)
	}

	c.logger.Info("added tag to issue", "issueID", issueID, "tag", tagName)
	return nil
}

// UpdateIssueState updates the state of an issue.
// Note: For issues Jules created, it can update state to "Fixed" or "Closed".
func (c *Client) UpdateIssueState(ctx context.Context, issueID string, stateName string) error {
	updateBody := map[string]interface{}{
		"customFields": []map[string]interface{}{
			{
				"name":  "State",
				"$type": "StateIssueCustomField",
				"value": map[string]string{
					"name": stateName,
				},
			},
		},
	}
	jsonBody, err := json.Marshal(updateBody)
	if err != nil {
		return fmt.Errorf("failed to marshal state update: %w", err)
	}

	path := fmt.Sprintf("/api/issues/%s", url.PathEscape(issueID))
	req, err := c.newRequest(ctx, "POST", path, bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}

	if err := c.do(req, nil); err != nil {
		return fmt.Errorf("failed to update issue state: %w", err)
	}

	c.logger.Info("updated issue state", "issueID", issueID, "state", stateName)
	return nil
}

// GetIssue retrieves an issue by ID.
func (c *Client) GetIssue(ctx context.Context, issueID string) (*Issue, error) {
	path := fmt.Sprintf("/api/issues/%s?fields=id,summary,description", url.PathEscape(issueID))
	req, err := c.newRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var issue Issue
	if err := c.do(req, &issue); err != nil {
		return nil, fmt.Errorf("failed to get issue: %w", err)
	}

	return &issue, nil
}

// GetComments retrieves all comments for an issue.
func (c *Client) GetComments(ctx context.Context, issueID string) ([]Comment, error) {
	path := fmt.Sprintf("/api/issues/%s/comments?fields=text", url.PathEscape(issueID))
	req, err := c.newRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var comments []Comment
	if err := c.do(req, &comments); err != nil {
		return nil, fmt.Errorf("failed to get comments: %w", err)
	}

	return comments, nil
}

func (c *Client) newRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	fullURL := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, fullURL, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	return req, nil
}

func (c *Client) do(req *http.Request, v interface{}) error {
	c.logger.Debug("sending request", "method", req.Method, "url", req.URL.String())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error: status=%d body=%s", resp.StatusCode, string(body))
	}

	if v != nil {
		if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
			return fmt.Errorf("failed to decode response: %w", err)
		}
	}

	return nil
}
