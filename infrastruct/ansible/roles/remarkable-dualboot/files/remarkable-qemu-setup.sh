#!/bin/bash
# reMarkable QEMU Emulator Setup Script
# For testing Ansible role before deploying to real device
#
# Usage:
#   ./remarkable-qemu-setup.sh setup    # First-time setup
#   ./remarkable-qemu-setup.sh start    # Start emulator
#   ./remarkable-qemu-setup.sh stop     # Stop emulator
#   ./remarkable-qemu-setup.sh ssh      # SSH into running emulator

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/../qemu_test"
FIRMWARE_VERSION="${REMARKABLE_FIRMWARE:-2.8.0.307}"
SSH_PORT="${REMARKABLE_SSH_PORT:-2222}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependencies() {
    log_info "Checking dependencies..."
    local missing=()
    
    command -v qemu-system-arm >/dev/null || missing+=("qemu-system-arm")
    command -v python3 >/dev/null || missing+=("python3")
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        echo "Install with: sudo apt install qemu-system-arm python3 python3-pip"
        exit 1
    fi
    
    # Check codexctl
    if [ ! -f "${SCRIPT_DIR}/codexctl" ]; then
        log_warn "codexctl not found, will download during setup"
    fi
}

setup_codexctl() {
    if [ ! -f "${SCRIPT_DIR}/codexctl" ]; then
        log_info "Downloading codexctl..."
        curl -L -o "${SCRIPT_DIR}/codexctl" \
            "https://github.com/Jayy001/codexctl/releases/download/0.2.3/codexctl-linux-x86_64"
        chmod +x "${SCRIPT_DIR}/codexctl"
    fi
}

download_firmware() {
    mkdir -p "${WORK_DIR}"
    
    if [ ! -f "${WORK_DIR}/${FIRMWARE_VERSION}.swu" ]; then
        log_info "Downloading firmware ${FIRMWARE_VERSION}..."
        "${SCRIPT_DIR}/codexctl" download \
            --out "${WORK_DIR}/" \
            --hardware rm2 \
            "${FIRMWARE_VERSION}"
    else
        log_info "Firmware already downloaded"
    fi
}

extract_rootfs() {
    if [ ! -f "${WORK_DIR}/rootfs.ext4" ]; then
        log_info "Extracting rootfs from firmware..."
        "${SCRIPT_DIR}/codexctl" extract \
            "${WORK_DIR}/${FIRMWARE_VERSION}.swu" \
            --out "${WORK_DIR}/rootfs.ext4"
    else
        log_info "Rootfs already extracted"
    fi
    
    # Create qcow2 disk for QEMU
    if [ ! -f "${WORK_DIR}/remarkable.qcow2" ]; then
        log_info "Creating QEMU disk image..."
        qemu-img create -f qcow2 "${WORK_DIR}/remarkable.qcow2" 4G
        # TODO: Inject rootfs into qcow2
        log_warn "Manual step required: inject rootfs.ext4 into qcow2"
    fi
}

start_emulator() {
    log_info "Starting QEMU emulator on SSH port ${SSH_PORT}..."
    
    # Note: Full reMarkable emulation is complex due to custom hardware
    # This provides a basic ARM Linux environment for testing Ansible commands
    qemu-system-arm \
        -M mcimx7d-sabre \
        -m 512M \
        -nographic \
        -kernel "${WORK_DIR}/zImage" \
        -dtb "${WORK_DIR}/imx7d-sabresd.dtb" \
        -drive file="${WORK_DIR}/remarkable.qcow2",format=qcow2 \
        -append "console=ttymxc0 root=/dev/mmcblk0p2 rw" \
        -netdev user,id=net0,hostfwd=tcp::${SSH_PORT}-:22 \
        -device virtio-net-device,netdev=net0 \
        &
    
    QEMU_PID=$!
    echo $QEMU_PID > "${WORK_DIR}/qemu.pid"
    log_info "QEMU started with PID ${QEMU_PID}"
    log_info "SSH available at: ssh -p ${SSH_PORT} root@localhost"
}

stop_emulator() {
    if [ -f "${WORK_DIR}/qemu.pid" ]; then
        PID=$(cat "${WORK_DIR}/qemu.pid")
        if kill -0 "$PID" 2>/dev/null; then
            log_info "Stopping QEMU (PID ${PID})..."
            kill "$PID"
            rm "${WORK_DIR}/qemu.pid"
        else
            log_warn "QEMU process not running"
            rm "${WORK_DIR}/qemu.pid"
        fi
    else
        log_warn "No PID file found"
    fi
}

ssh_to_emulator() {
    ssh -o StrictHostKeyChecking=no -p "${SSH_PORT}" root@localhost
}

case "${1:-help}" in
    setup)
        check_dependencies
        setup_codexctl
        download_firmware
        extract_rootfs
        log_info "Setup complete! Run './remarkable-qemu-setup.sh start' to launch emulator"
        log_warn "Note: Full reMarkable emulation requires additional kernel/dtb files"
        ;;
    start)
        start_emulator
        ;;
    stop)
        stop_emulator
        ;;
    ssh)
        ssh_to_emulator
        ;;
    *)
        echo "reMarkable QEMU Emulator Setup"
        echo ""
        echo "Usage: $0 {setup|start|stop|ssh}"
        echo ""
        echo "Commands:"
        echo "  setup   Download firmware and prepare QEMU environment"
        echo "  start   Start the QEMU emulator"
        echo "  stop    Stop the running emulator"
        echo "  ssh     SSH into the running emulator"
        echo ""
        echo "Environment variables:"
        echo "  REMARKABLE_FIRMWARE   Firmware version (default: 2.8.0.307)"
        echo "  REMARKABLE_SSH_PORT   SSH port for emulator (default: 2222)"
        ;;
esac
