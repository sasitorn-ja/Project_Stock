#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
export SYNCDROP_ENV_FILE="${SYNCDROP_ENV_FILE:-/opt/syncdrop/.env.production}"
export NEXT_PUBLIC_BASE_PATH="${NEXT_PUBLIC_BASE_PATH:-/syncdrop}"

test -r "$SYNCDROP_ENV_FILE" || {
  echo "Production env file is not readable: $SYNCDROP_ENV_FILE" >&2
  exit 1
}

# Reuse the running installation's Compose project so its data volume is kept
# when deploying from the Actions checkout instead of /opt/syncdrop.
project_name="${COMPOSE_PROJECT_NAME:-syncdrop}"
if docker container inspect syncdrop >/dev/null 2>&1; then
  existing_project="$(docker inspect syncdrop --format '{{index .Config.Labels "com.docker.compose.project"}}')"
  test -n "$existing_project" && test "$existing_project" != '<no value>' || {
    echo "Existing syncdrop container is not managed by Docker Compose" >&2
    exit 1
  }
  project_name="$existing_project"
fi

compose=(docker compose --env-file "$SYNCDROP_ENV_FILE" -p "$project_name" -f docker-compose.yml)
"${compose[@]}" config --quiet
# Finish the image build before replacing the running container.
"${compose[@]}" build syncdrop
"${compose[@]}" up -d --no-build --force-recreate syncdrop

for attempt in {1..30}; do
  if docker exec -e "SYNCDROP_HEALTH_PATH=${NEXT_PUBLIC_BASE_PATH%/}/login" syncdrop node -e '
    fetch(`http://127.0.0.1:3000${process.env.SYNCDROP_HEALTH_PATH}`, {
      redirect: "manual", signal: AbortSignal.timeout(5000)
    }).then(response => {
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    }).catch(error => { console.error(error.message); process.exit(1); });
  '; then
    echo "Deployment verified: https://store.cipcloud.net/syncdrop/"
    exit 0
  fi
  echo "Waiting for SyncDrop ($attempt/30)"
  sleep 2
done

echo "SyncDrop did not pass the startup check" >&2
"${compose[@]}" ps
"${compose[@]}" logs --tail=80 syncdrop >&2
exit 1
