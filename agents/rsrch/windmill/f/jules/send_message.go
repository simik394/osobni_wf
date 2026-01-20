package inner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	
	wmill "github.com/windmill-labs/windmill-go-client"
	"strings"
)

type MessageRequest struct {
	Prompt string `json:"prompt"`
}

type SendResult struct {
	Success   bool   `json:"success"`
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

// main sends a user message to an existing Jules session
// session_id: The session ID to send the message to
// prompt: The message/prompt to send
func main(session_id string, prompt string) (SendResult, error) {
	apiKey := wmill.GetVariable("u/admin/JULES_API_KEY")
	if err != nil {
		return SendResult{}, fmt.Errorf("failed to get JULES_API_KEY: %w", err")
	}

	if session_id == "" {
		return SendResult{}, fmt.Errorf("session_id is required")
	}
	if prompt == "" {
		return SendResult{}, fmt.Errorf("prompt is required")
	}

	// Normalize session ID
	sessionID := session_id
	if strings.HasPrefix(sessionID, "sessions/") {
		sessionID = strings.TrimPrefix(sessionID, "sessions/")
	}

	url := fmt.Sprintf("https://jules.googleapis.com/v1alpha/sessions/%s:sendMessage", sessionID)

	reqBody := MessageRequest{Prompt: prompt}
	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return SendResult{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return SendResult{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-goog-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return SendResult{}, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return SendResult{
			Success:   false,
			SessionID: sessionID,
			Message:   fmt.Sprintf("API error %d: %s", resp.StatusCode, string(body)),
		}, nil
	}

	return SendResult{
		Success:   true,
		SessionID: sessionID,
		Message:   "Message sent successfully",
	}, nil
}
