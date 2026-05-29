# Deployment Guide: rsrch

The `rsrch` project uses a **Git-Push-to-Nomad** workflow. This ensures that the code is built directly on the target server (`halvarm`), avoiding large image transfers over the network.

## 1. Setup (One-time)

Add the target server as a git remote in your local `/home/sim/Prods/01-pwf` directory:

```bash
git remote add prod ubuntu@halvarm:~/repos/rsrch.git
```

## 2. Fast Development Loop (Dev-to-Prod)

For rapid iteration, use the following workflow:

1.  **Iterate Locally:** Test your changes using standard CLI commands against the production server (CLI is smart enough to call remote API).
2.  **Push to Deploy:** When ready to see changes in the actual server environment:
    ```bash
    git push prod your-branch:main
    ```
    *The server will automatically:*
    - Update its local source code.
    - Build `@agents/shared` and `rsrch` Docker image.
    - Restart the Nomad job.

## 3. How it works (Under the hood)

- **Git Hook:** A `post-receive` hook in `~/repos/rsrch.git` on `halvarm` triggers the build.
- **Local Build:** The build happens on `halvarm`, meaning only source code deltas are transferred.
- **Shared Dependency:** The script automatically rebuilds the `@agents/shared` package if any changes occurred.
- **Orchestration:** Nomad manages the lifecycle, ensuring the browser and server containers are properly recycled.

## 4. Maintenance & Storage

Builds can consume significant disk space over time. 

- **Check Space:** `ssh halvarm "df -h"`
- **Cleanup Docker:** `ssh halvarm "docker system prune -f"` (Run this if `/` or `/mnt/data` is getting full).
- **View Logs:** `ssh halvarm "nomad alloc logs -f -job rsrch"`
- **Check Status:** `ssh halvarm "nomad status rsrch"`

## 5. Deprecated Methods (DO NOT USE)
- Do NOT push Docker images from local machine.
- Do NOT use `rsync` manually for deployment.
- Do NOT use `docker-compose` on `halvarm` (Nomad is the master).
