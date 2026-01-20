# reMarkable 2 Dual-Boot Ansible Role

Ansible role for safely setting up dual-boot on reMarkable 2 tablet.

## Features

- **Safe flashing**: Writes to fallback partition only, current firmware remains untouched
- **Backup**: Automatic backup of `/home/root` before any changes
- **Idempotency**: Won't re-flash if already configured
- **Dry-run support**: Use `--check` to preview changes
- **Auto-update disable**: Prevents firmware upgrades that would break dual-boot

## Requirements

- reMarkable 2 tablet
- SSH access enabled (check Settings → Copyright → General information)
- USB connection (default IP: 10.11.99.1) or WiFi

## Quick Start

1. **Get SSH password** from tablet: Settings → Copyright → scroll to "GPLv3 Compliance"

2. **Test SSH connectivity**:
   ```bash
   ssh root@10.11.99.1
   ```

3. **Dry-run first**:
   ```bash
   cd infrastruct/ansible
   ansible-playbook setup_remarkable.yml --check -v
   ```

4. **Run for real** (will prompt for confirmation):
   ```bash
   ansible-playbook setup_remarkable.yml -v
   ```

## Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `remarkable_target_firmware` | `2.8.0.307` | Firmware version for dual-boot |
| `remarkable_backup_before_flash` | `true` | Backup /home before flashing |
| `remarkable_disable_auto_update` | `true` | Disable update-engine service |
| `remarkable_dry_run` | `false` | Skip actual flash operation |

## After Installation

SSH to your reMarkable and run:
```bash
./switch.sh
```

This reboots into the other firmware version. Run again to switch back.

## Rollback

If something goes wrong:
1. Backups are in `infrastruct/ansible/backups/remarkable/`
2. To manually switch partitions:
   ```bash
   fw_setenv active_partition <2 or 3>
   reboot
   ```

## Testing with QEMU

See `files/remarkable-qemu-setup.sh` for emulator setup instructions.

## Warning

> ⚠️ **Brick risk**: Incorrect modifications can temporarily brick your tablet.
> Always keep a backup and understand the recovery process before proceeding.
