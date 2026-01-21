FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Copy package files first for layer caching
COPY rsrch/package.json rsrch/package-lock.json* ./
COPY shared ./shared/

# Update package.json to point to the correct shared module path
RUN sed -i 's|file:../shared|file:./shared|g' package.json

# Build shared library first (required for CI where dist/ is missing)
RUN cd shared && npm install && npm run build
RUN echo "=== SHARED DIST INDEX.D.TS ===" && cat shared/dist/index.d.ts || echo "No shared dist"

# Install dependencies (browsers are already in the image)
# Install xvfb, x11vnc, and fluxbox for headed mode support with VNC
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y xvfb x11vnc fluxbox && rm -rf /var/lib/apt/lists/*
RUN npm install

# Copy rsrch source files
COPY rsrch/src ./src/
COPY rsrch/tsconfig.json ./
COPY rsrch/*.sh ./

RUN echo "=== NODE MODULES SHARED INDEX.D.TS ===" && cat node_modules/@agents/shared/dist/index.d.ts || echo "No symlink"

# Build TypeScript
RUN npm run build

# Expose HTTP server port and VNC port
EXPOSE 3000 5900

# Make startup script executable
RUN chmod +x start-vnc.sh

# Default: Run the VNC startup script which launches the server
CMD ["./start-vnc.sh"]
