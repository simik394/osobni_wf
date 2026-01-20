# syntax=docker/dockerfile:1
# Multi-stage Docker build for Ghostty terminal emulator
# Stage 1: Build with Zig
FROM ubuntu:22.04 AS builder

ARG GHOSTTY_VERSION=v1.1.3
ARG ZIG_VERSION=0.13.0

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    libgtk-4-dev \
    libadwaita-1-dev \
    gettext \
    libxml2-utils \
    git \
    curl \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Download and install Zig
RUN curl -fsSL https://ziglang.org/download/${ZIG_VERSION}/zig-linux-x86_64-${ZIG_VERSION}.tar.xz | \
    tar -xJ -C /opt && \
    mv /opt/zig-linux-x86_64-${ZIG_VERSION} /opt/zig

ENV PATH="/opt/zig:${PATH}"

# Clone and build Ghostty
WORKDIR /build
RUN git clone --depth 1 --branch ${GHOSTTY_VERSION} https://github.com/ghostty-org/ghostty.git .

RUN zig build -Doptimize=ReleaseFast

# Stage 2: Minimal image with just the binary
FROM scratch AS export
COPY --from=builder /build/zig-out/bin/ghostty /ghostty
