package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

type JSONRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Bytes()
		var req JSONRPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			continue
		}

		handleRequest(req)
	}
}

func handleRequest(req JSONRPCRequest) {
	resp := JSONRPCResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
	}

	switch req.Method {
	case "initialize":
		resp.Result = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]interface{}{},
			"serverInfo": map[string]interface{}{
				"name":    "Windmill Jules Bridge",
				"version": "1.0.0",
			},
		}
	case "tools/list":
		resp.Result = map[string]interface{}{
			"tools": []interface{}{
				map[string]interface{}{
					"name":        "create_session",
					"description": "Create a new Jules session using Windmill",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"prompt":                map[string]interface{}{"type": "string", "description": "Session prompt"},
							"source":                map[string]interface{}{"type": "string", "description": "Source repository (e.g. github/owner/repo)"},
							"require_plan_approval": map[string]interface{}{"type": "boolean", "description": "Whether to require plan approval"},
						},
						"required": []string{"prompt", "source"},
					},
				},
				map[string]interface{}{
					"name":        "list_sessions",
					"description": "List all Jules sessions via Windmill (handles pagination internally)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"state": map[string]interface{}{"type": "string", "description": "Filter by state (e.g. COMPLETED, ACTIVE)"},
						},
					},
				},
				map[string]interface{}{
					"name":        "get_session",
					"description": "Get detailed information about a Jules session",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"session_id": map[string]interface{}{"type": "string", "description": "The ID of the session"},
						},
						"required": []string{"session_id"},
					},
				},
				map[string]interface{}{
					"name":        "approve_session_plan",
					"description": "Approve the pending plan for a Jules session",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"session_id": map[string]interface{}{"type": "string", "description": "The ID of the session to approve"},
						},
						"required": []string{"session_id"},
					},
				},
				map[string]interface{}{
					"name":        "send_session_message",
					"description": "Send a message/response to an existing Jules session",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"prompt": map[string]interface{}{"type": "string", "description": "The message to send"},
						},
						"required": []string{"session_id", "prompt"},
					},
				},
				map[string]interface{}{
					"name":        "list_sources",
					"description": "List all Jules sources via Windmill (handles pagination internally)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"filter": map[string]interface{}{"type": "string", "description": "Optional filter string (AIP-160)"},
						},
					},
				},
				map[string]interface{}{
					"name":        "get_source",
					"description": "Get a single source by ID",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"source_id": map[string]interface{}{"type": "string", "description": "The ID of the source"},
						},
						"required": []string{"source_id"},
					},
				},
				map[string]interface{}{
					"name":        "list_activities",
					"description": "List all activities for a session via Windmill (handles pagination internally)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"session_id": map[string]interface{}{"type": "string", "description": "The session ID"},
						},
						"required": []string{"session_id"},
					},
				},
				map[string]interface{}{
					"name":        "get_activity",
					"description": "Get a single activity by ID",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"session_id":  map[string]interface{}{"type": "string", "description": "The session ID"},
							"activity_id": map[string]interface{}{"type": "string", "description": "The activity ID"},
						},
						"required": []string{"session_id", "activity_id"},
					},
				},
				map[string]interface{}{
					"name":        "wait_for_session_completion",
					"description": "Poll a session until it reaches a terminal state (COMPLETED/FAILED) or awaits feedback",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"session_id":    map[string]interface{}{"type": "string", "description": "The session ID"},
							"timeout_sec":   map[string]interface{}{"type": "integer", "description": "Timeout in seconds (default 600)"},
							"poll_interval": map[string]interface{}{"type": "integer", "description": "Poll interval in seconds (default 5)"},
						},
						"required": []string{"session_id"},
					},
				},
				map[string]interface{}{
					"name":        "publish_session",
					"description": "Publish a completed Jules session as a Pull Request (requires browser automation)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"session_id": map[string]interface{}{"type": "string", "description": "The session ID to publish"},
							"mode":       map[string]interface{}{"type": "string", "description": "Publish mode: 'pr' or 'branch' (default: pr)"},
						},
						"required": []string{"session_id"},
					},
				},
				map[string]interface{}{
					"name":        "rsrch_gemini_fast",
					"description": "Quick text processing via rsrch Gemini (fast model)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"prompt":        map[string]interface{}{"type": "string", "description": "The prompt to send"},
							"system_prompt": map[string]interface{}{"type": "string", "description": "Optional system prompt"},
						},
						"required": []string{"prompt"},
					},
				},
				map[string]interface{}{
					"name":        "rsrch_gemini_pro",
					"description": "Thorough analysis via rsrch Gemini Pro (deep research model)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"prompt":        map[string]interface{}{"type": "string", "description": "The prompt to send"},
							"system_prompt": map[string]interface{}{"type": "string", "description": "Optional system prompt"},
						},
						"required": []string{"prompt"},
					},
				},
			},
		}
	case "tools/call":
		var params struct {
			Name      string                 `json:"name"`
			Arguments map[string]interface{} `json:"arguments"`
		}
		json.Unmarshal(req.Params, &params)

		scriptMap := map[string]string{
			"create_session":              "f/jules/create_session",
			"list_sessions":               "f/jules/list_sessions",
			"get_session":                 "f/jules/get_session",
			"approve_session_plan":        "f/jules/approve_plan",
			"send_session_message":        "f/jules/send_message",
			"list_sources":                "f/jules/list_sources",
			"get_source":                  "f/jules/get_source",
			"list_activities":             "f/jules/list_activities",
			"get_activity":                "f/jules/get_activity",
			"wait_for_session_completion": "f/jules/wait_for_completion",
			"publish_session":             "f/jules/publish_single_jules_session",
			"rsrch_gemini_fast":           "f/rsrch/gemini_fast",
			"rsrch_gemini_pro":            "f/rsrch/gemini_pro",
		}

		scriptPath, ok := scriptMap[params.Name]
		if !ok {
			resp.Error = JSONRPCError{Code: -32601, Message: "Method not found"}
		} else {
			result, err := runWindmillScript(scriptPath, params.Arguments)
			if err != nil {
				resp.Result = map[string]interface{}{
					"content": []interface{}{
						map[string]interface{}{
							"type": "text",
							"text": fmt.Sprintf("Error: %v", err),
						},
					},
					"isError": true,
				}
			} else {
				resp.Result = map[string]interface{}{
					"content": []interface{}{
						map[string]interface{}{
							"type": "text",
							"text": result,
						},
					},
					"isError": false,
				}
			}
		}
	case "notifications/initialized":
		return // ignore
	default:
		// respond with error or ignore
		return
	}

	json.NewEncoder(os.Stdout).Encode(resp)
}

func runWindmillScript(scriptPath string, args map[string]interface{}) (string, error) {
	argsJSON, err := json.Marshal(args)
	if err != nil {
		return "", fmt.Errorf("failed to marshal args: %w", err)
	}

	cmd := exec.Command("wmill", "script", "run", scriptPath, "-d", string(argsJSON))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("windmill execution failed: %w, output: %s", err, string(output))
	}

	// Extract the JSON result from the output
	lines := strings.Split(string(output), "\n")
	var resultLines []string
	inJSON := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[") {
			inJSON = true
		}
		if inJSON {
			resultLines = append(resultLines, line)
		}
		// Basic check for end of JSON
		if strings.HasSuffix(trimmed, "}") || strings.HasSuffix(trimmed, "]") {
			// We can't easily tell if it's the FINAL JSON, but usually wmill output is structured.
		}
	}

	if len(resultLines) == 0 {
		return "", fmt.Errorf("no JSON output found in windmill response: %s", string(output))
	}

	return strings.Join(resultLines, "\n"), nil
}
