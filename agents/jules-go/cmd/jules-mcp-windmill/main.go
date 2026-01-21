package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Setup logging to stderr
func init() {
	log.SetOutput(os.Stderr)
	log.SetPrefix("[jules-windmill] ")
	log.SetFlags(log.Ltime | log.Lmicroseconds | log.Lshortfile)
}

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
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func main() {
	log.Println("Starting Jules Windmill MCP Server...")

	// Use json.Decoder to stream decode, which handles large messages automatically
	// unlike bufio.Scanner which has a default 64KB token limit
	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)

	for {
		var req JSONRPCRequest
		if err := decoder.Decode(&req); err != nil {
			if err == io.EOF {
				log.Println("Stdin closed, exiting")
				return
			}
			log.Printf("Error decoding JSON-RPC request: %v", err)
			// Try to recover or continue? Standard is to exit on fatal stream errors,
			// but we can try to skip garbage if possible.
			// For now, let's just log and continue loop if it's a transient error,
			// but usually Decode error on stream means stream is broken or we need to resync.
			// Re-creating decoder unlikely to help if underlying reader is same.
			continue
		}

		log.Printf("Received request: Method=%s ID=%v", req.Method, req.ID)

		// Handle request in a function that returns the response object
		resp := handleRequest(req)

		if resp != nil {
			if err := encoder.Encode(resp); err != nil {
				log.Printf("Error encoding JSON-RPC response: %v", err)
			}
		}
	}
}

func handleRequest(req JSONRPCRequest) *JSONRPCResponse {
	// Defer panic recovery
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in handleRequest: %v", r)
		}
	}()

	// If it's a notification (no ID) and we don't explicitly handle it as a request,
	// we should generally not reply.
	// But let's handle specific notifications we know about.

	if req.Method == "notifications/initialized" || req.Method == "notifications/cancelled" {
		log.Printf("Ignoring notification: %s", req.Method)
		return nil
	}

	resp := &JSONRPCResponse{
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
				"version": "1.0.1",
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
							"prompt":     map[string]interface{}{"type": "string", "description": "The message to send"},
							"session_id": map[string]interface{}{"type": "string", "description": "The ID of the session"},
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
							"session_id":    map[string]interface{}{"type": "string", "description": "Optional session ID for continuity"},
						},
						"required": []string{"prompt"},
					},
				},
				map[string]interface{}{
					"name":        "rsrch_gemini_pro",
					"description": "Comprehensive analysis via rsrch Gemini Deep Research (Thinking model)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"prompt":        map[string]interface{}{"type": "string", "description": "The prompt to send"},
							"system_prompt": map[string]interface{}{"type": "string", "description": "Optional system prompt"},
							"session_id":    map[string]interface{}{"type": "string", "description": "Optional session ID for continuity"},
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
		if err := json.Unmarshal(req.Params, &params); err != nil {
			resp.Error = JSONRPCError{Code: -32700, Message: "Parse error", Data: err.Error()}
			return resp
		}

		log.Printf("Calling tool: %s", params.Name)

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
				log.Printf("Tool execution failed: %v", err)
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
				// Don't log full result as it might be huge
				log.Printf("Tool execution successful")
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
		return nil
	case "ping":
		resp.Result = "pong"
	default:
		// If it's a notification (no ID), do not send error response
		if req.ID == nil {
			log.Printf("Ignoring unknown notification: %s", req.Method)
			return nil
		}
		// Unknown method
		log.Printf("Unknown method: %s", req.Method)
		resp.Error = JSONRPCError{Code: -32601, Message: fmt.Sprintf("Method %s not found", req.Method)}
	}

	return resp
}

func runWindmillScript(scriptPath string, args map[string]interface{}) (string, error) {
	argsJSON, err := json.Marshal(args)
	if err != nil {
		return "", fmt.Errorf("failed to marshal args: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "wmill", "script", "run", scriptPath, "-d", string(argsJSON))
	output, err := cmd.CombinedOutput()

	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("windmill execution timed out after 10 minutes")
	}

	if err != nil {
		return "", fmt.Errorf("windmill execution failed: %w, output: %s", err, string(output))
	}

	// Strip ANSI escape codes from output
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	cleanOutput := ansiRegex.ReplaceAllString(string(output), "")

	// Find the last JSON object or array in the output
	// Look for the last occurrence of { followed by matching }
	lastBrace := strings.LastIndex(cleanOutput, "{")
	lastBracket := strings.LastIndex(cleanOutput, "[")

	var jsonStart int
	if lastBrace > lastBracket {
		jsonStart = lastBrace
	} else {
		jsonStart = lastBracket
	}

	if jsonStart == -1 {
		// Sometimes output is just a string or number, not JSON object
		// But Windmill usually returns JSON. If not found, log what we got.
		// If it's empty, return empty
		trimmed := strings.TrimSpace(cleanOutput)
		if trimmed == "" {
			return "", nil
		}
		return trimmed, nil // Return as is if no JSON structure found
	}

	// Extract from JSON start to end of output
	jsonPart := cleanOutput[jsonStart:]

	// Validate it's proper JSON by attempting to parse
	var testParse interface{}
	if err := json.Unmarshal([]byte(jsonPart), &testParse); err != nil {
		// Try to find a valid JSON by trimming trailing garbage
		lines := strings.Split(jsonPart, "\n")
		for i := len(lines); i > 0; i-- {
			candidate := strings.Join(lines[:i], "\n")
			if json.Unmarshal([]byte(candidate), &testParse) == nil {
				return strings.TrimSpace(candidate), nil
			}
		}
		return "", fmt.Errorf("no valid JSON found in windmill response (length %d): %s", len(cleanOutput), cleanOutput)
	}

	return strings.TrimSpace(jsonPart), nil
}
