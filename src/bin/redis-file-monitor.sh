#!/usr/bin/env sh

WATCH_DIR="${WATCH_DIR:-/var/log/gistwiz}"
DEFAULT_LOG_DIR="/tmp"
DEFAULT_LOG_FILE="${DEFAULT_LOG_DIR}/redis-file-monitor.log"
LOG_FILE="${LOG_FILE:-/var/log/redis-file-monitor.log}"
DRY_RUN=false
RUNNING=true

# Add Redis CLI to PATH
export PATH="/opt/redis-stack/bin:$PATH"

# Gracefully handle termination signals
trap 'echo "$(date): Redis file monitor stopped. Exiting..."; RUNNING=false; exit 0' SIGINT SIGTERM

# Parse CLI arguments
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    *)
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# Ensure the log file is writable or fallback to /tmp
if ! touch "$LOG_FILE" 2>/dev/null; then
  echo "$(date): Unable to write to $LOG_FILE. Attempting to use fallback log directory: $DEFAULT_LOG_DIR."
  mkdir -p "$DEFAULT_LOG_DIR" 2>/dev/null
  LOG_FILE="$DEFAULT_LOG_FILE"
fi

# Ensure the watch directory exists
if [[ ! -d "$WATCH_DIR" ]]; then
  echo "$(date): Watch directory $WATCH_DIR does not exist. Creating it..."
  if ! mkdir -p "$WATCH_DIR"; then
    echo "$(date): Failed to create watch directory $WATCH_DIR. Exiting." | tee -a "$LOG_FILE"
    exit 1
  fi
fi

# Check for duplicate instances
if pgrep -f "$(basename "$0")" | grep -v $$ >/dev/null; then
  echo "$(date): Another instance of the script is already running. Exiting." | tee -a "$LOG_FILE"
  exit 1
fi

# Detect OS and required tool
OS=$(uname -s)
case "$OS" in
  Linux)
    REQUIRED_TOOL="inotifywait"
    ;;
  Darwin)
    REQUIRED_TOOL="fswatch"
    ;;
  *)
    echo "$(date): Unsupported OS: $OS. This script supports Linux and macOS only." | tee -a "$LOG_FILE"
    exit 1
    ;;
esac

# Check for the required tool
if ! command -v "$REQUIRED_TOOL" &>/dev/null; then
  echo "$(date): Required tool '$REQUIRED_TOOL' is not installed." | tee -a "$LOG_FILE"
  case "$REQUIRED_TOOL" in
    inotifywait)
      echo "On Linux, install 'inotify-tools' via your package manager:" | tee -a "$LOG_FILE"
      echo "  Debian/Ubuntu: sudo apt-get install inotify-tools" | tee -a "$LOG_FILE"
      echo "  Red Hat/CentOS: sudo yum install inotify-tools" | tee -a "$LOG_FILE"
      ;;
    fswatch)
      echo "On macOS, install 'fswatch' via Homebrew:" | tee -a "$LOG_FILE"
      echo "  brew install fswatch" | tee -a "$LOG_FILE"
      ;;
  esac
  exit 1
fi

# Dry-run mode: Print configuration and exit
if [[ "$DRY_RUN" == "true" ]]; then
  echo "$(date): Dry run mode enabled. Configuration:"
  echo "  OS: $OS"
  echo "  Required tool: $REQUIRED_TOOL"
  echo "  Watch directory: $WATCH_DIR"
  echo "  Log file: $LOG_FILE"
  echo "  Redis CLI PATH: $(command -v redis-cli || echo 'Not found')"
  exit 0
fi

# Start monitoring
echo "$(date): Starting Redis file monitor in ${WATCH_DIR} using ${REQUIRED_TOOL}..." | tee -a "$LOG_FILE"

if [[ "$REQUIRED_TOOL" == "inotifywait" ]]; then
  inotifywait -m -e close_write --format '%w%f' "${WATCH_DIR}" | while read -r file; do
    if [[ "${file}" == *.redis ]]; then
      echo "$(date): Detected .redis file: ${file}" | tee -a "$LOG_FILE"
      while lsof "${file}" >/dev/null 2>&1; do
        sleep 1
      done
      echo "$(date): Processing file: ${file}" | tee -a "$LOG_FILE"
      if cat "${file}" | redis-cli; then
        echo "$(date): Successfully processed ${file}" | tee -a "$LOG_FILE"
      else
        echo "$(date): Failed to process ${file}" | tee -a "$LOG_FILE"
      fi
    fi
    [[ $RUNNING == false ]] && break
  done
elif [[ "$REQUIRED_TOOL" == "fswatch" ]]; then
  fswatch -0 "${WATCH_DIR}" | while read -d "" file; do
    if [[ "${file}" == *.redis ]]; then
      echo "$(date): Detected .redis file: ${file}" | tee -a "$LOG_FILE"
      while lsof "${file}" >/dev/null 2>&1; do
        sleep 1
      done
      echo "$(date): Processing file: ${file}" | tee -a "$LOG_FILE"
      if cat "${file}" | redis-cli; then
        echo "$(date): Successfully processed ${file}" | tee -a "$LOG_FILE"
      else
        echo "$(date): Failed to process ${file}" | tee -a "$LOG_FILE"
      fi
    fi
    [[ $RUNNING == false ]] && break
  done
fi