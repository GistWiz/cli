#!/bin/bash

# Load environment variables from .env
export $(grep -v '^#' .env | xargs)

# Get the subcommand (default to 'provision' if none provided)
SUBCOMMAND=${1:-provision}

# Define your commands
case $SUBCOMMAND in
  provision)
    echo "Running provision..."
    ssh root@${PROVISION_IP} -i $IDENTITY_FILE '$SHELL' < .provision/quicksearch/droplet/centos.pro
    ;;
  ssh)
    echo "Starting SSH session..."
    ssh root@${PROVISION_IP} -t -i ${IDENTITY_FILE}
    ;;
  *)
    echo "Unknown command: $SUBCOMMAND"
    echo "Usage: pro.sh [provision|ssh]"
    exit 1
    ;;
esac