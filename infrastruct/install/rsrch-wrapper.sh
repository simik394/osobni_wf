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

# Read Config for Host and Ports
if [ -f "$CONFIG_FILE" ]; then
    # Simple grep/sed JSON parser for specific keys
    READ_PORT=$(grep -o '"port": *[0-9]*' "$CONFIG_FILE" | grep -o '[0-9]*')
    if [ ! -z "$READ_PORT" ]; then
        PORT="$READ_PORT"
    fi
    READ_HOST=$(grep -o '"host": *"[^"]*"' "$CONFIG_FILE" | head -n1 | cut -d'"' -f4)
    if [ ! -z "$READ_HOST" ]; then
        RSRCH_HOST="$READ_HOST"
    fi
    READ_VNC_PORT=$(grep -o '"vncPort": *[0-9]*' "$CONFIG_FILE" | head -n1 | grep -o '[0-9]*')
    if [ ! -z "$READ_VNC_PORT" ]; then
        RSRCH_VNC_PORT="$READ_VNC_PORT"
    fi
fi

export PORT

# Handle project directory
if [ ! -d "$PROJECT_DIR" ] || [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
    # Fallback to local workspace if we are in the repo
    WORKSPACE_DIR="/home/sim/Prods/01-pwf/agents/rsrch"
    if [ -d "$WORKSPACE_DIR" ]; then
        PROJECT_DIR="$WORKSPACE_DIR"
    fi
fi

cd "$PROJECT_DIR" || { echo "Error: Could not find project directory."; exit 1; }

check_running() {
    # Check if container is running via docker
    if docker ps --filter "name=rsrch" --filter "status=running" --format '{{.Names}}' | grep -q "rsrch"; then
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
    shift
    if [ -f "$PROJECT_DIR/dist/cli/main.js" ]; then
         node "$PROJECT_DIR/dist/cli/main.js" status "$@"
    else
         docker compose ps
    fi
    ;;
  logs)
    docker compose logs -f
    ;;
  auth)
    echo "Starting authentication..."
    docker compose up -d
    echo "Please use VNC to log in."
    docker exec -it rsrch npm run login
    ;;
  notebook)
    if ! check_running; then
        echo "Error: Server is not running. Start it with '$APP_NAME start'"
        exit 1
    fi
    shift
    # Use docker exec directly to avoid compose state issues
    # Use docker exec directly to avoid compose state issues
    docker exec -it rsrch npm run notebook -- "$@"
    ;;
  query)
    shift
    if ! check_running; then
         # Run one-off via compose if not running
         docker compose run --rm -e PORT=$PORT rsrch npm run query "$@"
    else
         # Use exec
         docker exec -it rsrch npm run query "$@"
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
         docker compose run --rm -v "$BATCH_FILE:/tmp/batch.txt" rsrch npm run batch /tmp/batch.txt
    else
         docker cp "$BATCH_FILE" "rsrch:/tmp/batch.txt"
         docker exec -it rsrch npm run batch /tmp/batch.txt
    fi
    ;;
  build)
    echo "Rebuilding Docker images..."
    docker compose build
    ;;
  view)
    echo "Launching VNC Viewer..."
    if command -v vncviewer >/dev/null 2>&1; then
        vncviewer localhost:5900 &
    elif command -v xtightvncviewer >/dev/null 2>&1; then
        xtightvncviewer localhost:5900 &
    elif command -v remmina >/dev/null 2>&1; then
        remmina -c vnc://localhost:5900 &
    else
        echo "Error: No VNC viewer found. Please install one (e.g., 'sudo apt install xtightvncviewer') or connect manually to localhost:5900."
    fi
    ;;
  vnc)
    echo "📡 [CLI Path: $(which rsrch)]"
    HOST="${RSRCH_HOST:-halvarm}"
    
    # Try configured port first, fallback to common ports
    PORTS_TO_TRY=()
    if [ ! -z "$RSRCH_VNC_PORT" ]; then
        PORTS_TO_TRY+=("$RSRCH_VNC_PORT")
    fi
    PORTS_TO_TRY+=(5900 5901 5902 5955)

    PORT=""
    for p in "${PORTS_TO_TRY[@]}"; do
        echo "📡 Probing VNC connection on $HOST:$p..."
        if nc -z -w 2 "$HOST" "$p" >/dev/null 2>&1; then
             PORT="$p"
             break
        fi
    done

    if [ -z "$PORT" ]; then
         echo "❌ Error: Could not connect to VNC on $HOST on tried ports (${PORTS_TO_TRY[*]})."
         echo "Diagnose: Try checking if the browser Nomad job is running:"
         echo "          ssh $HOST 'nomad job status rsrch-browser'"
         echo "          Or check ports manually: 'nc -v -z $HOST 5900'"
         exit 1
    fi

    echo "✅ Connected to VNC server at $HOST:$PORT"

    # List of common viewers to try
    VIEWER_CMD=""
    if command -v vncviewer >/dev/null 2>&1; then
        VIEWER_CMD="vncviewer"
    elif command -v xtightvncviewer >/dev/null 2>&1; then
        VIEWER_CMD="xtightvncviewer"
    elif command -v remmina >/dev/null 2>&1; then
        VIEWER_CMD="remmina -c vnc://"
    fi

    if [ -z "$VIEWER_CMD" ]; then
        echo "Error: No VNC viewer found on your system. Please connect manually to $HOST:$PORT."
        exit 1
    fi

    echo "🚀 Launching $VIEWER_CMD $HOST:$PORT..."
    $VIEWER_CMD "$HOST":$PORT &
    echo "✅ Viewer launched in background. Happy researching!"
    ;;

  *)
    echo "Usage: $APP_NAME {start|stop|restart|status|logs|auth|notebook|query|batch|build|view}"
    echo "  notebook create <Title>"
    echo "  notebook add-source <URL> [--notebook <Title>]"
    echo "  notebook audio [--notebook <Title>]"
    exit 1
    ;;
esac
