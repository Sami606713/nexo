#!/usr/bin/env bash
# One-time: create ~/nexo/redis (password, TLS certificate, data folder). Safe to re-run: keeps what exists.
#   PUBLIC_IP=1.2.3.4 ~/nexo/repo/deploy/worker/setup-redis.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dir="${NEXO_DIR:-$(cd "$here/../../.." && pwd)}/redis"
ip="${PUBLIC_IP:?set PUBLIC_IP to the server public IP}"

mkdir -p "$dir/tls" "$dir/data"
chmod 700 "$dir"

if [[ ! -f "$dir/tls/redis.crt" ]]; then
  # Self-signed, valid for the server's IP. Vercel trusts exactly this certificate (REDIS_TLS_CA).
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
    -keyout "$dir/tls/redis.key" -out "$dir/tls/redis.crt" \
    -subj "/CN=nexo-redis" -addext "subjectAltName=IP:$ip" 2>/dev/null
  chmod 600 "$dir/tls/redis.key"
fi

if [[ ! -f "$dir/redis.conf" ]]; then
  cat >"$dir/redis.conf" <<EOF
# Plain port: only reachable inside Docker (not published).
port 6379
# TLS port: published for Vercel.
tls-port 6390
tls-cert-file /tls/redis.crt
tls-key-file /tls/redis.key
tls-auth-clients no
requirepass $(openssl rand -hex 32)
# Queued posts must never be dropped.
maxmemory 400mb
maxmemory-policy noeviction
appendonly yes
appendfsync everysec
dir /data
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
rename-command DEBUG ""
EOF
  chmod 600 "$dir/redis.conf"
fi

echo "Ready: $dir"
