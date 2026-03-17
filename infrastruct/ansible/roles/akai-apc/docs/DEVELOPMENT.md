# Developer Guide: Akai APC Control Extension

This document outlines the architecture of the `apc-control.py` script and provides instructions on how to extend it with new commands.

## 🏗 Architecture

The script uses the `mido` Python library to interface with the ALSA MIDI system.

1.  **Connection:** Scans for a device containing "apc mini" (case-insensitive) in its name.
2.  **Event Loop:** Listens for `note_on` MIDI messages.
3.  **State Management:** Checks the running process list (via `subprocess`) to determine the LED state (Red vs Green).

## 🧩 Extending Functionality

To add new buttons, you need to modify `files/apc-control.py` in the Ansible role.

### 1. Identify Button IDs

Run the test script to find the MIDI Note ID of the button you want to use:

```python
# Create a temporary test script
import mido
with mido.open_input(mido.get_input_names()[0]) as p:
    for msg in p:
        print(msg)
```

*   **Pad Grid:** Notes 0-63.
*   **Side Buttons:** Notes 82-89.
*   **Bottom Buttons:** Notes 64-71.

### 2. Add Command Mapping

Edit `apc-control.py` to add a dispatch logic.

**Current Implementation:**
```python
if msg.note == BUTTON_NOTE:
    # ... logic for recording ...
```

**Recommended Extension Pattern:**

Define a dictionary mapping Notes to Functions:

```python
def toggle_recording():
    # ... existing logic ...

def launch_terminal():
    subprocess.Popen(["gnome-terminal"])

# Configuration
COMMAND_MAP = {
    0: toggle_recording,   # Top-Left Pad
    64: launch_terminal    # Bottom-Left Button
}

# In the main loop:
if msg.note in COMMAND_MAP:
    COMMAND_MAP[msg.note]()
```

### 3. LED Feedback

The APC Mini supports 3 colors via Velocity values sent to `note_on` events:

*   **0:** Off
*   **1:** Green
*   **3:** Red
*   **5:** Yellow

To light up a new button, send a message back:

```python
outport.send(mido.Message('note_on', note=64, velocity=5, channel=0))
```

## 🔄 Deployment Cycle

1.  Edit `files/apc-control.py` in the Ansible role directory.
2.  Run the playbook to deploy the change:
    ```bash
    ansible-playbook setup_local.yml --tags akai-apc
    ```
3.  The script typically needs a restart (handled by manual kill or re-login, but you can add a handler in Ansible if frequent updates are expected).
