#!/bin/bash
set -e

# Configuration
APP_NAME="perplexity-researcher"
SRC_DIR="/home/sim/Obsi/Prods/01-pwf/agents/perplexity-researcher"
WORK_DIR="/tmp/${APP_NAME}_build"
CACHE_DIR="/tmp/${APP_NAME}_cache"
VERSION="1.0.18" # Could extract from package.json

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO] $1${NC}"
}

log_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root (sudo)."
        exit 1
    fi
}

cleanup() {
    if [ -d "$WORK_DIR" ]; then
        log_info "Cleaning up..."
        sudo rm -rf "$WORK_DIR"
    fi
}
trap cleanup EXIT

# 1. Preparation
check_sudo

# 2. Check if already installed with same version
if dpkg -l | grep -q "^ii  $APP_NAME "; then
    INSTALLED_VERSION=$(dpkg -l | grep "^ii  $APP_NAME " | awk '{print $3}')
    if [ "$INSTALLED_VERSION" = "$VERSION" ]; then
        log_info "$APP_NAME version $VERSION is already installed. Exiting."
        exit 0
    else
        log_info "$APP_NAME version $INSTALLED_VERSION is installed. Upgrading to $VERSION..."
    fi
fi

if [ ! -d "$SRC_DIR" ]; then
    log_error "Source directory not found: $SRC_DIR"
    exit 1
fi

log_info "Preparing build directory..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/opt/$APP_NAME"
mkdir -p "$WORK_DIR/usr/bin"
mkdir -p "$WORK_DIR/DEBIAN"

# 2. Build Project (Not needed for Docker-based install, we package source)
# We just need to ensure we have the source files

# 3. Copy Files
log_info "Copying source files..."
mkdir -p "$WORK_DIR/opt/$APP_NAME"

# Copy essential files
cp "$SRC_DIR/package.json" "$WORK_DIR/opt/$APP_NAME/"
cp "$SRC_DIR/package-lock.json" "$WORK_DIR/opt/$APP_NAME/" 2>/dev/null || true
cp "$SRC_DIR/docker-compose.yml" "$WORK_DIR/opt/$APP_NAME/"
cp "$SRC_DIR/Dockerfile" "$WORK_DIR/opt/$APP_NAME/"
cp "$SRC_DIR/tsconfig.json" "$WORK_DIR/opt/$APP_NAME/"
cp -r "$SRC_DIR/src" "$WORK_DIR/opt/$APP_NAME/"
cp -r "$SRC_DIR/browser" "$WORK_DIR/opt/$APP_NAME/"

# Create data directory
mkdir -p "$WORK_DIR/opt/$APP_NAME/data"
chmod 777 "$WORK_DIR/opt/$APP_NAME/data" # Ensure writable by Docker

# Install dependencies
log_info "Installing dependencies..."
cd "$WORK_DIR/opt/$APP_NAME"
npm install
cd -

# 4. Create Wrapper Script
log_info "Creating wrapper script..."
cat <<EOF > "$WORK_DIR/usr/bin/$APP_NAME"
#!/bin/bash
PROJECT_DIR="/opt/$APP_NAME"
ORIGINAL_PWD="\$PWD"
cd "\$PROJECT_DIR"

# Ensure docker compose is available
if ! docker compose version &> /dev/null; then
    echo "Error: docker compose is not available."
    exit 1
fi

# Ensure config directory exists
CONFIG_DIR="\$HOME/.config/perplexity-researcher"
if [ ! -d "\$CONFIG_DIR" ]; then
    mkdir -p "\$CONFIG_DIR"
fi

case "\$1" in
  start)
    echo "Starting Perplexity Researcher services..."
    docker compose up -d
    echo "Services started. API available at http://localhost:3000"
    ;;
  stop)
    echo "Stopping services..."
    docker compose down
    ;;
  restart)
    docker compose restart
    ;;
  status)
    docker compose ps
    ;;
  auth)
    echo "Starting local authentication..."
    echo "This will launch a browser where you can log in."
    # Use user-writable cache for ts-node
    export TS_NODE_CACHE_DIRECTORY="\$HOME/.cache/ts-node"
    mkdir -p "\$TS_NODE_CACHE_DIRECTORY"
    npm run auth
    echo "Authentication session saved to \$HOME/.config/perplexity-researcher/user-data"
    ;;
  login)
    # Deprecated or re-purposed for Docker interactive?
    # Original 'earlier commit' didn't have login command.
    # We can keep it or remove it. Let's keep it but warn.
    echo "Starting interactive Docker login..."
    # Check if server is running
    if docker compose ps | grep -q "perplexity-server.*Up"; then
       docker compose exec perplexity-server npm run login
    else
       docker compose run --rm perplexity-server npm run login
    fi
    ;;
  query)
    # Parse arguments
    shift # Remove 'query'
    
    QUERY=""
    SESSION=""
    NAME=""
    
    while [[ \$# -gt 0 ]]; do
      case \$1 in
        --session=*)
          SESSION="\${1#*=}"
          shift
          ;;
        --name=*)
          NAME="\${1#*=}"
          shift
          ;;
        *)
          if [ -z "\$QUERY" ]; then
            QUERY="\$1"
          else
            # Append if multiple words were passed without quotes (though unlikely if user quotes properly)
            QUERY="\$QUERY \$1"
          fi
          shift
          ;;
      esac
    done

    if [ -z "\$QUERY" ]; then
      echo "Usage: \$APP_NAME query \"Your question\" [--session=ID|new|latest] [--name=NAME]"
      exit 1
    fi
    
    # Check if server is running
    if docker compose ps | grep -q "perplexity-server.*Up"; then
       # Server is running, use curl
       # Use python3 to safely generate JSON
       JSON_DATA=\$(python3 -c "import json, sys; print(json.dumps({'query': sys.argv[1], 'session': sys.argv[2] if sys.argv[2] else None, 'name': sys.argv[3] if sys.argv[3] else None}))" "\$QUERY" "\$SESSION" "\$NAME")
       
       curl -X POST http://localhost:3000/query \
            -H "Content-Type: application/json" \
            -d "\$JSON_DATA"
    else
       # Server not running, run one-off container
       CMD="npm run query \"\$QUERY\""
       if [ -n "\$SESSION" ]; then CMD="\$CMD --session=\$SESSION"; fi
       if [ -n "\$NAME" ]; then CMD="\$CMD --name=\$NAME"; fi
       
       docker compose run --rm perplexity-server bash -c "\$CMD"
    fi
    ;;
  batch)
    if [ -z "\$2" ]; then
        echo "Usage: \$APP_NAME batch <file>"
        exit 1
    fi
    
    # Resolve file path relative to original PWD if not absolute
    if [[ "\$2" = /* ]]; then
        BATCH_FILE="\$2"
    else
        BATCH_FILE="\$ORIGINAL_PWD/\$2"
    fi
    
    if [ ! -f "\$BATCH_FILE" ]; then
        echo "Error: File not found: \$BATCH_FILE"
        exit 1
    fi

    # Check if server is running
    if docker compose ps | grep -q "perplexity-server.*Up"; then
       # Server is running. We need to copy the file into the container or mount it?
       # Mounting is tricky with 'exec'.
       # Easier to read content and pass it? But CLI expects a file path.
       # We can use 'docker cp' to copy file to /tmp inside container.
       
       CONTAINER_ID=\$(docker compose ps -q perplexity-server)
       docker cp "\$BATCH_FILE" "\$CONTAINER_ID:/tmp/batch.txt"
       
       # Execute batch command in container
       # Note: This will hang until Ctrl+C, which is what we want for VNC inspection
       docker compose exec perplexity-server npm run batch /tmp/batch.txt
    else
       # Run one-off container
       # Mount the file
       docker compose run --rm -v "\$BATCH_FILE:/tmp/batch.txt" perplexity-server npm run batch /tmp/batch.txt
    fi
    ;;
  logs)
    docker compose logs -f
    ;;
  update)
    echo "Rebuilding images..."
    docker compose build --no-cache
    ;;
  *)
    echo "Usage: \$APP_NAME {start|stop|restart|status|auth|login|query|batch|logs|update}"
    exit 1
    ;;
esac
EOF
chmod +x "$WORK_DIR/usr/bin/$APP_NAME"

# 5. Install Man Page
log_info "Installing man page..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$WORK_DIR/usr/share/man/man1"
cp "$SCRIPT_DIR/perplexity-researcher.1" "$WORK_DIR/usr/share/man/man1/"
gzip "$WORK_DIR/usr/share/man/man1/perplexity-researcher.1"

# 6. Create Control File
log_info "Creating DEBIAN/control..."
INSTALLED_SIZE=$(du -s "$WORK_DIR" | cut -f1)
cat <<EOF > "$WORK_DIR/DEBIAN/control"
Package: $APP_NAME
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Maintainer: Sim <sim@example.com>
Description: Perplexity AI automation tool (Docker-based)
 Installed-Size: $INSTALLED_SIZE
EOF

# 7. Build .deb
log_info "Building .deb package..."
dpkg-deb --build "$WORK_DIR" "${APP_NAME}.deb"

# 8. Install
log_info "Installing package..."
apt install -y "./${APP_NAME}.deb"

log_info "Installation complete! Run '$APP_NAME' to see usage."
