# Multi-stage build for SWI-Prolog + Janus + Python
FROM swipl:stable AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3-dev \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Janus (Python-Prolog bridge)
RUN pip3 install --break-system-packages janus-swi

# Runtime stage
FROM swipl:stable

# Install Python runtime
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Janus from builder
COPY --from=builder /usr/local/lib/python3*/dist-packages /usr/local/lib/python3.11/dist-packages

# Install Python dependencies
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt

# Copy application code
COPY src/ ./src/

# Default entrypoint
ENTRYPOINT ["python3", "-m", "src.controller.main"]
CMD ["--help"]
