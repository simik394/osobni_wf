# LESSONS LEARNED - Jules Windmill MCP Server

## 2026-01-21: The "Agent Killing" Incident (MCP Server Crashes)

### Context
During the orchestration of multiple Jules agents, the `jules-mcp-windmill` server frequently "killed" the parent agents or caused them to hang/crash. This was a critical failure that prevented long-running tasks from completing.

### Root Causes

1.  **JSONRPC Buffer Overflow (bufio.Scanner limit)**:
    *   **Symptom**: The MCP server would stop responding after a tool returned a large result (e.g., `list_sessions` or `list_activities`).
    *   **Cause**: The initial implementation used `bufio.NewScanner(os.Stdin)`. Go's `Scanner` has a default buffer limit of 64KB (`MaxScanTokenSize`). When Windmill returned a JSON payload larger than 64KB, the scanner failed with `bufio.Scanner: token too long`.
    *   **Fix**: Replaced `bufio.Scanner` with `json.NewDecoder(os.Stdin)`. The decoder reads from the stream directly and handles arbitrarily large JSON objects without a fixed buffer limit.

2.  **JSON-RPC Notification Violation**:
    *   **Symptom**: The parent agent's MCP client would throw errors like "Received response for unknown request" or crash during the initialization handshake.
    *   **Cause**: The server was attempting to send a response for EVERY incoming message, including "notifications" (JSON-RPC messages with no `id`). According to the JSON-RPC 2.0 specification, notifications MUST NOT be responded to.
    *   **Fix**: Modified the `handleRequest` loop to return `nil` for messages without an `id` or for specific notification methods like `notifications/initialized`, and ensuring the encoder only runs if a non-nil response is generated.

3.  **ANSI Escape Code Corruption**:
    *   **Symptom**: The agent could not parse the tool output because it was "invalid JSON", even though the Windmill logs showed a valid object.
    *   **Cause**: The `wmill` CLI often includes ANSI escape codes (colors/formatting) in its output. These characters are invisible in some logs but corrupt the JSON string, making `json.Unmarshal` fail.
    *   **Fix**: Implemented a regex-based stripper to remove ANSI escape codes (`\x1b\[[0-9;]*[a-zA-Z]`) from the Windmill output before attempting to extract and parse the JSON payload.

### Best Practices for MCP Servers
- **Always use `json.NewDecoder`** for stdin to handle large payloads.
- **Strictly follow JSON-RPC 2.0 notification rules**: Never reply to a message if the `id` field is missing.
- **Scrub external CLI output**: If your tool calls another CLI, always strip ANSI codes and non-JSON noise (like headers/banners) from the output before returning it to the agent.
- **Log to Stderr**: Always redirect server-side logs to `os.Stderr` to keep `os.Stdout` clean for JSON-RPC messages. Any noise on `Stdout` will crash the MCP client.
