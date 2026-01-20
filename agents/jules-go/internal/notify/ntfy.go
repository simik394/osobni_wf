package notify

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	PriorityUrgent  = "urgent"
	PriorityHigh    = "high"
	PriorityDefault = "default"
	PriorityLow     = "low"
	PriorityMin     = "min"
)

// NtfyClient is a client for sending notifications to an ntfy server.
type NtfyClient struct {
	serverURL string
	topic     string
}

// NewNtfyClient creates a new NtfyClient.
func NewNtfyClient(serverURL, topic string) *NtfyClient {
	return &NtfyClient{
		serverURL: serverURL,
		topic:     topic,
	}
}

// Send sends a notification with a given priority.
func (c *NtfyClient) Send(ctx context.Context, title, message, priority string) error {
	req, err := c.newRequest(ctx, title, message, priority, nil)
	if err != nil {
		return err
	}
	return c.do(req)
}

// SendWithTags sends a notification with a given set of tags.
func (c *NtfyClient) SendWithTags(ctx context.Context, title, message string, tags []string) error {
	req, err := c.newRequest(ctx, title, message, "", tags)
	if err != nil {
		return err
	}
	return c.do(req)
}

func (c *NtfyClient) newRequest(ctx context.Context, title, message, priority string, tags []string) (*http.Request, error) {
	url := fmt.Sprintf("%s/%s", c.serverURL, c.topic)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBufferString(message))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Title", title)
	if priority != "" {
		req.Header.Set("Priority", priority)
	}
	if len(tags) > 0 {
		req.Header.Set("Tags", strings.Join(tags, ","))
	}

	return req, nil
}

func (c *NtfyClient) do(req *http.Request) error {
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ntfy request failed: status %d, body: %s", resp.StatusCode, string(bodyBytes))
	}

	return nil
}
