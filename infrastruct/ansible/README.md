# 🛠️ Infrastructure Management Guide

The `update-infra` command is a unified wrapper for Ansible, used to provision both your local workstation (`ntb`) and your cloud server (`halvarm`).

## **Usage**
```bash
update-infra <tag> [ansible-flags]
```

## **Key Tags (The "What")**
| Tag | Target | Description |
| :--- | :--- | :--- |
| `nvim` | Local | Synchronize Neovim configuration |
| `wezterm` | Local | Update WezTerm configuration |
| `ghostty` | Local | Update Ghostty configuration |
| `quarto` | Local | Provision Quarto and related filters |
| `jobs` | Server | Redeploy all Nomad jobs (Windmill, Falkor, etc.) |
| `langfuse` | Server | Deploy/Update the Langfuse Docker stack |
| `hashicorp` | Both | Provision Consul, Nomad, and Vault |
| `all` | Both | Run the entire infrastructure playbook |

## **Key Limits (The "Where")**
Use `--limit` to target specific host groups defined in `inventory.yml`:
*   `update-infra jobs --limit servers` (Update apps on halvarm only)
*   `update-infra nvim --limit local` (Update Neovim on laptop only)

## **Common Examples**
*   **Update Neovim config:** `update-infra nvim`
*   **Deploy Windmill/Falkor:** `update-infra jobs`
*   **Fix Server Core:** `update-infra hashicorp --limit servers`

---
*Note: This documentation is displayed when running `update-infra -h`.*
