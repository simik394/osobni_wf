#!/bin/bash

HOST="halvarm"
echo "Verifying deployment on $HOST..."

# 1. Check System Services
echo -e "\n--- Checking System Services ---"
ssh $HOST "systemctl is-active nomad consul vault docker"

# 2. Check Nomad Status
echo -e "\n--- Checking Nomad Status ---"
ssh $HOST "nomad status"

# 3. Check Consul Members
echo -e "\n--- Checking Consul Members ---"
ssh $HOST "consul members"

# 4. Check Vault Status
echo -e "\n--- Checking Vault Status ---"
ssh $HOST "vault status"

# 5. Check Docker Containers (via Nomad)
echo -e "\n--- Checking Docker Containers ---"
ssh $HOST "docker ps"

echo -e "\nVerification Complete."
