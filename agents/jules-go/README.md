# jules-go: Automation Infrastructure

`jules-go` is the backend automation infrastructure for the Jules AI Agent. It provides a CLI (`jules-cli`) and programmatic client (`client.go`) for managing sessions, alongside backend services for webhooks and synchronization.

## Architecture

The following diagram illustrates the components of the `jules-go` ecosystem and their interactions.

```mermaid
graph TD
    subgraph "External Systems"
        A[Jules API] -->|Callbacks| B(Webhook Server)
        C[YouTrack] <-->|Sync| D(YouTrack Sync)
        E[User] -->|Notifications| F(ntfy)
        G[Prometheus] -->|Scrape| H(Metrics Endpoint)
    end

    subgraph "jules-go Internals"
        B --> I(Queue)
        D --> I
        I --> J(Worker Pool)
        J --> B
        J --> D
        J --> F
        H --> K(Prometheus Metrics)
    end

    subgraph "User Tools"
        L(jules-cli) --> B
        L --> A
    end

    style B fill:#f9f,stroke:#333,stroke-width:2px
    style D fill:#ccf,stroke:#333,stroke-width:2px
    style F fill:#cfc,stroke:#333,stroke-width:2px
    style H fill:#ffc,stroke:#333,stroke-width:2px
    style I fill:#f99,stroke:#333,stroke-width:2px
    style L fill:#9cf,stroke:#333,stroke-width:2px
```

## Quick Start

### 1. Get Your API Key

```bash
# From Vault (if configured)
export VAULT_ADDR="http://100.73.45.27:8200"
export JULES_API_KEY=$(vault kv get -field=api_key secret/jules)

# Or get from: https://jules.google.com/settings/api
```

### 2. Build the CLI

```bash
cd agents/jules-go
go build -o jules-cli-bin ./cmd/jules-cli/main.go
```

### 3. Use It

```bash
# List all sessions
./jules-cli-bin list

# Filter to active sessions only
./jules-cli-bin list 2>&1 | grep -E "IN_PROGRESS|AWAITING|PLANNING"

# Get session details (JSON)
./jules-cli-bin get 9464138654791526811

# JSON output for scripting
./jules-cli-bin list --format json | jq '.[] | select(.state != "COMPLETED")'
```

---

## CLI Commands

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all sessions with ID, STATE, TITLE | `./jules-cli-bin list` |
| `list --format json` | JSON output for scripting | `./jules-cli-bin list --format json` |
| `get <id>` | Get full session details | `./jules-cli-bin get 12345` |
| `retry <id> [--max N]` | Retry a failed session | `./jules-cli-bin retry 12345 --max 3` |
| `status` | Show system status | `./jules-cli-bin status` |
| `status-sessions` | Show session dashboard | `./jules-cli-bin status-sessions` |
| `pr-status` | Show PR status for sessions | `./jules-cli-bin pr-status` |
| `version` | Show version | `./jules-cli-bin version` |

### Session States

| State | Meaning | Action |
|-------|---------|--------|
| `PLANNING` | Jules is analyzing the task | Wait |
| `IN_PROGRESS` | Jules is implementing | Wait |
| `AWAITING_PLAN_APPROVAL` | Needs human approval | Use browser to approve |
| `AWAITING_USER_FEEDBACK` | Jules asked a question | Use browser to respond |
| `COMPLETED` | Work done, may have PR | Check for PR, merge if ready |
| `FAILED` | Session failed | Use `retry` or create new task |

---

## Components

| Component | Path | Description |
|---|---|---|
| **Webhook Server** | `cmd/jules/main.go`, `internal/webhook/` | Listens for session state callbacks from the Jules API. |
| **YouTrack Sync** | `internal/youtrack/` | Two-way synchronization between Jules sessions and YouTrack issues. |
| **ntfy Notifications**| `internal/ntfy/` | Pushes real-time notifications about session events to a ntfy topic. |
| **Prometheus Metrics**| `internal/metrics/` | Exposes internal metrics for monitoring and alerting. |
| **Queue/Worker Pool**| `internal/queue/` | Manages and processes background tasks with persistence. |
| **CLI** | `cmd/jules-cli/` | A command-line tool for listing and monitoring sessions. |

## Configuration

`jules-go` is configured entirely through environment variables.

| Variable | Required | Description |
|---|---|---|
| `JULES_API_KEY` | **Yes** | API key from [jules.google.com/settings/api](https://jules.google.com/settings/api). |
| `YOUTRACK_URL` | **Yes** | Base URL for the YouTrack instance. |
| `YOUTRACK_TOKEN`| **Yes** | Permanent token for YouTrack API access. |
| `NTFY_URL` | **Yes** | URL of the ntfy server. |
| `NTFY_TOPIC` | **Yes** | The ntfy topic to publish notifications to. |
| `VAULT_ADDR` | No | HashiCorp Vault address for fetching secrets. |
| `PORT` | No | Port for the webhook server (default: `8080`). |

## Webhook Endpoints

The webhook server exposes the following endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/webhook/session`| `POST` | Receives session state callbacks from the Jules API. |
| `/metrics` | `GET` | Exposes Prometheus metrics. |
| `/health` | `GET` | Health check endpoint. |

## Programmatic Usage

```go
package main

import (
    "context"
    "log"
    "log/slog"
    "os"

    "github.com/simik394/osobni_wf/agents/jules-go"
)

func main() {
    logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
    
    client, err := jules.NewClient(os.Getenv("JULES_API_KEY"), logger)
    if err != nil {
        log.Fatal(err)
    }

    // List sessions
    sessions, err := client.ListSessions(context.Background())
    if err != nil {
        log.Fatal(err)
    }

    for _, s := range sessions {
        log.Printf("Session %s: %s (%s)", s.ID, s.Title, s.State)
    }
}
```
