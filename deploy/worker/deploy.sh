#!/usr/bin/env bash
# Update and (re)start the Nexo worker and its Redis. Run on the server from anywhere (GitHub Actions runs it on push):
#   ~/nexo/repo/deploy/worker/deploy.sh
set -euo pipefail
# Braces: bash reads the whole script before running it, so the git reset below can safely replace this file.
{
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
env_file="${NEXO_ENV_FILE:-$(cd "$repo/.." && pwd)/worker.env}"

[[ -f "$env_file" ]] || { echo "Missing $env_file (copy deploy/worker/worker.env.example there and fill it in)"; exit 1; }

cd "$repo"
# The server checkout only ever mirrors main: drop any local edits. Secrets and data live outside it (~/nexo).
git fetch --quiet origin main
git reset --quiet --hard origin/main
echo "At $(git log -1 --format='%h %s')"
NEXO_ENV_FILE="$env_file" docker compose -f deploy/worker/docker-compose.yml up -d --build
# Remove only this project's superseded images, never other apps' images.
docker image prune -f --filter label=project=nexo >/dev/null
docker compose -f deploy/worker/docker-compose.yml ps
echo "Logs: docker logs -f nexo-worker"
exit
}
