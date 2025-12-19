# Dev Container for Logic-Driven IaC
# Includes SWI-Prolog, Janus, Python 3.11, and all dev tools

FROM swipl:stable

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Python and dev tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    git \
    curl \
    sudo \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Install Janus (Python-Prolog bridge) globally
RUN pip3 install --break-system-packages janus-swi

# Set up workspace
WORKDIR /workspaces/logic-driven-iac

# Add src to Python path
ENV PYTHONPATH=/workspaces/logic-driven-iac

# Default shell
CMD ["/bin/bash"]
