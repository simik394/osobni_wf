#!/bin/bash

# Test script for the Perplexity Researcher HTTP service
# This script demonstrates how to interact with the service

BASE_URL="http://localhost:3000"

echo "=== Perplexity Researcher Service Test ==="
echo

# 1. Health check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/health" | jq .
echo
echo

# 2. Send a simple query
echo "2. Sending a simple query..."
curl -s -X POST "$BASE_URL/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is the capital of France?"}' | jq .
echo
echo

# 3. Send a second query (should be faster due to session reuse)
echo "3. Sending a second query (should be faster)..."
curl -s -X POST "$BASE_URL/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"What is 2+2?"}' | jq .
echo
echo

echo "=== Test complete ==="
