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
## Quick Start (Zero-Touch Deployment)

To deploy the entire stack, run the following command from the repository root:

```bash
ansible-playbook -i infrastruct/nomad_stack/inventory.yml infrastruct/nomad_stack/playbook.yml
```

This single command will:
1.  **Detect Public IP**: Automatically find your server's OCI public IP for configuring routing.
2.  **Install & Setup Tailscale**: Automatically installs Tailscale to create a secure mesh network between your Laptop and the Cloud Server. **You will be prompted to authenticate** (run `sudo tailscale up` manually) on the first run.
3.  **Harden Security**: Configure UFW firewall, install Fail2Ban, and setup QEMU for ARM emulation.
4.  **Install & Configure HashiCorp Stack**: Nomad, Consul, and Vault.
    *   **Cloud Server**: Acts as the primary cluster leader (Voting Server).
    *   **Laptop**: Joins as a "Non-Voting Server" (Client + Control Plane), allowing you to submit jobs and view state without breaking cluster quorum if you go offline.
5.  **Auto-Init Vault**:
    *   Automatically initializes Vault.
    *   Saves the **Unseal Keys and Root Token** to a file named `vault_keys.json` in your local directory (on your laptop, not the server).
    *   **Automatically Unseals** Vault so it's ready to use immediately.
5.  **Deploy Jobs**: Launches Traefik, YouTrack, Obsidian-Remote, and n8n.

**After the command finishes, your stack is live!**

### Secrets Management
The Ansible playbook generates a file named `vault_keys.json` in your current directory.
**IMPORTANT**: Move this file to a secure location (Password Manager, encrypted volume) immediately. It contains the keys to your Kingdom.

### Access Services
The services are exposed via Traefik. By default, they are configured to use `nip.io` with the server's public IP.

- **Traefik Dashboard**: `http://<SERVER_IP>:8080` (tunneling recommended)
- **YouTrack**: `http://youtrack.<SERVER_IP>.nip.io`
- **Obsidian**: `http://obsidian.<SERVER_IP>.nip.io`
- **n8n**: `http://n8n.<SERVER_IP>.nip.io`

## Production Configuration: Custom Domain & HTTPS

For a secure production environment, you should move away from `nip.io` and HTTP. Follow these steps to configure a custom domain and enable automatic HTTPS (SSL) via Let's Encrypt.

### 1. DNS Configuration
Point your custom domain (e.g., `youtrack.example.com`, `obsidian.example.com`) to your server's **Public IP** using an **A Record** in your DNS provider's dashboard.

### 2. Update Traefik Job (`traefik.nomad.hcl`)
Edit the Traefik job file (on the server at `/opt/nomad/jobs/traefik.nomad.hcl` or in your Ansible templates) to enable the ACME resolver.

Uncomment the relevant lines in the `args` section:

```hcl
args = [
  ...
  # Redirect HTTP to HTTPS
  "--entrypoints.web.http.redirections.entryPoint.to=websecure",
  "--entrypoints.web.http.redirections.entryPoint.scheme=https",

  # Enable Let's Encrypt
  "--certificatesresolvers.myresolver.acme.email=your-email@example.com", # <--- Set your email
  "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json",
  "--certificatesresolvers.myresolver.acme.httpchallenge=true",
  "--certificatesresolvers.myresolver.acme.httpchallenge.entrypoint=web",
]
```

Then redeploy Traefik:
```bash
nomad job run /opt/nomad/jobs/traefik.nomad.hcl
```

### 4. Update Service Jobs
Update your service jobs (YouTrack, Obsidian, etc.) to use your custom domain and request the certificate.

Example `youtrack.nomad.hcl`:

```hcl
service {
  tags = [
    "traefik.enable=true",
    # Use your real domain
    "traefik.http.routers.youtrack.rule=Host(`youtrack.example.com`)",
    "traefik.http.routers.youtrack.entrypoints=websecure",
    # Enable TLS using the resolver defined in Traefik
    "traefik.http.routers.youtrack.tls.certresolver=myresolver"
  ]
}
```

Redeploy the service:
```bash
nomad job run /opt/nomad/jobs/youtrack.nomad.hcl
```

## Troubleshooting

-   **Check Nomad Status**: `nomad status`
-   **Check Logs**: `nomad alloc logs <alloc_id>`

## Security Notes

-   **Firewall**: Only ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) are open globally.
-   **Internal Ports**: Nomad/Consul/Vault RPC ports are bound to 0.0.0.0 for internal communication but blocked by UFW from external access (verify this on your specific cloud provider's security list/security groups as well).
-   **Secrets**: Ensure Vault is unsealed after every reboot, or configure Auto-Unseal.
