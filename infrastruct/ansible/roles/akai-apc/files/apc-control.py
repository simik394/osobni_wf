#!/usr/bin/env python3
import mido
import subprocess
import time
import sys
import os

# --- Configuration ---
# Button Note: 56 is the top-left pad on APC Mini grid
BUTTON_NOTE = 56

# Colors for APC Mini MK1 (and often MK2 in compatibility mode)
# 0=Off, 1=Green, 3=Red, 5=Yellow
COLOR_OFF = 0
COLOR_RUNNING = 3  # Red for recording
COLOR_IDLE = 1     # Green for ready

# Command to control
CMD_START = ["/home/sim/bin/screenshot-record", "start"]
CMD_STOP = ["/home/sim/bin/screenshot-record", "stop"]
CMD_STATUS = ["/home/sim/bin/screenshot-record", "status"]

def get_apc_port_name():
    """Finds the APC Mini port name."""
    try:
        inputs = mido.get_input_names()
        for name in inputs:
            if "apc mini" in name.lower():
                return name
    except Exception as e:
        print(f"Error listing ports: {e}")
    return None

def is_running():
    """Checks if the recording tool is running."""
    try:
        result = subprocess.run(CMD_STATUS, capture_output=True, text=True)
        return "Running" in result.stdout
    except Exception:
        return False

def update_led(outport, running):
    """Updates the LED status."""
    if outport:
        color = COLOR_RUNNING if running else COLOR_IDLE
        msg = mido.Message('note_on', note=BUTTON_NOTE, velocity=color, channel=0)
        outport.send(msg)

def main():
    print("Looking for APC Mini...")
    port_name = get_apc_port_name()

    while port_name is None:
        print("APC Mini not found. Retrying in 5 seconds...")
        time.sleep(5)
        port_name = get_apc_port_name()

    print(f"Connected to: {port_name}")

    try:
        # Open Input (listen) and Output (LEDs)
        with mido.open_input(port_name) as inport, mido.open_output(port_name) as outport:

            # Initial LED state
            running = is_running()
            update_led(outport, running)

            print(f"Ready! Press Pad {BUTTON_NOTE} to toggle recording.")

            for msg in inport:
                # We only care about Note On with velocity > 0 (Press)
                if msg.type == 'note_on' and msg.velocity > 0:
                    if msg.note == BUTTON_NOTE:
                        print(f"Button {BUTTON_NOTE} pressed.")

                        if is_running():
                            print("Stopping recording...")
                            subprocess.run(CMD_STOP)
                            running = False
                        else:
                            print("Starting recording...")
                            subprocess.run(CMD_START)
                            running = True

                        update_led(outport, running)

    except KeyboardInterrupt:
        print("\nExiting.")
    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    main()
