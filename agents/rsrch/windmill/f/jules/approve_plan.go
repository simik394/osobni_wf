package inner

import (
	"fmt"
	"io"
	"net/http"
	
	wmill "github.com/windmill-labs/windmill-go-client"
	"strings"
)

type ApproveResult struct {
	Success   bool   `json:"success"`
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

// main approves the pending plan for a Jules session
// session_id: The session ID to approve the plan for
func main(session_id string) (ApproveResult, error) {
	apiKey := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return ApproveResult{}, fmt.Errorf("failed to get JULES_API_KEY: %w", err")
	}

	if session_id == "" {
		return ApproveResult{}, fmt.Errorf("session_id is required")
	}

	// Normalize session ID
	sessionID := session_id
	if strings.HasPrefix(sessionID, "sessions/") {
		sessionID = strings.TrimPrefix(sessionID, "sessions/")
	}

	url := fmt.Sprintf("https://jules.googleapis.com/v1alpha/sessions/%s:approvePlan", sessionID)

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return ApproveResult{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-goog-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return ApproveResult{}, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return ApproveResult{
			Success:   false,
			SessionID: sessionID,
			Message:   fmt.Sprintf("API error %d: %s", resp.StatusCode, string(body)),
		}, nil
	}

	return ApproveResult{
		Success:   true,
		SessionID: sessionID,
		Message:   "Plan approved successfully",
	}, nil
}
