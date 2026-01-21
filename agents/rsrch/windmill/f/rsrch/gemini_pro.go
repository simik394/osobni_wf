package inner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatResponse struct {
	Model   string `json:"model"`
	Content string `json:"content"`
	Error   string `json:"error,omitempty"`
}

// main sends a prompt to rsrch Gemini Pro (deep research model)
func main(prompt string, system_prompt string) (interface{}, error) {
	rsrchURL := "http://halvarm:3001/v1/chat/completions"

	messages := []Message{}
	if system_prompt != "" {
		messages = append(messages, Message{Role: "system", Content: system_prompt})
	}
	messages = append(messages, Message{Role: "user", Content: prompt})

	reqBody := ChatRequest{
		Model:    "gemini-deep-research", // pro/thorough model
		Messages: messages,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := http.Post(rsrchURL, "application/json", bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("rsrch request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("rsrch error %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return ChatResponse{Model: "gemini-deep-research", Content: string(body)}, nil
	}

	// Extract content from OpenAI-style response
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]interface{}); ok {
			if msg, ok := choice["message"].(map[string]interface{}); ok {
				if content, ok := msg["content"].(string); ok {
					return ChatResponse{Model: "gemini-deep-research", Content: content}, nil
				}
			}
		}
	}

	return result, nil
}
