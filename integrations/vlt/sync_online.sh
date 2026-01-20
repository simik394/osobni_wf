#!/bin/bash
# Sync online data from Gemini to FalkorDB
cd /home/sim/Obsi/Prods/01-pwf/agents/rsrch
npx tsx src/index.ts notebook sync --local
