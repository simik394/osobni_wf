FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV WINEPREFIX=/home/remarkable/.wine
ENV WINEARCH=win64
# Remove hardcoded DISPLAY so it uses the host's passed value
# ENV DISPLAY=:0

# 1. Install System Dependencies
RUN dpkg --add-architecture i386 && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        wget gnupg2 software-properties-common xvfb winbind cabextract \
        iproute2 net-tools x11-xserver-utils dbus-x11 \
        libgl1-mesa-glx:i386 libgl1-mesa-dri:i386 libvulkan1 libvulkan1:i386 \
        unzip p7zip-full ca-certificates \
        libncurses6:i386 libfreetype6:i386 libasound2:i386

# 2. Install WineHQ Stable
RUN mkdir -pm755 /etc/apt/keyrings && \
    wget -O /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
    wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources && \
    apt-get update && \
    apt-get install -y --install-recommends winehq-stable

# 3. Install Winetricks
RUN wget https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks \
    -O /usr/local/bin/winetricks && chmod +x /usr/local/bin/winetricks

# 4. Setup User
RUN useradd -m -u 1001 -s /bin/bash remarkable
USER remarkable
WORKDIR /home/remarkable

# 5. Download reMarkable Installer
RUN wget -O installer.exe "https://downloads.remarkable.com/latest/windows"

COPY --chown=remarkable:remarkable entrypoint.sh /home/remarkable/entrypoint.sh
RUN chmod +x /home/remarkable/entrypoint.sh

# 6. Hotfix for OLE/RpcSs dependencies (Rule 1: Adding a new layer instead of invalidating expensive ones)
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libxslt1.1:i386 libxml2:i386 libdbus-1-3:i386 wine-stable-i386:i386 dbus-x11
USER remarkable

VOLUME /home/remarkable/.wine

ENTRYPOINT ["/home/remarkable/entrypoint.sh"]
