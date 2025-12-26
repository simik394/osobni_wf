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

## 3. Clock Overlay Fix (Linux)

The default `clock-source.lua` script may not detect Linux text sources.

**Fix**: Edit the script to include `text_ft2_source_v2`:

```lua
-- Find this line (around line 36):
if source_id == "text_gdiplus" or source_id == "text_ft2_source" then

-- Change it to:
if source_id == "text_gdiplus" or source_id == "text_ft2_source" or source_id == "text_ft2_source_v2" then
```

Location: `/usr/share/obs/obs-plugins/frontend-tools/scripts/clock-source.lua`
(Copy to `~/Documents/` if you don't have write access)

## 4. Automation Script

For one-click recording startup:

```bash
#!/bin/bash
# File: ~/start_recording.sh
# Make executable: chmod +x ~/start_recording.sh

obs --startrecording --minimize-to-tray
```

This starts OBS in the background, immediately begins recording, and minimizes to system tray.

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
