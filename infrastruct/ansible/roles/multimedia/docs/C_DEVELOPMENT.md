# C Development for X11 Metadata Tool

## Overview
The `xmeta` tool is a minimalist C program designed to extract window metadata from the X11 server with near-zero overhead. It is used by `screenshot-record` to log activity for decision-making analysis.

## Why C?
- **Speed:** Execution takes ~2ms.
- **Efficiency:** Minimal memory footprint (< 1MB).
- **Direct Access:** Communicates directly with the X server via `libX11`.

## Source Code Explanation (`xmeta.c`)
1. **Display Connection:** `XOpenDisplay(NULL)` connects to your graphical session.
2. **Input Focus:** `XGetInputFocus` identifies the window you are currently interacting with.
3. **Window Tree:** `XQueryTree` retrieves all windows managed by the X server.
4. **Attributes:** `XGetWindowAttributes` checks if a window is visible (`IsViewable`).
5. **Memory Management:** `XFree` is crucial to prevent memory leaks, as C does not have automatic garbage collection.

## Compilation
To compile the tool manually:
```bash
gcc xmeta.c -lX11 -o xmeta
```

## Performance Note
Running this tool every 2 seconds is significantly more efficient than using Python or Bash scripts that call multiple external binaries.
