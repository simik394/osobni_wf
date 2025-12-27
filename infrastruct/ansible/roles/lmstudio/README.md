# LM Studio Ansible Role

Installs [LM Studio](https://lmstudio.ai/) - a desktop application for discovering, downloading, and running local LLMs.

## Features

- Downloads LM Studio AppImage from official source
- Creates executable symlink at `~/.local/bin/lmstudio`
- Adds desktop entry for application launcher integration

## Requirements

- Linux x86_64 system
- `~/.local/bin` should be in your `$PATH`

### Hardware Requirements (LM Studio)

| Component | Minimum |
|-----------|---------|
| GPU VRAM  | 8 GB (NVIDIA/AMD) |
| RAM       | 16 GB |
| Storage   | 20 GB SSD |

## Role Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `lmstudio_version` | `0.3.23-3` | Version to install |
| `lmstudio_install_dir` | `~/.local/share/lmstudio` | Installation directory |

## Usage

```yaml
# In your playbook
- hosts: local
  roles:
    - role: lmstudio

# With custom version
- hosts: local
  roles:
    - role: lmstudio
      vars:
        lmstudio_version: "0.3.35-1"
```

## Running

```bash
# Full playbook
ansible-playbook setup_local.yml -l local --ask-become-pass

# Just this role (if tagged)
ansible-playbook setup_local.yml -l local --tags lmstudio
```

After installation:
- **Terminal**: Run `lmstudio`
- **Desktop**: Search "LM Studio" in your application launcher

## Updating

To update LM Studio, change `lmstudio_version` in `defaults/main.yml` or pass it as a variable, then re-run the playbook.

## License

MIT
