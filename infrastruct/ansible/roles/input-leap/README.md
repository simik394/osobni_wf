# Input Leap Ansible Role

Installs and configures [Input Leap](https://github.com/input-leap/input-leap) for sharing keyboard and mouse between multiple computers.

## Requirements

- Ubuntu/Debian-based system (uses PPA)
- UFW firewall (optional)

## Role Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `input_leap_role` | `server` | Role: `server` or `client` |
| `input_leap_server_name` | `{{ ansible_hostname }}` | Server screen name |
| `input_leap_clients` | See defaults | List of client screens with positions |
| `input_leap_port` | `24800` | Network port |
| `input_leap_enable_service` | `true` | Enable systemd user service |

### Client Configuration

```yaml
input_leap_clients:
  - name: "windows-pc"
    position: left  # left, right, up, down relative to server
```

## Example Playbook

```yaml
- hosts: localhost
  roles:
    - role: input-leap
      input_leap_clients:
        - name: "wtw.a"
          position: left
```

## Windows Client Setup

1. Download from [GitHub Releases](https://github.com/input-leap/input-leap/releases)
2. Install and configure as **Client**
3. Set server address to the Linux machine's IP
4. Set screen name to match the `name` in `input_leap_clients`

## Keyboard Shortcuts

- `Super+Shift+Left/Right` - Switch screens manually
