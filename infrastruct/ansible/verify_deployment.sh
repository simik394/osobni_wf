#!/bin/bash

HOST="halvarm"
echo "Verifying deployment on $HOST..."

# 1. Check Docker Containers
echo -e "\n--- Checking Docker Containers ---"
ssh $HOST "sudo docker compose -f /home/ubuntu/langfuse/docker-compose.yml ps"

# 2. Check HTTP Reachability (from the server itself to verify it's up locally)
echo -e "\n--- Checking Internal Health (curl localhost:3000) ---"
ssh $HOST "curl -I http://localhost:3000"

# 3. Check logs for errors (tailing last 20 lines of web container)
echo -e "\n--- Checking Langfuse Web Logs (Last 20 lines) ---"
ssh $HOST "sudo docker compose -f /home/ubuntu/langfuse/docker-compose.yml logs --tail 20 langfuse-web"

echo -e "\nVerification Complete."

