#!/bin/bash
set -e

# Usage: ./run.sh [TARGET_IP] [SSH_USER]
# Example: ./run.sh 192.168.1.100 ubuntu

TARGET_IP=${1:-localhost}
SSH_USER=${2:-$USER}

if ! command -v ansible-playbook &> /dev/null; then
    echo "Ansible is not installed. Installing..."
    if [ -f /etc/debian_version ]; then
        sudo apt update && sudo apt install -y ansible
    elif [ -f /etc/redhat-release ]; then
        sudo dnf install -y ansible-core
    else
        echo "Unsupported OS for automatic Ansible installation. Please install Ansible manually."
        exit 1
    fi
fi

echo "Deploying Langfuse to $TARGET_IP as $SSH_USER..."

# Create a temporary inventory file
echo "[langfuse_server]" > inventory.ini
if [ "$TARGET_IP" = "localhost" ]; then
    echo "localhost ansible_connection=local" >> inventory.ini
else
    echo "$TARGET_IP ansible_user=$SSH_USER ansible_ssh_common_args='-o StrictHostKeyChecking=no'" >> inventory.ini
fi

# Run the playbook
ansible-playbook -i inventory.ini deploy.yml

# Clean up
rm inventory.ini

echo "Deployment complete! Langfuse should be available at http://$TARGET_IP:3000"
