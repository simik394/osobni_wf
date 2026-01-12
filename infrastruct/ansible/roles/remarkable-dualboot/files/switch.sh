#!/bin/bash
# switches the active root partition
# Source: https://github.com/ddvk/remarkable-update
# Vendored for Ansible role

fw_setenv "upgrade_available" "1"
fw_setenv "bootcount" "0"

OLDPART=$(fw_printenv -n active_partition)
if [ "$OLDPART" == "2" ]; then
    NEWPART="3"
else
    NEWPART="2"
fi

echo "Switching partitions..."
echo "New active: ${NEWPART}"
echo "Fallback: ${OLDPART}"

fw_setenv "fallback_partition" "${OLDPART}"
fw_setenv "active_partition" "${NEWPART}"

echo "Done. Rebooting in 3 seconds..."
sleep 3
reboot
