# Hybrid Infrastructure: Nomad Federation (Cloud + Local)

This project automates the deployment of a **federated** self-hosted stack across a **Cloud Server (`halvarm`)** and a **Local Machine (`ntb`)**.

**Architecture:**
*   **Region: Cloud (`halvarm`)**: Runs heavy workloads (Windmill, YouTrack, n8n) and serves as the public ingress.
*   **Region: Local (`ntb`)**: Part of the same cluster but runs on your laptop. Useful for local development or offloading specific tasks.
*   **Network**: Nodes are connected via **Tailscale** (Mesh VPN), ensuring secure communication regardless of physical location.

## Services & Access

After deployment, services are available at the following URLs (using `nip.io` DNS by default):

| Service | Location | URL | Description |
| :--- | :--- | :--- | :--- |
| **Windmill** | Cloud | `http://windmill.<SERVER_IP>.nip.io` | Developer platform & script orchestration. |
| **YouTrack** | Cloud | `http://youtrack.<SERVER_IP>.nip.io` | Project management. |
| **n8n** | Cloud | `http://n8n.<SERVER_IP>.nip.io` | Workflow automation. |
| **Obsidian** | Cloud | `http://obsidian.<SERVER_IP>.nip.io` | Remote Obsidian web interface. |
| **Traefik** | Cloud | `http://<SERVER_IP>:8080` | Edge router dashboard. |

## Prerequisites

1.  **Tailscale**: Must be installed and running on both your laptop and the server.
2.  **SSH Config**: Ensure you can `ssh halvarm` from your laptop.
3.  **Inventory**: `infrastruct/nomad_stack/inventory.yml` must contain:
    *   The **Tailscale IP** of your laptop (`wan_peer`).
    *   The correct `node_class` (`cloud` vs `local`).

## Deployment (Zero-Touch)

To deploy or update the entire stack on **both** the server and your laptop:

```bash
cd infrastruct/nomad_stack
ansible-playbook -i inventory.yml playbook.yml -K
```
*The `-K` flag prompts for your local sudo password to configure your laptop.*

### What this does:
1.  **Configures `halvarm`**: Installs Nomad/Consul/Vault, sets firewall rules, creates swap.
2.  **Configures `localhost`**: Installs Nomad/Consul/Vault (skips firewall/swap to be safe).
3.  **Federates**: Connects both nodes into a single cluster via Tailscale.
4.  **Deploys Jobs**: Submits Nomad jobs with constraints (e.g., `node_class = "cloud"` for Windmill).

## Operational Guide

### 1. Accessing GUIs & Default Credentials

**Windmill**
*   **URL:** `http://windmill.<SERVER_IP>.nip.io`
*   **Default Login:** `admin@windmill.dev` / `changeme`
*   **Action:** Change the password immediately after logging in.

**YouTrack**
*   **URL:** `http://youtrack.<SERVER_IP>.nip.io`
*   **First Run:** You will be greeted by the **JetBrains Setup Wizard**.
*   **Setup:** Select "Set up" (not Upgrade), generate a Token from your JetBrains account if requested, and configure the admin account.

**n8n**
*   **URL:** `http://n8n.<SERVER_IP>.nip.io`
*   **First Run:** You will be prompted to create an owner account.

**Obsidian Remote**
*   **URL:** `http://obsidian.<SERVER_IP>.nip.io`
*   **Access:** Direct access to the vault hosted on the server.

### 2. Managing Nomad Jobs

While Ansible automates the initial deployment, you can manage jobs manually for development or debugging.

**List Running Jobs:**
```bash
nomad job status
```

**Deploy/Update a Job Manually:**
1.  Navigate to the job file location (on the server or local machine).
    *   *Note: Ansible templates are in `roles/nomad_jobs/templates/` but need variables replaced.*
    *   *On the server, rendered jobs are stored in `/opt/nomad/jobs/`.*
2.  Run the job:
    ```bash
    nomad job run /opt/nomad/jobs/windmill.nomad.hcl
    ```

**Stop a Job:**
```bash
nomad job stop windmill
```

**View Logs:**
```bash
# Find the Allocation ID first
nomad job status windmill
# Then view logs
nomad alloc logs <alloc_id> windmill-server
```

## Maintenance & Troubleshooting

### 1. "Stuck" Deployment or Split Brain
If the deployment hangs or nodes cannot see each other (e.g., after IP changes), perform a **Full Cluster Reset**:

**On the Server (`halvarm`):**
```bash
ssh halvarm "sudo systemctl stop consul vault nomad && sudo rm -rf /opt/consul/* /opt/vault/* /opt/nomad/*"
```

**On Localhost (`ntb`):**
```bash
sudo systemctl stop consul vault nomad
sudo rm -rf /opt/consul/* /opt/vault/* /opt/nomad/*
```

**Then re-run Ansible:**
```bash
ansible-playbook -i inventory.yml playbook.yml -K
```

### 2. Secrets (Vault)
The first run generates `vault_keys.json` in `infrastruct/nomad_stack/`. **Move this file to a secure password manager immediately.** It contains the Unseal Keys and Root Token.

### 3. Check Cluster Status
Verify that both nodes are alive and connected:

```bash
# Check Nomad Federation (Cloud + Local)
nomad server members

# Check Consul WAN (Cloud + Local)
consul members -wan
```

## Advanced: Adding New Services

1.  Create a Nomad job file in `roles/nomad_jobs/templates/`.
2.  Add a `constraint` to target the cloud or local node:
    ```hcl
    constraint {
      attribute = "${node.class}"
      value     = "cloud" # or "local"
    }
    ```
3.  Add the template to the `Copy Nomad job files` task in `roles/nomad_jobs/tasks/main.yml`.
4.  Run Ansible again.