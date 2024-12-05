#!/usr/bin/env bash

WATCH_DIR="/var/log/gistwiz"
LOG_FILE="/var/log/redis-file-monitor.log"

# Add Redis CLI to PATH
export PATH=/opt/redis-stack/bin:$PATH

echo "$(date): Starting Redis file monitor in ${WATCH_DIR}..." | tee -a "$LOG_FILE"

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
done