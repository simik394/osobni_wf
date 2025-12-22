# YouTrack IaC for Windmill

Windmill definitions for automating YouTrack configuration synchronization.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Windmill CLI** | 1.x+ | `npm install -g windmill` |
| **Docker** | 20.x+ | For building worker images |
| **YouTrack** | 2023.1+ | Self-hosted or Cloud |

---

## Quick Start

### 1. Install CLI

```bash
npm install -g wmill
wmill login https://your-instance.windmill.dev
```

### 2. Deploy Scripts

```bash
cd windmill
wmill sync push
```

### 3. Run Flow

1. Go to **Flows** in Windmill UI
2. Select **Sync YouTrack Config**
3. Fill in URL, Token, and Config
4. Run

---

## Setup

### Worker Group (Custom Docker Image)

The YouTrack IaC scripts require a custom worker with Python + Prolog.

1. **Build & Push Image**:
   ```bash
   docker build -t ghcr.io/yourorg/youtrack-iac:latest -f docker/Dockerfile .
   docker push ghcr.io/yourorg/youtrack-iac:latest
   ```

2. **Configure Windmill Worker Group**:
   - Go to **Workspace Settings** → **Worker Groups**
   - Create or edit a group (e.g., `youtrack-iac`)
   - Set **Docker Image** to `ghcr.io/yourorg/youtrack-iac:latest`

---

## GitHub Actions Deployment

A workflow file `.github/workflows/deploy_windmill.yml` automates deployment on push.

### Required GitHub Secrets

| Secret | Description | Example |
|--------|-------------|---------|
| `WMILL_URL` | Windmill instance URL | `https://app.windmill.dev` |
| `WMILL_WORKSPACE` | Workspace ID | `your_workspace` |
| `WMILL_TOKEN` | API token | (from Windmill settings) |

> [!NOTE]
> The UI-based "Git Sync" is an Enterprise feature. For Community Edition, use the CLI `wmill sync` via GitHub Actions.

---

## Script Inventory

| Script | Description | Location |
|--------|-------------|----------|
| **Sync YouTrack Config** | Main flow that reads config and applies to YouTrack | `f/youtrack/` |

---

## Manual Sync (CLI)

If not using GitHub Actions, you can sync manually:

```bash
cd windmill
wmill sync push
```

This pushes scripts based on `wmill.yaml` configuration.

---

## Troubleshooting

### "Workspace not found"

Ensure `WMILL_WORKSPACE` matches exactly (case-sensitive):
```bash
wmill workspace list
```

### Scripts not appearing in Windmill

Check that `wmill.yaml` is correctly configured and scripts are in `f/` directory.

### Worker fails to start

Verify the Docker image is accessible:
```bash
docker pull ghcr.io/yourorg/youtrack-iac:latest
```

### Authentication errors

Generate a new token from Windmill **Settings** → **Tokens**.
