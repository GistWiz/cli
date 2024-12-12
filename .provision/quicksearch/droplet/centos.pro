#!/usr/bin/env sh

################################################################################
# Provisioning Script
#
# - CentOS
# - Redis Stack (Binary Installation)
# - Redis File Monitor Service
################################################################################

# Strict mode
set -e
set -o errexit
set -o errtrace
set -o nounset

################################################################################
# Constants
################################################################################

declare PREFIX=/opt
declare REDIS_BINARY_URL="https://packages.redis.io/redis-stack/redis-stack-server-7.4.0-v1.rhel9.x86_64.tar.gz"
declare REDIS_INSTALL_DIR="/opt/redis-stack"
declare GISTWIZ_REPO="https://github.com/gistwiz/cli.git"
declare BUN_INSTALL_URL="https://bun.sh/install"

################################################################################
# Cleanup Functions
################################################################################

cleanup_redis_stack() {
  echo "Cleaning up Redis Stack..."
  systemctl stop redis-stack || true
  systemctl disable redis-stack || true
  rm -rf /etc/systemd/system/redis-stack.service
  rm -rf "${REDIS_INSTALL_DIR}"
}

cleanup_redis_file_monitor() {
  echo "Cleaning up Redis File Monitor..."
  systemctl stop redis-file-monitor || true
  systemctl disable redis-file-monitor || true
  rm -rf /etc/systemd/system/redis-file-monitor.service
  rm -rf /usr/local/bin/redis-file-monitor.sh
}

cleanup_gistwiz() {
  echo "Cleaning up Gistwiz..."
  systemctl stop gistwiz || true
  systemctl disable gistwiz || true
  rm -rf /etc/systemd/system/gistwiz.service
  rm -rf "${PREFIX}/gistwiz"
  rm -rf /var/log/gistwiz
}

cleanup_bun() {
  echo "Cleaning up Bun..."
  rm -rf ~/.bun
  sed -i '/bun/d' ~/.bashrc || true
}

################################################################################
# Installation Functions
################################################################################

install_dependencies() {
  echo "Installing dependencies..."
  dnf install -y unzip git vim || true
  install_inotify_tools
}

install_inotify_tools() {
  if command -v inotifywait >/dev/null 2>&1; then
    echo "inotify-tools already installed. Skipping."
    return
  fi

  echo "Installing inotify-tools from source..."
  dnf groupinstall -y "Development Tools" || true
  dnf install -y gcc make autoconf automake || true

  curl -LO https://github.com/inotify-tools/inotify-tools/archive/refs/tags/3.20.11.0.tar.gz
  tar -xzf 3.20.11.0.tar.gz
  cd inotify-tools-3.20.11.0
  ./autogen.sh
  ./configure
  make
  make install
  cd ..
  rm -rf inotify-tools-3.20.11.0 3.20.11.0.tar.gz
}

install_redis_stack() {
  echo "Installing Redis Stack Server..."
  curl -o /usr/local/src/redis-stack-server.tar.gz -L "${REDIS_BINARY_URL}"
  tar -xzf /usr/local/src/redis-stack-server.tar.gz -C /usr/local/src
  mv "/usr/local/src/redis-stack-server-7.4.0-v1" "${REDIS_INSTALL_DIR}"

  # Add Redis Stack to PATH
  cat >/etc/profile.d/redis-stack.sh <<EOF
export PATH=${REDIS_INSTALL_DIR}/bin:\$PATH
EOF

  chmod +x /etc/profile.d/redis-stack.sh
  export PATH=${REDIS_INSTALL_DIR}/bin:$PATH
  source /etc/profile.d/redis-stack.sh

  # Create systemd service for Redis Stack
  cat >/etc/systemd/system/redis-stack.service <<EOF
[Unit]
Description=Redis Stack Server
After=network.target

[Service]
ExecStart=${REDIS_INSTALL_DIR}/bin/redis-stack-server /opt/redis-stack/etc/redis.conf
WorkingDirectory=${REDIS_INSTALL_DIR}
User=root
Group=root
Restart=always

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now redis-stack

  # Configure Redis persistence
  mkdir -p /var/lib/redis/etc
  mkdir -p /var/lib/redis/data

  cat > /opt/redis-stack/etc/redis.conf <<EOF
save 900 1
rdbcompression yes
appendonly yes
appendfsync always
dir /var/lib/redis
EOF

  systemctl restart redis-stack
}

setup_redis_file_monitor() {
  echo "Setting up Redis File Monitor..."

  # Create the watcher script
  cat >/usr/local/bin/redis-file-monitor.sh <<'EOF'
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
EOF

  # Make the watcher script executable
  chmod +x /usr/local/bin/redis-file-monitor.sh

  # Create the systemd service
  cat >/etc/systemd/system/redis-file-monitor.service <<EOF
[Unit]
Description=Redis File Monitor Service
After=network.target

[Service]
ExecStart=/usr/local/bin/redis-file-monitor.sh
Restart=always
User=root
WorkingDirectory=/var/log/gistwiz
Environment="PATH=/opt/redis-stack/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

[Install]
WantedBy=multi-user.target
EOF

  # Reload systemd and start the service
  systemctl daemon-reload
  systemctl enable --now redis-file-monitor
}

install_bun() {
  echo "Installing Bun..."
  curl -fsSL "${BUN_INSTALL_URL}" | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >>~/.bashrc
}

setup_gistwiz_environment() {
  echo "Setting up Gistwiz Environment Variables..."
  cat >/etc/profile.d/sh.local <<EOF
QUEUE_NAME_GISTS=gists
EOF
}

setup_gistwiz_server() {
  echo "Setting up Gistwiz..."
  mkdir -p /var/log/gistwiz

  echo "Cloning GistWiz repository..."
  git clone "$GISTWIZ_REPO" "$PREFIX/gistwiz"

  cd "$PREFIX/gistwiz"
  echo "Installing GistWiz dependencies..."
  bun install

  echo "Creating GistWiz systemd service..."
  cat >/etc/systemd/system/gistwiz.service <<EOF
[Unit]
Description=GistWiz Server
After=network.target

[Service]
ExecStart=/bin/bash -c '/root/.bun/bin/bun run src/cli.ts serve'
WorkingDirectory=$PREFIX/gistwiz
Restart=always
User=root
Environment=PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now gistwiz
}

setup_gistwiz_worker() {
  echo "Creating GistWiz Worker systemd service..."
  cat >/etc/systemd/system/gistwiz-worker.service <<EOF
[Unit]
Description=Gist Worker
After=network.target

[Service]
ExecStart=/bin/bash -c '/root/.bun/bin/bun run src/cli.ts worker'
WorkingDirectory=$PREFIX/gistwiz
Restart=always
User=root
Environment=PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now gistwiz-worker
}


################################################################################
# Main
################################################################################

echo "Starting cleanup..."
cleanup_redis_stack
cleanup_redis_file_monitor
cleanup_gistwiz
cleanup_bun

echo "Application Setup..."
install_dependencies
install_redis_stack
install_bun
setup_gistwiz_environment
setup_gistwiz_server
setup_gistwiz_worker
setup_redis_file_monitor

echo "Provisioning completed successfully."