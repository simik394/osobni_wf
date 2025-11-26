FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Install VNC and Window Manager for headed mode
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Expose HTTP server port
EXPOSE 3000

# Expose VNC port (optional, for debugging headed mode)
EXPOSE 5900

# Default: Run the HTTP server
CMD ["npm", "run", "serve"]

