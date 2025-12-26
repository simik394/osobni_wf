# Ansible Role: obs-studio

This role handles the installation and configuration of OBS Studio on Linux (Ubuntu/Pop!_OS).

## Features
- **Official PPA**: Adds `ppa:obsproject/obs-studio` to ensure the latest version.
- **Source Record Plugin**: Automatically installs the [Source Record](https://obsproject.com/forum/resources/source-record.1285/) plugin (v0.4.6) for per-source recording.
- **Digital Clock Script**: Installs `DateTimeMultiple.lua` for digital time overlay.
- **One-Click Recording**: Creates `~/bin/start_recording.sh` script and desktop shortcut.
- **Profile Configuration**: Creates a "Recording" profile with optimized dummy output (64×64, 100kbps).
- **Idempotent**: Skips installations if already present, making repeat runs fast.

## Usage
Run the role via your main playbook:
```bash
ansible-playbook -i inventory.yml setup_local.yml --ask-become-pass
```

## Configuration Variables

Override these in your playbook or inventory:

| Variable | Default | Description |
|----------|---------|-------------|
| `obs_profile_name` | `Recording` | Name of the OBS profile to create |
| `obs_recording_path` | `~/Videos/OBS` | Directory for recordings |
| `obs_canvas.width` | `1920` | Base canvas width |
| `obs_canvas.height` | `1080` | Base canvas height |
| `obs_output.width` | `64` | Output resolution (dummy) |
| `obs_output.height` | `64` | Output resolution (dummy) |
| `obs_dummy_output.video_bitrate` | `100` | Main stream bitrate (kbps) |

## After Installation

1. Start OBS and select the **"Recording"** profile
2. Add your sources (monitors via XSHM)
3. Add Source Record filters to each source
4. Configure DateTimeMultiple.lua in **Tools → Scripts**

See [[OBS_BEST_PRACTICES|OBS_BEST_PRACTICES.md]] for detailed setup instructions.

## Related Documentation
- **[[OBS_BEST_PRACTICES|OBS_BEST_PRACTICES.md]]** – Multi-monitor recording, Source Record setup, automation tips
- [LESSONS_LEARNED.md](../../../LESSONS_LEARNED.md) – Cross-project technical insights
