# Vault Graph Query Scripts

Windmill scripts for querying the Vault Librarian FalkorDB knowledge graph.

## Setup

1. Set environment variables in Windmill:
   - `FALKORDB_ADDR`: Redis address (default: `localhost:6379`)
   - `FALKORDB_GRAPH`: Graph name (default: `vault`)

2. Enable MCP on the scripts you want to expose to AI agents.

## Available Scripts

| Script | Description | MCP Tool Name |
|--------|-------------|---------------|
| `get_orphans.ts` | Find notes with no incoming links | `f/vault/get_orphans` |
| `get_backlinks.ts` | Find notes linking to a target | `f/vault/get_backlinks` |
| `get_notes_by_tag.ts` | Find notes with a specific tag | `f/vault/get_notes_by_tag` |
| `get_stats.ts` | Get vault statistics | `f/vault/get_stats` |
| `get_scan_status.ts` | Check when vault was last indexed | `f/vault/get_scan_status` |
| `find_function.ts` | Find function definitions | `f/vault/find_function` |
| `find_related.ts` | Find related notes (links + shared tags) | `f/vault/find_related` |
| `get_project_context.ts` | Get full project context for AI | `f/vault/get_project_context` |

## Usage Examples

### From MCP (AI Agent)

Once enabled as MCP tools, AI agents can call these directly:

```
// Agent asking for context
"What notes are related to the README?"
→ Calls f/vault/find_related with notePath="README"

// Agent finding orphans
"Find disconnected notes"
→ Calls f/vault/get_orphans
```

### From Windmill UI

Run any script manually from the Windmill interface to test queries.

### From Windmill API

```bash
curl -X POST "https://windmill.example.com/api/w/workspace/jobs/run/f/vault/get_stats" \
  -H "Authorization: Bearer $WINDMILL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Return Types

All scripts return a consistent structure:

```typescript
{
  success: boolean;
  // ... script-specific data
  error?: string;  // Only on failure
}
```

## Dependencies

- FalkorDB must be running and indexed by the Vault Librarian
- Uses Deno's native TCP for Redis RESP protocol (no external deps)
