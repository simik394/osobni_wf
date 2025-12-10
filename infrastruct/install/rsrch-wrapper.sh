#!/bin/bash
APP_NAME="rsrch"
PROJECT_DIR="/opt/$APP_NAME"
CONFIG_DIR="$HOME/.config/$APP_NAME"
CONFIG_FILE="$CONFIG_DIR/config.json"

# Ensure config & config dir exists
if [ ! -d "$CONFIG_DIR" ]; then
    mkdir -p "$CONFIG_DIR"
fi

# If config file doesn't exist in User Config, copy from /opt if available
if [ ! -f "$CONFIG_FILE" ] && [ -f "$PROJECT_DIR/config.json" ]; then
    cp "$PROJECT_DIR/config.json" "$CONFIG_FILE"
fi

# Default Port
PORT=3000

# Read Config for Port
if [ -f "$CONFIG_FILE" ]; then
    # Simple grep/sed json parser for specific key "port"
    READ_PORT=$(grep -o '"port": *[0-9]*' "$CONFIG_FILE" | grep -o '[0-9]*')
    if [ ! -z "$READ_PORT" ]; then
        PORT="$READ_PORT"
    fi
fi

export PORT

cd "$PROJECT_DIR"

check_running() {
    # Check if container is running via docker
    if docker ps --filter "name=perplexity-server" --filter "status=running" --format '{{.Names}}' | grep -q "perplexity-server"; then
        return 0
    fi
    return 1
}

wait_for_server() {
    echo "Waiting for server to be ready..."
    for i in {1..30}; do
        if curl -s "http://localhost:$PORT/health" > /dev/null; then
            return 0
        fi
        sleep 1
    done
    echo "Server timed out."
    return 1
}

case "$1" in
  start|serve)
    echo "Starting $APP_NAME on port $PORT..."
    # --remove-orphans to cleanup old containers from source dir runs
    docker compose up -d --remove-orphans
    if wait_for_server; then
        echo "Service running. API at http://localhost:$PORT"
    else
        echo "Service started but health check failed."
    fi
    ;;
  stop)
    echo "Stopping and cleaning up..."
    docker compose down --remove-orphans
    echo "Stopped."
    ;;
  restart)
    docker compose restart
    ;;
  status)
    docker compose ps
    ;;
  logs)
    docker compose logs -f
    ;;
  auth)
    echo "Starting authentication..."
    docker compose up -d
    echo "Please use VNC to log in."
    docker exec -it perplexity-server npm run login
    ;;
  notebook)
    shift
    # Check for headed/native flag
    USE_NATIVE=0
    for arg in "$@"; do
        if [ "$arg" == "--headed" ] || [ "$arg" == "--native" ]; then
            USE_NATIVE=1
            break
        fi
    done

    if [ "$USE_NATIVE" -eq 1 ]; then
        echo "Headed/Native mode detected. Switching to host execution..."
        cd "$PROJECT_DIR"
        # Ensure we are not root if possible? But wrapper might be run as user.
        # If run with sudo, this runs as root. Users typically run 'rsrch ...' as user.
        npx ts-node src/index.ts notebook "$@"
    else
        if ! check_running; then
            echo "Error: Server is not running. Start it with '$APP_NAME start'"
            exit 1
        fi
        docker exec -it perplexity-server npx ts-node src/index.ts notebook "$@"
    fi
    ;;
  gemini)
    shift
    # Check for headed/native flag
    USE_NATIVE=0
    for arg in "$@"; do
        if [ "$arg" == "--headed" ] || [ "$arg" == "--native" ]; then
            USE_NATIVE=1
            break
        fi
    done

    if [ "$USE_NATIVE" -eq 1 ]; then
        echo "Headed/Native mode detected. Switching to host execution..."
        cd "$PROJECT_DIR"
        npx ts-node src/index.ts gemini "$@"
    else
        if ! check_running; then
            echo "Error: Server is not running. Start it with '$APP_NAME start'"
            exit 1
        fi
        docker exec -it perplexity-server npx ts-node src/index.ts gemini "$@"
    fi
    ;;
  query)
    shift
    if ! check_running; then
         # Run one-off via compose if not running
         docker compose run --rm -e PORT=$PORT perplexity-server npx ts-node src/index.ts query "$@"
    else
         # Use exec
         docker exec -it perplexity-server npx ts-node src/index.ts query "$@"
    fi
    ;;
  batch)
    shift
    BATCH_FILE="$1"
    if [ -z "$BATCH_FILE" ]; then echo "Usage: batch <file>"; exit 1; fi
    
    if [[ "$BATCH_FILE" != /* ]]; then BATCH_FILE="$PWD/$BATCH_FILE"; fi
    
    if [ ! -f "$BATCH_FILE" ]; then echo "File not found: $BATCH_FILE"; exit 1; fi

    if ! check_running; then
         echo "Starting temporary container for batch..."
         docker compose run --rm -v "$BATCH_FILE:/tmp/batch.txt" perplexity-server npx ts-node src/index.ts batch /tmp/batch.txt
    else
         docker cp "$BATCH_FILE" "perplexity-server:/tmp/batch.txt"
         docker exec -it perplexity-server npx ts-node src/index.ts batch /tmp/batch.txt
    fi
    ;;
  build)
    echo "Rebuilding Docker images..."
    docker compose build
    ;;
  view)
    echo "Launching VNC Viewer..."
    if command -v vncviewer > /dev/null 2>&1; then
        vncviewer localhost:5900 &
    elif command -v xtightvncviewer > /dev/null 2>&1; then
        xtightvncviewer localhost:5900 &
    elif command -v remmina > /dev/null 2>&1; then
        remmina -c vnc://localhost:5900 &
    else
        echo "Error: No VNC viewer found. Please install one (e.g., 'sudo apt install xtightvncviewer') or connect manually to localhost:5900."
    fi
    ;;
  *)
    echo "Usage: $APP_NAME {start|stop|restart|status|logs|auth|notebook|gemini|query|batch|build|view}"
    echo ""
    echo "Commands:"
    echo "  start/serve           - Start the server"
    echo "  stop                  - Stop the server"
    echo "  restart               - Restart the server"
    echo "  status                - Show server status"
    echo "  logs                  - Show server logs"
    echo "  auth                  - Authenticate with services"
    echo "  notebook <cmd> ...    - NotebookLM commands"
    echo "  gemini <cmd> ...      - Gemini (research, deep-research, chat, sessions...)"
    echo "  query <question>      - Query Perplexity"
    echo "  batch <file>          - Batch queries"
    echo "  build                 - Rebuild Docker images"
    echo "  view                  - Launch VNC viewer"
    exit 1
    ;;
esac
