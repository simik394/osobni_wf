# Langfuse Deployment on OCI ARM (Ansible)

This directory contains an automated solution for deploying [Langfuse](https://langfuse.com/) (open source LLM engineering platform) on an Oracle Cloud Infrastructure (OCI) ARM64 instance (e.g., Ampere Altra).

## Overview

The solution uses Ansible to:
1.  Install Docker and Docker Compose (ARM64 compatible).
2.  Set up the necessary directory structure at `/opt/langfuse`.
3.  Deploy Langfuse and its dependencies (Postgres, Clickhouse, Redis) using `docker compose`.
4.  Automatically generate secure random passwords and API keys for the initial setup.

## Prerequisites

*   **Target Server:** An OCI Compute Instance (ARM64) with Ubuntu (recommended) or Debian/RHEL-based OS.
*   **SSH Access:** You must have SSH access to the target server (key-based auth is preferred).
*   **Ports:** Ensure port **3000** (TCP) is open in your OCI Security List / Network Security Group (ingress rule).

## Directory Structure

*   `deploy.yml`: The main Ansible playbook handling the installation logic.
*   `docker-compose.yml`: Defines the services (Server, Worker, DBs) with images compatible with ARM64.
*   `.env.j2`: Jinja2 template for generating the `.env` configuration file with secrets.
*   `run.sh`: A wrapper script to simplify the execution of the playbook.

## Local Machine Setup

Before running the deployment, you need to set up your local machine (Control Node).

### 1. Install Ansible
The included `run.sh` script attempts to install Ansible automatically. However, you can install it manually:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y ansible
```

**Fedora/CentOS:**
```bash
sudo dnf install -y ansible-core
```

**Via Python (works on most distros):**
```bash
pip install ansible
```

### 2. Configure SSH Access
Ansible works best with SSH key-based authentication (passwordless login).

1.  **Generate an SSH key** (if you don't have one):
    ```bash
    ssh-keygen -t ed25519 -C "your_email@example.com"
    ```
    Press Enter to accept defaults.

2.  **Copy the key to your OCI Server:**
    Replace `<TARGET_IP>` and `<USER>` (e.g., `ubuntu` or `opc`).
    ```bash
    ssh-copy-id -i ~/.ssh/id_ed25519.pub <USER>@<TARGET_IP>
    ```

3.  **Test the connection:**
    You should be able to log in without a password:
    ```bash
    ssh <USER>@<TARGET_IP>
    ```

## Usage

### 1. Quick Start

Run the helper script from your local machine (or wherever you have Ansible installed):

```bash
# Syntax: ./run.sh [TARGET_IP] [SSH_USER]

# Example for a remote server
./run.sh 192.0.2.123 ubuntu

# Example for local deployment (if running on the server itself)
./run.sh
```

### 2. Manual Execution (Advanced)

If you prefer to run `ansible-playbook` directly or integrate this into a larger inventory:

```bash
# inventory.ini
[langfuse_server]
192.0.2.123 ansible_user=ubuntu
```

```bash
ansible-playbook -i inventory.ini deploy.yml
```

## Configuration

### Environment Variables & Secrets
The first time you run the deployment, the playbook generates secure random values for:
*   `POSTGRES_PASSWORD`
*   `CLICKHOUSE_PASSWORD`
*   `REDIS_PASSWORD`
*   `NEXTAUTH_SECRET`
*   `SALT`
*   `ENCRYPTION_KEY`

These are saved in `/opt/langfuse/.env` on the remote server.
**Note:** The playbook is configured with `force: no` for the `.env` generation. It **will not** overwrite your existing secrets on subsequent runs.

### Customizing Configuration
You can customize the Langfuse external port, or other environment variables, by passing them as extra vars to the Ansible playbook:

```bash
ansible-playbook ... --extra-vars "langfuse_port=8000 nextauth_url=https://yourdomain.com"
```

Or by defining them in a separate Ansible variable file and referencing it.



## Maintenance

### Check Status
SSH into the server and run:
```bash
cd /opt/langfuse
docker compose ps
```

### View Logs
```bash
cd /opt/langfuse
docker compose logs -f
```

### Updating Langfuse
To update to the latest version, simply re-run the `run.sh` script or the playbook. It will pull the latest images (since `langfuse_version` defaults to `latest`) and recreate the containers.

## Troubleshooting

*   **Connection Refused on Port 3000:** Check your OCI VCN Security Lists. You need an Ingress Rule allowing TCP traffic on destination port 3000 from `0.0.0.0/0`.
*   **Permission Denied:** Ensure the SSH user has `sudo` privileges without password or that you have configured Ansible privilege escalation correctly.
