#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@192.168.1.141}"
REMOTE_DIR="${REMOTE_DIR:-/opt/syncdrop}"
REMOTE_BRANCH="${REMOTE_BRANCH:-Release}"

echo "Deploying ${REMOTE_BRANCH} to ${REMOTE_HOST}:${REMOTE_DIR}"

ssh "${REMOTE_HOST}" "set -euo pipefail
cd '${REMOTE_DIR}'
git fetch origin '${REMOTE_BRANCH}'
git reset --hard 'origin/${REMOTE_BRANCH}'
bash scripts/deploy-on-server.sh
"

echo "Done: https://store.cipcloud.net/syncdrop"
