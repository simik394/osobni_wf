# Akai APC Mini Control Role

This Ansible role configures a Linux system to use an **Akai APC Mini** MIDI controller as a hardware control surface for system tasks, specifically for controlling the `screenshot-record` tool.

## 📂 File Locations

The configuration is managed via Ansible but deploys files to your local system:

| File Type | Ansible Source | Local Deployment |
|-----------|----------------|------------------|
| **Control Script** | `files/apc-control.py` | `~/bin/apc-control.py` |
| **Record Tool** | `files/screenshot-record` | `~/bin/screenshot-record` |
| **Autostart** | `files/apc-control.desktop` | `~/.config/autostart/apc-control.desktop` |
| **Menu Shortcut**| `files/apc-control.desktop` | `~/.local/share/applications/apc-control.desktop` |

## 🚀 Usage

1.  **Plug in** the Akai APC Mini.
2.  The `apc-control` service starts automatically on login.
3.  **Top-Left Pad (Note 0):**
    *   **Press** to toggle recording.
    *   **Green Light:** System Ready (Idle).
    *   **Red Light:** Recording in progress.
    *   **Yellow/Off:** Controller not connected or script error.

### Manual Control

If the controller is not responding, you can restart the service manually:

```bash
# Kill existing process and restart
pkill -f apc-control.py
nohup python3 ~/bin/apc-control.py > /tmp/apc-control.log 2>&1 &
```

## 🛠 Installation

To re-apply or update the configuration, run the Ansible playbook:

```bash
cd ~/Obsi/Prods/01-pwf/infrastruct/ansible
ansible-playbook setup_local.yml --tags akai-apc
```
