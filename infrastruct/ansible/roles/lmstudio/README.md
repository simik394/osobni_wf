# LM Studio Ansible Role

Installs **LM Studio** by automatically detecting and downloading the latest AppImage from `lmstudio.ai`.

## Features

- **Dynamic Version detection**: Scrapes `lmstudio.ai/download` to find the latest version.
- **AppImage Installation**: Downloads the correct AppImage for Linux x64.
- **Desktop Integration**: Creates `~/.local/bin/lmstudio` symlink and a `.desktop` file.

## Requirements

- Linux x86_64 system
- Python 3 (on the controller machine) used to run the detection script.
- `~/.local/bin` should be in your `$PATH`.

### Hardware Requirements (LM Studio)

| Component | Minimum |
|-----------|---------|
| GPU VRAM  | 8 GB (NVIDIA/AMD) |
| RAM       | 16 GB |
| Storage   | 20 GB SSD |

## Role Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `lmstudio_install_dir` | `~/.local/share/lmstudio` | Installation directory |

## Usage

```yaml
- hosts: local
  roles:
    - role: lmstudio
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

## Updates

To update to the latest version, simply re-run the playbook. The role will detect the new version online and download it if the version number has changed.

## License

MIT
