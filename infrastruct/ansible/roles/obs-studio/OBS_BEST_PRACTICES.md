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

## 4. Recording Scripts

This Ansible role installs `obs-record` – a command-line tool to control OBS recording.

### Commands:

| Command | Description |
|---------|-------------|
| `obs-record start` | Launch OBS, start recording, minimize to tray |
| `obs-record stop` | Stop recording, close OBS, **delete dummy files** |
| `obs-record status` | Check if OBS is running |

### Typical Workflow:

```bash
# Start recording session
obs-record start

# ... work on your tasks ...

# Stop when done (auto-cleans dummy files)
obs-record stop
```

### What Gets Recorded:

| File Pattern | Source | Content |
|-------------|--------|---------|
| `hdmi_*.mkv` | Source Record | HDMI monitor (full quality) |
| `notebook_*.mkv` | Source Record | Notebook screen (full quality) |
| ~~`2025-*.mkv`~~ | Main output | **Auto-deleted** (64×64 dummy) |

### Desktop Shortcut:
Click **"OBS Recording"** in your app menu to start (equivalent to `obs-record start`).

> **Note**: To stop recording from GUI, right-click OBS in system tray → Quit. Then run `obs-record stop` to cleanup dummy files.

## 5. Clock Overlay Setup (Manual)

The `DateTimeMultiple.lua` script is installed automatically, but must be configured manually in OBS:

1. **Tools → Scripts**
2. Select `DateTimeMultiple.lua` in the list
3. Set **Source 1** to "Clock"
4. Set **Format 1** to `%H:%M:%S` (or your preferred format)

## 6. Recommended Settings Summary

| Setting | Value | Reason |
|---------|-------|--------|
| Capture Method | XSHM | Fastest on X11 |
| Main Output | 64×64 (dummy) | Ignored, auto-deleted |
| Source Record Encoder | x264 (veryfast) | Reliable, good for text |
| Source Record Resolution | 1280×720 | Good quality/size balance |
| Recording Format | MKV | Crash-safe, remux to MP4 later |

---

## Related Documentation
- [[Prods/01-pwf/infrastruct/ansible/roles/obs-studio/README|Role README]] – Installation instructions
- [LESSONS_LEARNED.md](../../../LESSONS_LEARNED.md) – Cross-project insights
