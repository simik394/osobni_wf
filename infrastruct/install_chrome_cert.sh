#!/bin/bash

# This script installs a certificate into Chrome's NSS database.
#
# Usage: ./install_chrome_cert.sh <certificate_file> <nickname>
# Example: ./install_chrome_cert.sh /home/sim/Downloads/obsidian-local-rest-api.crt "Obsidian Local REST API"

# Check if the correct number of arguments are provided
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <certificate_file> <nickname>"
    exit 1
fi

CERT_FILE="$1"
NICKNAME="$2"

# Check if certutil is installed
if ! command -v certutil &> /dev/null
then
    echo "certutil could not be found. Please install libnss3-tools."
    echo "On Debian/Ubuntu, you can install it with: sudo apt-get install libnss3-tools"
    exit 1
fi

# Import the certificate
echo "Importing certificate..."
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "$NICKNAME" -i "$CERT_FILE"

# Verify the installation
echo "Verifying installation..."
if certutil -d sql:$HOME/.pki/nssdb -L | grep -q "$NICKNAME"; then
    echo "Certificate '$NICKNAME' installed successfully."
else
    echo "Certificate installation failed."
    exit 1
fi

echo "Please restart Chrome for the changes to take effect."

exit 0
