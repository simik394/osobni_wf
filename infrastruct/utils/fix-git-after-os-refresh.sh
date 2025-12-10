#!/bin/bash

OLD_HOME=/home/simik

echo "Kopíruji SSH klíče z $OLD_HOME..."
# SSH klíče
cp -r $OLD_HOME/.ssh ~/

echo "Kopíruji Git config..."
# Git config
cp $OLD_HOME/.gitconfig ~/

echo "Kopíruji GPG (pokud existuje)..."
# GPG (pokud používáš)
if [ -d "$OLD_HOME/.gnupg" ]; then
    cp -r $OLD_HOME/.gnupg ~/
fi

echo "Nastavuji oprávnění pro SSH adresář..."
# Oprava práv pro SSH adresář
chmod 700 ~/.ssh
chmod 600 ~/.ssh/ed181124-1 2>/dev/null
chmod 644 ~/.ssh/ed181124-1.pub 2>/dev/null
chmod 600 ~/.ssh/ssh-key-2023-03-31.key 2>/dev/null
chmod 600 ~/.ssh/authorized_keys 2>/dev/null
chmod 644 ~/.ssh/known_hosts 2>/dev/null
chmod 644 ~/.ssh/config 2>/dev/null

echo "Nastavuji oprávnění pro GPG (pokud existuje)..."
# Oprava práv pro GPG (pokud kopíruješ)
if [ -d ~/.gnupg ]; then
    chmod 700 ~/.gnupg
    find ~/.gnupg -type f -exec chmod 600 {} \;
    find ~/.gnupg -type d -exec chmod 700 {} \;
fi

echo ""
echo "Hotovo! Nyní zkus:"
echo "  ssh -T git@github.com"