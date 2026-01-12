# osobni_wf Project Context

## Rsrch Efficiency Best Practices

### Use rsrch to Boost Your Effectiveness
The rsrch agent running at `http://localhost:3001` provides Gemini-powered analysis. Use it for:
- **Code analysis**: Send repomix output for code review, bug finding, improvement suggestions
- **Prompt generation**: Generate well-structured prompts for Jules or other agents
- **Research tasks**: Use for background research while working on other tasks

### Repomix + Rsrch Workflow
1. **Gather code context** with repomix:
   ```bash
   npx repomix --include "agents/rsrch/src/**" -o /tmp/code.md
   ```

2. **Send to rsrch for analysis** (supports concurrent requests):
   ```bash
   curl -X POST http://localhost:3001/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model": "gemini-rsrch", "messages": [{"role": "user", "content": "Analyze this code..."}]}'
   ```

3. **Use analysis results** to create Jules prompts or guide your work

### Jules Delegation Pattern
When delegating work to Jules:
1. Use `jules-mcp` tools (NOT browser subagent) - they're 10x faster
2. Include YouTrack issue links in prompts: `See https://napoveda.youtrack.cloud/issue/TOOLS-XXX`
3. Link sessions back to YouTrack with comments after creation
4. Specify exact file paths and requirements in prompts

### Concurrent Analysis
Launch multiple rsrch requests in parallel for faster processing:
- rsrch supports `MAX_TABS=5` concurrent browser tabs
- Send independent analysis requests simultaneously
- Aggregate results for comprehensive insights

### MCP Tools Priority
Always prefer MCP tools over browser automation:
- `jules-mcp` for Jules session management
- `napovedayt` for YouTrack issue management
- `github-mcp-server` for GitHub operations
