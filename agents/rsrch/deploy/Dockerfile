FROM node:20-slim
WORKDIR /app

# 1. Copy workspace definitions and package.json files for caching
COPY package.json .
COPY agents/shared/package.json agents/shared/
COPY agents/rsrch/package.json agents/rsrch/

# 2. Install all dependencies (handles cross-linking naturally)
RUN npm install

# 3. Copy source code
COPY agents/shared agents/shared
COPY agents/rsrch agents/rsrch

# 4. Build components sequentially
RUN npm run build -w @agents/shared
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm run build -w rsrch

# 5. Final configuration
WORKDIR /app/agents/rsrch
EXPOSE 3001
CMD ["node", "dist/rsrch/src/index.js", "serve"]
