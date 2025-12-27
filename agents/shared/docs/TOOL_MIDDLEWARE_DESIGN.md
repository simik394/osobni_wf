# Tool Middleware & File Tracking Design

This document details the technical implementation for the **Context (Files & Projects)** features. The goal is to give agents "self-awareness" of the files they touch, without requiring the LLM to manually log its actions.

## 1. The Middleware Pattern (Shared)
Instead of modifying every tool implementation, we wrap the entire `tools` object using a Proxy or Decorator pattern.

### Architecture
```typescript
type ToolFunction = (args: any) => Promise<any>;
type Middleware = (toolName: string, args: any, result: any, sessionId: string) => Promise<void>;

class ToolRegistry {
    private tools: Map<string, ToolFunction>;
    private middlewares: Middleware[] = [];

    register(name: string, impl: ToolFunction) {
        // Wrap the tool definition
        this.tools.set(name, async (args, context) => {
            // 1. Execute the actual tool
            const result = await impl(args);

            // 2. Run middlewares asynchronously (don't block response)
            if (context.sessionId) {
                this.middlewares.forEach(m => 
                    m(name, args, result, context.sessionId).catch(console.error)
                );
            }
            
            return result;
        });
    }

    use(middleware: Middleware) {
        this.middlewares.push(middleware);
    }
}
```

## 2. File Tracker Middleware
This specific middleware listens for file-system related tools (`write_to_file`, `replace_file_content`, `view_file`) and updates the FalkorDB graph.

### Logic Flow
1.  **Interception**: Middleware sees `toolName === 'write_to_file'`.
2.  **Extraction**: Extracts `filePath` from `args.TargetFile`.
3.  **Graph Update**:
    ```cypher
    MATCH (s:Session {id: $sessionId})
    // Merge the file node (create if not exists)
    MERGE (f:File {path: $filePath})
    // Create the relationship
    MERGE (s)-[r:MODIFIED]->(f)
    SET r.timestamp = timestamp()
    // Optional: Track specific interaction
    CREATE (i:Interaction {type: 'action', tool: 'write_to_file', ...})
    CREATE (s)-[:HAS_INTERACTION]->(i)-[:AFFECTED]->(f)
    ```

## 4. Angrav-Specific Strategy: UI Observer
Since Angrav drives a GUI that *displays* tool calls visually, we can scrape these events directly from the DOM instead of inferring them.

### The "UI Scraper" Pattern
1.  **Observation**: The `angrav-browser` monitors the chat window DOM.
2.  **Detection**: Looks for elements indicating tool usage (e.g., `div.tool-call`, `span:contains("Writing file...")`).
3.  **Extraction**: Parses the tool name and arguments (File Path) from the UI text.
4.  **Logging**: Calls `falkor.logInteraction(sessionId, 'action', 'write_to_file', ...)` and creates the `[:MODIFIED]` link.

**Pros:**
*   **Contextual Accuracy**: We know exactly *which* session triggered the change.
*   **Zero Latency**: Captured immediately when it appears in the chat.

### Hybrid Implementation Plan
*   **`rsrch`**: Use **Code Middleware** (Method 1) because we control the execution loop.
*   **`angrav`**: Use **UI Observer** (Method 4) to "read" what the black-box agent is doing.
*   **Fallback**: **FS Watcher** (Method 2) for implicit side effects (e.g. `git checkout` changing 100 files).

## 5. Librarian Auto-Trigger
The issue: `MERGE (f:File)` creates a "stub" node with just a path. It lacks the logic metadata.

### The Trigger Mechanism
1.  **Detection**: When `File Tracker` middleware creates a *new* file node (or modifies an existing one), it publishes an event to Redis Pub/Sub: `file_changed`.
2.  **Listener**: A lightweight service (or `librarian` itself in daemon mode) listens to `file_changed`.
3.  **Action**:
    *   Debounce events (wait 30s to avoid scanning mid-edit).
    *   Run `librarian analyze <filePath>` to re-parse the specific file.
    *   Update the `(:File)` node with fresh metadata (function signatures, imports).

## Integration Points

### [Angrav] & [Rsrch] Servers
Both agents use a similar server structure (`processRequest` calls `tools`).
*   **Change**: Initialize `toolRegistry.use(falkorFileTracker)` at startup.
*   **Result**: Every time `angrav` writes code, the graph updates instantly. The agent doesn't "know" it's happening, but the side-effect is recorded.

---
**Why this matters for "Self-Healing":**
When a build fails, the agent can run:
> *"Show me all files modified in this session."*
Database Result: `["src/server.ts", "src/auth.ts"]`
Agent Logic: *"Okay, I likely broke one of these two. I will revert or check them first."*
