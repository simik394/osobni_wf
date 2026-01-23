package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"
)

// --- Jules Client Minimal Implementation ---

type JulesClient struct {
	BaseURL string
	ApiKey  string
	HTTP    *http.Client
}

type Session struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Source     string `json:"source"`
	State      string `json:"state"`
	CreateTime string `json:"createTime"`
}

type Activity struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Description string `json:"description"`
	CreateTime  string `json:"createTime"`
}

type sessionsResponse struct {
	Sessions []*Session `json:"sessions"`
}

func NewJulesClient(apiKey string) *JulesClient {
	return &JulesClient{
		BaseURL: "https://jules.googleapis.com/v1alpha",
		ApiKey:  apiKey,
		HTTP:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *JulesClient) GetSession(ctx context.Context, sessionID string) (*Session, error) {
	url := fmt.Sprintf("%s/sessions/%s", c.BaseURL, sessionID)
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("x-goog-api-key", c.ApiKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var session Session
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		return nil, err
	}
	return &session, nil
}

func (c *JulesClient) ListActivities(ctx context.Context, sessionID string) ([]*Activity, error) {
	url := fmt.Sprintf("%s/sessions/%s/activities", c.BaseURL, sessionID)
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("x-goog-api-key", c.ApiKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API error %d", resp.StatusCode)
	}

	var activities []*Activity
	if err := json.NewDecoder(resp.Body).Decode(&activities); err != nil {
		return nil, err
	}
	return activities, nil
}

func (c *JulesClient) SendMessage(ctx context.Context, sessionID, message string) error {
	url := fmt.Sprintf("%s/sessions/%s/messages", c.BaseURL, sessionID)
	body := map[string]string{"content": message}
	jsonBody, _ := json.Marshal(body)

	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonBody))
	req.Header.Set("x-goog-api-key", c.ApiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// main implements the Smart Retry logic
func main(session_id string) (interface{}, error) {
	apiKey := os.Getenv("JULES_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("JULES_API_KEY environment variable not set")
	}

	client := NewJulesClient(apiKey)
	ctx := context.Background()

	// 2. Get Session Details
	session, err := client.GetSession(ctx, session_id)
	if err != nil {
		return nil, fmt.Errorf("failed to get session %s: %v", session_id, err)
	}

	// 3. Get Recent Activities
	activities, err := client.ListActivities(ctx, session_id)
	if err != nil {
		return nil, fmt.Errorf("failed to get activities: %v", err)
	}

	// 4. Construct Prompt
	contextStr := fmt.Sprintf("Session '%s' (ID: %s) is in state: %s.\n\nRecent Activity Log:\n", session.Title, session.ID, session.State)

	limit := 10
	if len(activities) < limit {
		limit = len(activities)
	}

	for i := 0; i < limit; i++ {
		act := activities[i]
		contextStr += fmt.Sprintf("- [%s] %s: %s\n", act.CreateTime, act.Type, act.Description)
	}

	// 5. Enhance Context with Repomix (Codebase Analysis)
	repoPath := ""
	if session.Source != "" {
		if session.Source == "simik394/osobni_wf" || session.Source == "github.com/simik394/osobni_wf" {
			repoPath = "/home/sim/Obsi/Prods/01-pwf"
		}
	}

	if repoPath != "" {
		fmt.Printf("Generating repomix for %s...\n", repoPath)
		tmpFile, err := os.CreateTemp("", "repomix-*.txt")
		if err == nil {
			tmpPath := tmpFile.Name()
			tmpFile.Close()
			defer os.Remove(tmpPath)

			cmd := exec.CommandContext(ctx, "npx", "-y", "repomix", "--output", tmpPath)
			cmd.Dir = repoPath
			if output, err := cmd.CombinedOutput(); err != nil {
				contextStr += fmt.Sprintf("\n[Repomix Failed]: %v\n%s\n", err, string(output))
			} else {
				content, err := os.ReadFile(tmpPath)
				if err == nil {
					codeContext := string(content)
					if len(codeContext) > 2*1024*1024 {
						contextStr += fmt.Sprintf("\n[Repomix Content Truncated - Original Size: %d bytes]\n", len(codeContext))
						contextStr += codeContext[:2*1024*1024]
					} else {
						contextStr += "\n[Codebase Context (Repomix)]:\n" + codeContext
					}
				}
			}
		}
	}

	analysisPrompt := fmt.Sprintf(`You are a robust AI supervisor. A Jules agent session has failed or is stuck.
Analyze the following context (activities + codebase) and suggest a concrete fix or next step.
The agent needs specific instructions to recover.
Do not just describe the error, tell the agent what to do next.

Context:
%s

Your instruction to the agent:`, contextStr)

	// 5. Call Gemini
	suggestion, err := callGemini(analysisPrompt)
	if err != nil {
		return nil, fmt.Errorf("failed to get analysis from Gemini: %v", err)
	}

	// 6. Send Suggestion back to Session
	msg := fmt.Sprintf("🤖 Smart Retry Supervisor:\n%s", suggestion)
	err = client.SendMessage(ctx, session_id, msg)
	if err != nil {
		return nil, fmt.Errorf("failed to send guidance to session: %v", err)
	}

	return map[string]string{
		"status":     "success",
		"guidance":   suggestion,
		"session_id": session_id,
	}, nil
}

func callGemini(prompt string) (string, error) {
	rsrchURL := os.Getenv("RSRCH_URL")
	if rsrchURL == "" {
		rsrchURL = "http://halvarm.tail288db.ts.net:3030"
	}
	rsrchURL = rsrchURL + "/v1/chat/completions"
	model := "gemini-flash"

	type Message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type ChatRequest struct {
		Model    string    `json:"model"`
		Messages []Message `json:"messages"`
	}
	type ChatResponse struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
	}

	reqBody := ChatRequest{
		Model:    model,
		Messages: []Message{{Role: "user", Content: prompt}},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	resp, err := http.Post(rsrchURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini error %d: %s", resp.StatusCode, string(body))
	}

	var chatResp ChatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return "", err
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("no response choices")
	}

	return chatResp.Choices[0].Message.Content, nil
}
