package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	wmill "github.com/windmill-labs/windmill-go-client"
)

type Session struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

// main waits for a session to reach a terminal state
func main(session_id string, timeout_sec int, poll_interval int) (interface{}, error) {
	apiKey, err := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return nil, fmt.Errorf("failed to get JULES_API_KEY variable: %w", err)
	}

	id := session_id
	if !strings.HasPrefix(id, "sessions/") {
		id = "sessions/" + id
	}

	timeout := timeout_sec
	if timeout == 0 {
		timeout = 600
	}

	interval := poll_interval
	if interval == 0 {
		interval = 5
	}

	client := &http.Client{}
	url := "https://jules.googleapis.com/v1alpha/" + id

	deadline := time.Now().Add(time.Duration(timeout) * time.Second)

	for {
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("timeout waiting for session completion")
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}
		req.Header.Set("x-goog-api-key", apiKey)

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("API request failed: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("failed to read response: %w", err)
		}

		var session Session
		if err := json.Unmarshal(body, &session); err != nil {
			return nil, fmt.Errorf("failed to parse response: %w", err)
		}

		// Check terminal states
		state := session.State
		if state == "COMPLETED" || state == "FAILED" || state == "CANCELLED" || state == "AWAITING_USER_FEEDBACK" {
			return session, nil
		}

		time.Sleep(time.Duration(interval) * time.Second)
	}
}
