# Stage 1: Build the TypeScript project
FROM mcr.microsoft.com/playwright:v1.58.0-jammy AS builder

WORKDIR /app

# 1. Copy package metadata and install dependencies
COPY package.json .
COPY agents/shared/package.json agents/shared/
COPY agents/rsrch/package.json agents/rsrch/

# Install dependencies (all, including dev for build)
RUN npm install

# 2. Copy source code and build
COPY . .
RUN npm run build --prefix agents/shared
RUN npm run build --prefix agents/rsrch

# Stage 2: Final production image
FROM mcr.microsoft.com/playwright:v1.58.0-jammy

# Install VNC and Window Manager
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    xterm \
    socat \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Copy package metadata
COPY package.json .
COPY agents/shared/package.json agents/shared/
COPY agents/rsrch/package.json agents/rsrch/

# 2. Install production dependencies (omitting dev)
RUN npm install --omit=dev && npm install pino-pretty

# 3. Copy built code from builder stage
COPY --from=builder /app/agents/shared/dist agents/shared/dist
COPY --from=builder /app/agents/rsrch/dist agents/rsrch/dist
COPY agents/rsrch/deploy agents/rsrch/deploy

# 4. FORCE GLOBAL NAMESPACE LINK (Systematic fix for @agents/shared resolution)
RUN mkdir -p /app/node_modules/@agents && \
    rm -rf /app/node_modules/@agents/shared && \
    ln -s /app/agents/shared /app/node_modules/@agents/shared

# 5. Fix relative paths for nested dist structures
RUN mkdir -p /app/agents/rsrch/dist/rsrch && \
    cp /app/agents/rsrch/package.json /app/agents/rsrch/dist/rsrch/package.json || \
    echo '{"version":"1.0.35"}' > /app/agents/rsrch/dist/rsrch/package.json && \
    echo '{"version":"1.0.35"}' > /app/agents/rsrch/dist/package.json

# 6. Global CLI registration
RUN cd /app/agents/rsrch && npm link --force

# 7. Entrypoint scripts
RUN chmod +x /app/agents/rsrch/deploy/start-vnc.sh

WORKDIR /app/agents/rsrch
EXPOSE 3055 5900 9223

CMD ["/app/agents/rsrch/deploy/start-vnc.sh"]
