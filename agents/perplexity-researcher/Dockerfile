FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

# Install VNC and Window Manager
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Default command (can be overridden)
CMD ["npm", "start"]
