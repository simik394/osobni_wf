package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Session  string    `json:"session,omitempty"`
}

type ChatResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index        int     `json:"index"`
		Message      Message `json:"message"`
		FinishReason string  `json:"finish_reason"`
	} `json:"choices"`
}

// main performs a Deep Research query via Gemini
func main(prompt string, session_id string) (interface{}, error) {
	rsrchURL := os.Getenv("RSRCH_URL")
	if rsrchURL == "" {
		rsrchURL = "http://halvarm.tail288db.ts.net:3030"
	}
	rsrchURL = rsrchURL + "/v1/chat/completions"
	model := "gemini-deep-research"

	messages := []Message{
		{Role: "user", Content: prompt},
	}

	reqBody := ChatRequest{
		Model:    model,
		Messages: messages,
		Session:  session_id,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("error marshaling request: %v", err)
	}

	resp, err := http.Post(rsrchURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("error calling rsrch server: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(body))
	}

	var chatResp ChatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return nil, fmt.Errorf("error parsing response: %v", err)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return map[string]interface{}{
		"content":    chatResp.Choices[0].Message.Content,
		"session_id": chatResp.ID, // Return session ID for continuity
	}, nil
}
