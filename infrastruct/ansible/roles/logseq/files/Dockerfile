# Builder image based on official Logseq base
FROM clojure:temurin-11-tools-deps-1.11.1.1208-bullseye-slim as builder

ARG DEBIAN_FRONTEND=noninteractive

# Install dependencies required for Electron build and native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    apt-transport-https \
    gpg \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libgl1 \
    libxi6 \
    libxtst6 \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install NodeJS 20 & Yarn (Required by feat/db)
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g yarn

WORKDIR /app

# We will mount the source code here or clone it in the Entrypoint
# For the Ansible role, we'll mount the cloned repo to reuse the host's clone/cache if desired, 
# or we can clone inside. To ensure 'feat/db' is fresh, let's allow the build command to handle it.

CMD ["/bin/bash"]
