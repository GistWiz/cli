#!/usr/bin/env sh

# Load environment variables from .env
export $(grep -v '^#' .env | xargs)

# Get the subcommand (default to 'provision' if none provided)
SUBCOMMAND=${1:-provision}

# Sub-Commands
case $SUBCOMMAND in
  provision)
    echo "provisioning..."
    ssh root@${PROVISION_IP} -i $IDENTITY_FILE '$SHELL' < ${PROVISION_FILE}
    ;;
  ssh)
    ssh root@${PROVISION_IP} -t -i ${IDENTITY_FILE}
    ;;
  *)
    echo "Unknown command: $SUBCOMMAND"
    echo "Usage: pro.sh [provision|ssh]"
    exit 1
    ;;
esac