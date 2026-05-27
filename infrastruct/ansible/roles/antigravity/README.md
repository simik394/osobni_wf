# Ansible Role: Antigravity IDE

This role updates the Antigravity IDE to the latest version by querying the auto-updater API, downloading the official tarball, and extracting it to `/usr/share/antigravity`.

## Role Tasks
1. **Get current version**: Reads `/usr/share/antigravity/VERSION`.
2. **Fetch latest version metadata**: Runs a local Python script `get_latest_antigravity.py` to query the auto-updater API (`https://antigravity-ide-auto-updater-974169037036.us-central1.run.app/releases`).
3. **Backup existing installation**: Creates a copy of `/usr/share/antigravity` under `/usr/share/antigravity.bak`.
4. **Clean extraction**: Wipes `/usr/share/antigravity` and extracts the downloaded archive.
5. **Launcher compatibility**: Creates symlinks so `/usr/share/antigravity/antigravity` maps to the new `antigravity-ide` binary format.
6. **Permission normalization**: Sets root ownership and sets setuid permission on the `chrome-sandbox` executable.
7. **Version tagging**: Writes the installed version to `/usr/share/antigravity/VERSION`.

## Integration
This role is mapped under the `antigravity` tag in the local playbook and can be triggered system-wide using:
```bash
update-infra antigravity
```
