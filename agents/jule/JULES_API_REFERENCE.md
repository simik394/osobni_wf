# Google Jules API, CLI & Browser Reference

> **Last Updated:** 2026-01-09  
> **API Version:** v1alpha (Alpha)

---

## Overview

Google Jules is an AI coding agent powered by Gemini 3 Pro. It provides three interaction interfaces:

1. **REST API** - Programmatic access for automation and CI/CD
2. **CLI (Jules Tools)** - Terminal-based session management
3. **Web UI** - Full-featured browser interface at [jules.google.com](https://jules.google.com)

---

## Feature Matrix

| Feature | REST API | CLI | Web UI |
|---------|:--------:|:---:|:------:|
| **Setup & Authentication** |
| Google account sign-in | ❌ | ✅ | ✅ |
| GitHub OAuth connection | ❌ | ❌ | ✅ |
| Repository installation | ❌ | ❌ | ✅ |
| API key generation | ❌ | ❌ | ✅ |
| **Session Management** |
| Create session | ✅ | ✅ | ✅ |
| List sessions | ✅ | ✅ | ✅ |
| Get session details | ✅ | ✅ | ✅ |
| Delete session | ✅ | ❌ | ✅ |
| Pull session results | ❌ | ✅ | ✅ |
| **Plan Management** |
| Approve plan (programmatic) | ✅ | ❌ | ✅ |
| Visual plan review | ❌ | ❌ | ✅ |
| Step-by-step breakdown | ❌ | ❌ | ✅ |
| Interactive feedback | ❌ | ❌ | ✅ |
| **Source Management** |
| List sources | ✅ | ✅ | ✅ |
| Get source details | ✅ | ❌ | ✅ |
| Connect new source | ❌ | ❌ | ✅ |
| Configure env variables | ❌ | ❌ | ✅ |
| **Activities & Monitoring** |
| List activities | ✅ | ❌ | ✅ |
| Get activity details | ✅ | ❌ | ✅ |
| Live progress dashboard | ❌ | ❌ | ✅ |
| Live diff viewer | ❌ | ❌ | ✅ |
| **Communication** |
| Send message to agent | ✅ | ❌ | ✅ |
| View chat history | ❌ | ❌ | ✅ |
| **Settings** |
| Notification settings | ❌ | ❌ | ✅ |
| General settings | ❌ | ❌ | ✅ |

---

## REST API

### Base URL
```
https://jules.googleapis.com/v1alpha
```

### Authentication
API keys are used for authentication. Generate at [jules.google.com/settings](https://jules.google.com/settings).

```bash
curl 'https://jules.googleapis.com/v1alpha/sources' \
  -H 'X-Goog-Api-Key: YOUR_API_KEY'
```

### Sessions Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sessions` | Create a new coding session |
| `GET` | `/sessions` | List all sessions |
| `GET` | `/sessions/{id}` | Get session details |
| `POST` | `/sessions/{id}:approvePlan` | Approve a session plan |
| `POST` | `/sessions/{id}:sendMessage` | Send message to agent |

#### Create Session Example
```bash
curl 'https://jules.googleapis.com/v1alpha/sessions' \
  -X POST \
  -H "Content-Type: application/json" \
  -H 'X-Goog-Api-Key: YOUR_API_KEY' \
  -d '{
    "prompt": "Fix the login bug in auth.ts",
    "sourceContext": {
      "source": "sources/github/owner/repo",
      "githubRepoContext": {
        "startingBranch": "main"
      }
    },
    "title": "Login Bug Fix"
  }'
```

### Activities Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sessions/{id}/activities` | List session activities |
| `GET` | `/sessions/{id}/activities/{activityId}` | Get activity details |

### Sources Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/sources` | List connected repositories |
| `GET` | `/sources/{id}` | Get source details |

> [!NOTE]
> Sources can only be **created** through the Web UI. The API provides read-only access.

---

## CLI (Jules Tools)

### Installation
```bash
npm install -g @google/jules
```

### Commands

| Command | Description |
|---------|-------------|
| `jules login` | Authenticate with Google |
| `jules logout` | Sign out |
| `jules help` | General help |
| `jules version` | Show CLI version |
| `jules remote list --repo` | List connected repositories |
| `jules remote list --session` | List all sessions |
| `jules remote new --repo <repo> --session "<prompt>"` | Start new session |
| `jules remote pull --session <id>` | Pull session results |

### Examples

```bash
# Start a new session
jules remote new --repo myuser/myrepo --session "Add unit tests for utils.ts"

# List active sessions
jules remote list --session

# Pull results
jules remote pull --session abc123
```

---

## Web UI Only Features

These features are **exclusively available** through [jules.google.com](https://jules.google.com):

### Required for Setup
- **Google Account Sign-in** - Initial authentication
- **GitHub OAuth** - Connecting your GitHub account
- **Repository Installation** - Selecting which repos Jules can access
- **API Key Generation** - Creating keys for programmatic access

### Interactive Features
- **Visual Plan Review** - See detailed step-by-step plans
- **Live Diff Viewer** - Watch code changes as Jules works
- **Progress Dashboard** - Visual monitoring of session status
- **Chat Interface** - Interactive feedback on plans
- **Screenshot Previews** - Jules can spin up local servers and show UI changes

### Settings
- **Environment Variables** - Configure per-repository secrets
- **Notification Settings** - Browser notification preferences
- **General Settings** - Account and interface preferences

---

## Key Concepts

### Source
An input source for the agent (currently GitHub repositories only). Sources must be installed via the Web UI before use with API/CLI.

### Session
A continuous unit of work. Created with a prompt and source. Sessions can be configured for:
- **Auto-approve** (default via API) - Plan executes immediately
- **Manual approve** - Requires explicit plan approval

### Activity
A single unit of work within a session. Types include:
- Plan generation
- Messages (user/agent)
- Progress updates
- Code changes
- Completion

---

## Rate Limits & Quotas

| Resource | Limit |
|----------|-------|
| New sessions per day | 100 |
| Concurrent sessions | 15 |
| API requests | Subject to Google Cloud quotas |

---

## Official Documentation

- [Jules Docs - API](https://jules.google.com/docs/api) (requires login)
- [Jules Docs - CLI](https://jules.google.com/docs/cli) (requires login)
- [API Reference](https://jules.google.com/docs/reference/rest) (requires login)
