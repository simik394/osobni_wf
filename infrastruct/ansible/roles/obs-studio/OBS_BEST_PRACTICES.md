# OBS Studio Best Practices

This document captures operational best practices for OBS Studio, specifically for multi-monitor recording workflows on native Linux (X11).

## 1. Capture Source Selection: XSHM vs PipeWire

| Method | When to Use | Pros | Cons |
|--------|-------------|------|------|
| **Screen Capture (XSHM)** | Native X11, non-Flatpak | Fastest, direct GPU memory access, no permission dialogs | X11 only |
| **Screen Capture (PipeWire)** | Wayland, Flatpak | Works everywhere, sandboxed | Slight overhead, permission prompt on each start |

> **Recommendation**: If you're on X11 with native OBS (like this Ansible role installs), use **XSHM** for maximum performance and stability.

## 2. Source Record Plugin: Multi-Source Recording

The [Source Record](https://obsproject.com/forum/resources/source-record.1285/) plugin allows recording individual sources (e.g., Monitor 1, Monitor 2) as separate files.

### How Source Record Works
- Applied as a **filter** on each source you want to record.
- Recording starts when you click the main "Start Recording" button.
- Each filtered source produces its own output file.

### The "Dummy Main Stream" Trick

**Problem**: Source Record only activates when main recording starts, creating an unwanted main recording file.

**Solution**: Configure the main output to be negligibly small:

1. Go to **Settings → Output → Recording**
2. Set the encoder to software (x264)
3. Enable **Rescale Output** and set to `16x16` or `64x64`
4. Set **Bitrate** to `100 kbps` or lower

This creates a tiny "dummy" file (~45 MB/hour) while your Source Record filters capture full-quality video.

## 3. Digital Clock Overlay (DateTimeMultiple.lua)

This Ansible role automatically installs the `DateTimeMultiple.lua` script for displaying a digital clock overlay.

### Setup in OBS:
1. Create a **Text (FreeType 2)** source in your scene (leave text empty)
2. Go to **Tools → Scripts**
3. Click **+** and select `~/.config/obs-studio/scripts/DateTimeMultiple.lua`
4. In the script settings:
   - Select your text source
   - Set format (e.g., `%H:%M:%S` for `HH:MM:SS`)

### Common Format Codes:
| Code | Example | Description |
|------|---------|-------------|
| `%H:%M:%S` | `14:35:22` | 24-hour time |
| `%I:%M:%S %p` | `02:35:22 PM` | 12-hour with AM/PM |
| `%Y-%m-%d %H:%M:%S` | `2025-12-26 14:35:22` | Full datetime |
| `%d.%m. %H:%M` | `26.12. 14:35` | European date + time |

## 4. One-Click Recording (Automated)

This Ansible role creates:
- **Script**: `~/bin/start_recording.sh` – launches OBS with recording active
- **Desktop Shortcut**: "OBS Recording" in your app menu

### Usage:
```bash
# From terminal:
start_recording.sh

# Or click "OBS Recording" in your application menu
```

OBS will start, immediately begin recording, and minimize to system tray.

## 5. Recommended Settings Summary

| Setting | Value | Reason |
|---------|-------|--------|
| Capture Method | XSHM | Fastest on X11 |
| Main Output Resolution | 16×16 | Dummy stream |
| Main Output Bitrate | 100 kbps | Minimal disk usage |
| Source Record Quality | Match source resolution | Full quality per-monitor |
| Recording Format | MKV | Crash-safe, remux to MP4 later |

---

## Related Documentation
- [[Prods/01-pwf/infrastruct/ansible/roles/obs-studio/README|Role README]] – Installation instructions
- [Project LESSONS_LEARNED](../../../LESSONS_LEARNED.md) – Cross-project insights
