#!/usr/bin/env bash
# Update and (re)start the Nexo worker. Run on the server from anywhere:
#   ~/nexo/repo/deploy/worker/deploy.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
env_file="${NEXO_ENV_FILE:-$(cd "$repo/.." && pwd)/worker.env}"

[[ -f "$env_file" ]] || { echo "Missing $env_file (copy deploy/worker/worker.env.example there and fill it in)"; exit 1; }

cd "$repo"
git pull --ff-only
NEXO_ENV_FILE="$env_file" docker compose -f deploy/worker/docker-compose.yml up -d --build
# Remove only this project's superseded images, never other apps' images.
docker image prune -f --filter label=project=nexo >/dev/null
docker compose -f deploy/worker/docker-compose.yml ps
echo "Logs: docker logs -f nexo-worker"
