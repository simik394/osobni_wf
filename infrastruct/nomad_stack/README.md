# Infrastructure Deployment

This project automates the deployment of a self-hosted stack comprising **Nomad, Consul, Vault, YouTrack, Obsidian-Remote, and n8n** on an Ubuntu server (specifically targeting OCI ARM instances).

## Components

- **Ansible**: Orchestrates the setup.
- **HashiCorp Stack**: Nomad (Orchestrator), Consul (Service Discovery/Mesh), Vault (Secrets).
- **Services**:
    - **YouTrack**: Project management and issue tracking.
    - **Obsidian-Remote**: Running Obsidian via web interface.
    - **n8n**: Workflow automation.
    - **Traefik**: Reverse proxy for routing traffic.

## Prerequisites

- **Ansible** installed on your local machine.
- **SSH Access** to the target server (`halvarm` in the inventory). Ensure your `~/.ssh/config` has an alias for `halvarm` or update `infrastruct/nomad_stack/inventory.yml` with the IP/hostname.
- **Git** to clone this repository.
- **Configure Public IP**: Edit `infrastruct/nomad_stack/group_vars/servers.yml` and set the `public_ip` variable to your OCI instance's public IP address. This is required for external access via Traefik.

## Quick Start (Single Command)

To deploy the entire stack, run the following command from the repository root:

```bash
ansible-playbook -i infrastruct/nomad_stack/inventory.yml infrastruct/nomad_stack/playbook.yml
```

This will:
1.  **Harden Security**: Configure UFW firewall, install Fail2Ban.
2.  **Install Docker**: Required for running containerized workloads.
3.  **Install HashiCorp Stack**: Nomad, Consul, Vault.
4.  **Deploy Jobs**: Submit Nomad jobs for Traefik, YouTrack, Obsidian-Remote, and n8n.

## Post-Deployment Steps (Manual)

### 1. Initialize Vault
Vault starts in a sealed state. You must initialize and unseal it manually.

1.  SSH into the server:
    ```bash
    ssh halvarm
    ```
2.  Initialize Vault (save the output!):
    ```bash
    export VAULT_ADDR='http://127.0.0.1:8200'
    vault operator init
    ```
    *This will output 5 Unseal Keys and a Root Token. Store these securely (e.g., in a password manager).*

3.  Unseal Vault (repeat 3 times with different keys):
    ```bash
    vault operator unseal <Unseal Key 1>
    vault operator unseal <Unseal Key 2>
    vault operator unseal <Unseal Key 3>
    ```

### 2. Access Services
The services are exposed via Traefik. By default, they are configured to use `nip.io` with the server's public IP.

- **Traefik Dashboard**: `http://<SERVER_IP>:8080` (tunneling recommended)
- **YouTrack**: `http://youtrack.<SERVER_IP>.nip.io`
- **Obsidian**: `http://obsidian.<SERVER_IP>.nip.io`
- **n8n**: `http://n8n.<SERVER_IP>.nip.io`

*Note: For production use, configure a proper domain and enable HTTPS in `traefik.nomad.hcl`.*

## Troubleshooting

-   **Check Nomad Status**: `nomad status`
-   **Check Logs**: `nomad alloc logs <alloc_id>`

## Security Notes

-   **Firewall**: Only ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) are open globally.
-   **Internal Ports**: Nomad/Consul/Vault RPC ports are bound to 0.0.0.0 for internal communication but blocked by UFW from external access (verify this on your specific cloud provider's security list/security groups as well).
-   **Secrets**: Ensure Vault is unsealed after every reboot, or configure Auto-Unseal.
