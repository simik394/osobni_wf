FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Install VNC and Window Manager
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    fluxbox \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Install playwright package for the server script
WORKDIR /app
RUN npm init -y && \
    npm install playwright@1.57.0 \
    playwright-extra \
    puppeteer-extra-plugin-stealth

COPY start.sh /start.sh
COPY server.js /app/server.js
RUN chmod +x /start.sh

EXPOSE 3000 5900 9223

CMD ["/start.sh"]
