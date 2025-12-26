# Ansible Role: obs-studio

This role handles the installation and configuration of OBS Studio on Linux (Ubuntu/Pop!_OS).

## Features
- **Official PPA**: Adds `ppa:obsproject/obs-studio` to ensure the latest version.
- **Source Record Plugin**: Automatically installs the [Source Record](https://obsproject.com/forum/resources/source-record.1285/) plugin (v0.4.6).
- **Optimization**: The plugin installation includes a check to skip download and extraction if the binary is already present, making the role highly efficient for repeat runs.

## Usage
Run the role via your main playbook:
```bash
ansible-playbook -i inventory.yml setup_local.yml --tags obs-studio --ask-become-pass
```

## Plugin Details
- **Binary**: `~/.config/obs-studio/plugins/source-record/bin/64bit/source-record.so`
- **Data**: `~/.config/obs-studio/plugins/source-record/data/`

> **Note**: The plugin is installed per-user, not system-wide. This avoids permission issues and works with both native and Flatpak OBS installations.

## Related Documentation
- **[[OBS_BEST_PRACTICES|OBS_BEST_PRACTICES.md]]** – Multi-monitor recording, Source Record setup, automation tips
- [LESSONS_LEARNED.md](../../../LESSONS_LEARNED.md) – Cross-project technical insights
