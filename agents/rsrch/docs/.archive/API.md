# Rsrch - API Documentation

## Table of Contents
1. [[#quick-start|Quick Start]]
2. [[#running-with-docker|Running with Docker]]
3. [[#api-reference|API Reference]]
4. [[#authentication-setup|Authentication Setup]]
5. [[#advanced-usage|Advanced Usage]]
6. [[#troubleshooting|Troubleshooting]]

---

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- OR: Node.js 18+ and npm

### Docker (Recommended)

```bash
# 1. Build the image
docker-compose build

# 2. First-time setup: Authenticate with Perplexity
docker-compose run --rm rsrch npm run auth
# Follow the browser prompts to log in, then close the browser

# 3. Start the server
docker-compose up -d

# 4. Test the API (CLI Wrapper)
# This command automatically starts the server if needed and keeps it running.
rsrch query "What is the capital of France?"

# NotebookLM Audio (Dry Run by default)
rsrch notebook audio --dry-run
rsrch notebook audio --wet  # Actual generation

# Query with Session
rsrch query "What is the population?" --session="france-info" --local

# Deep Research Mode (more comprehensive answers)
rsrch query "Explain quantum entanglement" --deep --local

# OR manually via curl
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the capital of France?"}'
```

### Local (Without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Authenticate
npm run auth

# 3. Start server
npm run serve
```

---

## Running with Docker

### Architecture

The Docker setup provides:
- **Isolated environment**: No dependencies on host OS
- **Persistent browser profile**: Authentication state saved in Docker volume
- **VNC access**: Connect to `localhost:5900` to see the browser (password: none)
- **Auto-restart**: Container restarts automatically if it crashes

### Docker Commands

#### Build and Start
```bash
# Build the image
docker-compose build

# Start in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

#### One-Time Authentication
```bash
# Run auth in a temporary container
docker-compose run --rm rsrch npm run auth
```

This opens a browser window. Log in to Perplexity, then close the browser. Your session is saved in the `browser-data` volume.

#### Viewing the Browser (VNC)

Connect with any VNC client to `localhost:5900` (no password):
```bash
# Using TigerVNC on Linux
vncviewer localhost:5900

# Using macOS built-in VNC
open vnc://localhost:5900
```

#### Headless Mode

To run without VNC (recommended for production):
```bash
# Edit docker-compose.yml
environment:
  - HEADLESS=true

# Restart
docker-compose restart
```

#### Batch Querying
Run multiple queries from a file (one per line):
```bash
rsrch batch my_queries.txt
```

#### Interactive Login
Launch an interactive browser session to log in manually (useful for Google auth in Docker):
```bash
rsrch login
```

---

## API Reference

### Base URL
```
http://localhost:3000
```

### 1. Health Check

Check if the service is running.

**Endpoint:** `GET /health`

**Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok"
}
```

---

### 2. Shutdown Server

Gracefully stop the server and close browser connections.

**Endpoint:** `POST /shutdown`

**Request:**
```bash
curl -X POST http://localhost:3000/shutdown
```

**Response:**
```json
{
  "success": true,
  "message": "Shutting down..."
}
```

---

### 3. Job Queue

Track long-running asynchronous tasks (deep research, audio generation).

#### List All Jobs

**Endpoint:** `GET /jobs`

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": "abc123",
      "type": "deepResearch",
      "status": "completed",
      "query": "Complex topic",
      "createdAt": 1702252800000,
      "completedAt": 1702253100000,
      "result": { "answer": "..." }
    }
  ]
}
```

#### Get Job Status

**Endpoint:** `GET /jobs/:id`

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "abc123",
    "type": "deepResearch",
    "status": "running",
    "query": "Complex topic",
    "createdAt": 1702252800000
  }
}
```

**Status Values:** `queued`, `running`, `completed`, `failed`

---

### 2. Submit Query

Send a query to Perplexity.ai and get the response.

### Query Perplexity

**Endpoint:** `POST /query`

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "query": "Your question here",
  "sessionId": "optional-session-id", 
  "sessionName": "optional-session-name",
  "deepResearch": false
}
```

**Response:**
```json
{
  "answer": "The plain text answer...",
  "html": "<div>Raw HTML content...</div>",
  "markdown": "## Answer\n\nformatted as markdown with [^1] footnotes...\n\n### Thoughts\n\n**Step 1**: Reasoning content...",
  "sources": [
    { "index": 1, "url": "https://example.com", "title": "Source Title" }
  ],
  "thoughts": [
    "**Step 1**: Content...",
    "**Step 2**: Content..."
  ]
}
```

> [!NOTE]
> The `markdown` field contains a fully formatted version of the answer, suitable for Obsidian, with "Thoughts" (reasoning steps) included and sources formatted as footnotes.

### Session Management
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is conceptual mapping?",
    "name": "concept-map"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "query": "What are the latest developments in quantum computing?",
    "answer": "Recent developments in quantum computing include...",
    "timestamp": "2025-11-26T19:30:45.123Z",
    "url": "https://www.perplexity.ai/search/..."
  }
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "success": false,
  "error": "Query execution failed"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Query parameter is required and must be a string"
}
```

---

## 3. Gemini Research (Beta)

### Automated Research to Podcast
`POST /research-to-podcast`

Orchestrates a full pipeline: Perplexity Research -> Gemini Deep Research -> Google Doc -> NotebookLM -> Audio Podcast.

**Body Parameters:**
- `query` (string, required): The research topic.
- `customPrompt` (string, optional): Prompt for the audio conversation.
- `dryRun` (boolean, optional): If true, skips audio generation to save quota.

**Example:**
```bash
curl -X POST http://localhost:3000/research-to-podcast \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Impact of AI on Healthcare",
    "customPrompt": "Focus on diagnostic accuracy",
    "dryRun": false
  }'
```

### 1. Perform Deep Research
Generate a comprehensive research report using Gemini Deep Research.
**Endpoint:** `POST /gemini/research`

**Request Body:**
```json
{
  "query": "Future of AI in Healthcare"
}
```

### 2. List Recent Sessions
List recent chat sessions from the sidebar, including IDs.
**Endpoint:** `GET /gemini/sessions`

**Query Parameters:**
- `limit` (optional): Max number of sessions to return (default: 20).
- `offset` (optional): Start index for pagination (default: 0). Use this to access older history.

**Response:**
```json
{
  "success": true,
  "data": [
    { "name": "Session Name", "id": "session_id" },
    ...
  ]
}
```

### 3. List Research Documents
Scan sessions for Deep Research documents.
**Endpoint:** `GET /gemini/list-research-docs`

**Query Parameters:**
- `limit` (optional): Number of recent sessions to scan (default: 10)
- `sessionId` (optional): Scan specific session ID only.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Doc Title",
      "firstHeading": "Doc Heading",
      "sessionId": "session_id"
    }
  ]
}
```

### 4. Get Research Info
Get metadata (Title, First Heading) for the latest research document in a session.
**Endpoint:** `POST /gemini/get-research-info`

**Request Body:**
```json
{
  "sessionId": "required-session-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "title": "Doc Title",
    "firstHeading": "Doc Heading",
    "sessionId": "session_id"
  }
}
```

---

## 4. NotebookLM (Audio Generation)

### 1. Create Notebook

Create a new NotebookLM notebook.

**Endpoint:** `POST /notebook/create`

**Request Body:**
```json
{
  "title": "My Research Notebook"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notebook 'My Research Notebook' created"
}
```

### 2. Add Source URL

Add a web URL as a source to the current notebook.

**Endpoint:** `POST /notebook/add-source`

**Request Body:**
```json
{
  "url": "https://example.com/article",
  "notebookTitle": "optional-notebook-name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Source added"
}
```

### 3. Add Google Drive Source

Add documents from Google Drive as sources.

**Endpoint:** `POST /notebook/add-drive-source`

**Request Body:**
```json
{
  "docNames": ["Document Name 1", "Document Name 2"],
  "notebookTitle": "optional-notebook-name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Drive sources added"
}
```

### 4. Generate Audio Overview

Generate an audio podcast from the notebook sources.

**Endpoint:** `POST /notebook/generate-audio`

**Request Body:**
```json
{
  "notebookTitle": "My Research Notebook",
  "sources": ["source1", "source2"],
  "customPrompt": "Focus on key findings",
  "dryRun": true
}
```

> [!NOTE]
> Set `dryRun: true` to simulate audio generation without using quota. Set to `false` for actual generation.

**Response (Async - returns job ID):**
```json
{
  "success": true,
  "message": "Audio generation started",
  "jobId": "abc123",
  "statusUrl": "/jobs/abc123"
}
```

### 5. Dump State (Debug)

Capture current page state for debugging.

**Endpoint:** `POST /notebook/dump`

**Response:**
```json
{
  "success": true,
  "paths": ["/path/to/screenshot.png", "/path/to/state.html"]
}
```

---

## Authentication Setup

### Initial Login

Authentication is unified across all environments using a shared file at `~/.config/rsrch/auth.json`.

**Recommended Method (CLI):**
```bash
npm run auth
```
1. A browser window will open.
2. Log in to Perplexity.ai.
3. Close the window or press Enter in the terminal.
4. The session is saved to `~/.config/rsrch/auth.json`.

**Docker Method (if CLI not possible):**
```bash
rsrch auth
```
1. Connect via VNC to `localhost:5900`.
2. Log in using the browser inside the container.
3. The session is saved to the same shared location on your host.

### Re-authentication

If your session expires, simply run `npm run auth` again locally. The Docker container will automatically pick up the new session file on its next restart or request.

---

## Advanced Usage

### Scripting Multiple Queries

**Bash Script:**
```bash
#!/bin/bash

QUERIES=(
  "What is AI?"
  "Explain quantum entanglement"
  "Best practices for Docker"
)

for query in "${QUERIES[@]}"; do
  echo "Querying: $query"
  curl -s -X POST http://localhost:3000/query \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"$query\"}" | jq -r '.data.answer'
  echo "---"
done
```

**Python Script:**
```python
import requests

API_URL = "http://localhost:3000/query"

queries = [
    "What is machine learning?",
    "Explain neural networks",
    "What is GPT?"
]

for query in queries:
    response = requests.post(
        API_URL,
        json={"query": query}
    )
    
    if response.status_code == 200:
        data = response.json()
        print(f"Q: {data['data']['query']}")
        print(f"A: {data['data']['answer']}")
        print("---")
    else:
        print(f"Error: {response.status_code}")
```

**Node.js Script:**
```javascript
const axios = require('axios');

const queries = [
  "What is React?",
  "Explain async/await",
  "What is TypeScript?"
];

async function runQueries() {
  for (const query of queries) {
    try {
      const response = await axios.post('http://localhost:3000/query', {
        query
      });
      
      console.log(`Q: ${response.data.data.query}`);
      console.log(`A: ${response.data.data.answer}`);
      console.log('---');
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

runQueries();
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DISPLAY` | `:99` | X11 display for browser |
| `HEADLESS` | `false` | Run browser in headless mode |

Override in `docker-compose.yml`:
```yaml
environment:
  - PORT=8080
  - HEADLESS=true
```

### Persistent Data

**Browser Profile:**
- Stored in Docker volume: `browser-data`
- Contains authentication cookies

**Query Results:**
- Saved to: `./data/result-*.json`
- Mounted from host in Docker

---

## Troubleshooting

### Browser Not Opening

**Symptom:** "Browser profile not found" error

**Solution:**
```bash
# Run auth command
docker-compose run --rm rsrch npm run auth
```

---

### Port Already in Use

**Symptom:** "Error: listen EADDRINUSE: address already in use :::3000"

**Solution:**
```bash
# Change port in docker-compose.yml
ports:
  - "8080:3000"  # Use port 8080 on host
```

---

### VNC Connection Failed

**Symptom:** Cannot connect to VNC

**Solution:**
```bash
# Ensure port is exposed
docker-compose ps

# Check if x11vnc is running
docker-compose exec rsrch ps aux | grep x11vnc
```

---

### Query Times Out

**Symptom:** Request hangs or returns 500 after long wait

**Possible Causes:**
1. Session expired - Re-authenticate
2. Perplexity.ai changed their UI - Selectors may need updating
3. Network issues

**Debug:**
```bash
# View server logs
docker-compose logs -f

# Connect via VNC to see browser
vncviewer localhost:5900
```

---

### Clean Restart

If something goes wrong, reset everything:

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: Deletes saved authentication)
docker volume rm rsrch_browser-data

# Rebuild
docker-compose build

# Re-authenticate
docker-compose run --rm rsrch npm run auth

# Start fresh
docker-compose up -d
```

---

## Performance Notes

### Latency

- **First query:** 10-15 seconds (includes navigation)
- **Subsequent queries:** 5-8 seconds (browser stays open)

### Resource Usage

- **RAM:** ~800MB (Chromium browser)
- **CPU:** Moderate during query, idle otherwise
- **Disk:** ~500MB (image) + results

### Scaling

For high throughput, consider:
- Multiple container instances
- Load balancer (nginx/HAProxy)
- Query queue system (Redis/RabbitMQ)

---

## Security Notes

> [!WARNING]
> **No Authentication by Default**
> 
> The HTTP API has no authentication. If exposing publicly:
> 1. Add API key middleware
> 2. Use reverse proxy with SSL (nginx/Caddy)
> 3. Implement rate limiting

**Example nginx config:**
```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }
}
```
