# x11vnc Ansible Role

Sets up **x11vnc** VNC server for remote desktop access from Android or any VNC client.

## Features

- Installs x11vnc package
- Creates password-protected VNC access
- Configures systemd service for automatic startup
- Shares the current X11 display (`:0`)

## Requirements

- Ubuntu/Debian-based system
- X11 display manager (GDM, LightDM, etc.)
- **Note**: If using Wayland, you may need to switch to X11 session or use an alternative like `wayvnc`

## Role Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `vnc_port` | `5900` | VNC server port |
| `vnc_password` | `changeme` | VNC password (pass securely via `-e`) |

## Usage

```yaml
- hosts: local
  roles:
    - role: x11vnc
      vars:
        vnc_password: "your-secure-password"
```

## Running

```bash
# Install with custom password
ansible-playbook setup_local.yml -l local --tags x11vnc \
  -e "vnc_password=YourSecurePassword" --ask-become-pass
```

## Connecting from Android

1. Install a VNC client on Android:
   - **bVNC** (free, open source)
   - **RealVNC Viewer** (free)
   - **VNC Viewer** by RealVNC

2. Connect to:
   - **Address**: `<your-notebook-ip>:5900`
   - **Password**: The one you set during installation

3. For security over public networks, consider tunneling VNC over SSH or Tailscale.

## Troubleshooting

If you're using **Wayland** (default on newer Ubuntu), x11vnc won't work. Either:
- Log out and select "Ubuntu on Xorg" at the login screen
- Or use `wayvnc` for Wayland (different setup)

## License

MIT
