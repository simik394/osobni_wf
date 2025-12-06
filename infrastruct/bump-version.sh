#!/bin/bash
# Bump version in package.json
# Usage: ./bump-version.sh [major|minor|patch]

set -e

PACKAGE_JSON="$1"
BUMP_TYPE="${2:-patch}"  # Default to patch if not specified

if [ -z "$PACKAGE_JSON" ] || [ ! -f "$PACKAGE_JSON" ]; then
    echo "Usage: $0 <path/to/package.json> [major|minor|patch]"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' "$PACKAGE_JSON" | grep -o '[0-9.]*')

if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not find version in $PACKAGE_JSON"
    exit 1
fi

# Split version into components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump version based on type
case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
    *)
        echo "Error: Invalid bump type '$BUMP_TYPE'. Use major, minor, or patch."
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# Update package.json
sed -i "s/\"version\": *\"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"

echo "Bumped version: $CURRENT_VERSION → $NEW_VERSION"
echo "$NEW_VERSION"
