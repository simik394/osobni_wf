package inner

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	
	wmill "github.com/windmill-labs/windmill-go-client"
	"strings"
)

type Session struct {
	ID                  string        `json:"id"`
	Name                string        `json:"name"`
	Title               string        `json:"title"`
	State               string        `json:"state"`
	Prompt              string        `json:"prompt"`
	URL                 string        `json:"url"`
	CreateTime          string        `json:"createTime"`
	UpdateTime          string        `json:"updateTime"`
	RequirePlanApproval bool          `json:"requirePlanApproval"`
	Outputs             []interface{} `json:"outputs"`
}

// main retrieves a single Jules session by ID
// session_id: The session ID (e.g., "12345678901234567890")
func main(session_id string) (Session, error) {
	apiKey := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return Session{}, fmt.Errorf("failed to get JULES_API_KEY: %w", err")
	}

	if session_id == "" {
		return Session{}, fmt.Errorf("session_id is required")
	}

	// Normalize session ID (remove sessions/ prefix if present)
	sessionID := session_id
	if strings.HasPrefix(sessionID, "sessions/") {
		sessionID = strings.TrimPrefix(sessionID, "sessions/")
	}

	url := fmt.Sprintf("https://jules.googleapis.com/v1alpha/sessions/%s", sessionID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return Session{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-goog-api-key", apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return Session{}, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Session{}, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return Session{}, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var session Session
	if err := json.Unmarshal(body, &session); err != nil {
		return Session{}, fmt.Errorf("failed to parse response: %w", err)
	}

	return session, nil
}
