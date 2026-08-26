#!/usr/bin/env bash
#
# One command. Handles everything that can go wrong on a laptop:
#
#   - kills anything still holding port 3000
#   - generates a session secret if you haven't set one
#   - restarts the server automatically if it ever exits
#   - starts the tunnel, reads the URL it prints, and restarts the server
#     with BASE_URL set to that URL so the mechanic links actually work
#   - restarts the tunnel if the network drops and the URL dies
#   - prints the live URL to a file you can check any time
#
# Usage:   ./run.sh              (local only, no tunnel)
#          ./run.sh --tunnel     (public URL as well)
#
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3000}"
URL_FILE=".tunnel-url"
WANT_TUNNEL=0
[[ "${1:-}" == "--tunnel" ]] && WANT_TUNNEL=1

# ---- password ----------------------------------------------------------
if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  if [[ -f .env ]]; then
    set -a; source .env; set +a
  fi
fi
if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "ADMIN_PASSWORD is not set."
  echo "Set it once and it will be remembered:"
  echo ""
  echo "    echo 'ADMIN_PASSWORD=your-password-here' > .env"
  echo ""
  exit 1
fi

# ---- session secret ----------------------------------------------------
if [[ -z "${SESSION_SECRET:-}" ]]; then
  if ! grep -q '^SESSION_SECRET=' .env 2>/dev/null; then
    echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
  fi
  set -a; source .env; set +a
fi

# ---- clear the port ----------------------------------------------------
free_port () {
  local pids
  pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "  Port $PORT was in use — stopping the old process."
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

cleanup () {
  echo ""
  echo "Shutting down."
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
  [[ -n "${WATCH_PID:-}"  ]] && kill "$WATCH_PID"  2>/dev/null || true
  rm -f "$URL_FILE"
  exit 0
}
trap cleanup INT TERM

# ---- server, with automatic restart ------------------------------------
start_server_loop () {
  while true; do
    BASE_URL="${BASE_URL:-http://localhost:$PORT}" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    SESSION_SECRET="$SESSION_SECRET" \
    node server.js
    code=$?
    [[ $code -eq 0 ]] && break
    echo ""
    echo "  Server stopped unexpectedly (exit $code). Restarting in 2s..."
    sleep 2
    free_port
  done
}

restart_server_with_base () {
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  sleep 1
  free_port
  BASE_URL="$1" start_server_loop &
  SERVER_PID=$!
}

echo ""
echo "  Wrenchmark"
echo "  ─────────────────────────────────────────"
free_port

if [[ $WANT_TUNNEL -eq 0 ]]; then
  echo "  Local only:  http://localhost:$PORT"
  echo "  Stop with Ctrl+C. Restarts itself if it crashes."
  echo ""
  start_server_loop &
  SERVER_PID=$!
  wait "$SERVER_PID"
  exit 0
fi

# ---- tunnel ------------------------------------------------------------
command -v cloudflared >/dev/null 2>&1 || { echo "  cloudflared not installed:  brew install cloudflared"; exit 1; }

start_server_loop &
SERVER_PID=$!
sleep 2

start_tunnel () {
  [[ -n "${TUNNEL_PID:-}" ]] && kill "$TUNNEL_PID" 2>/dev/null || true
  : > tunnel.log
  cloudflared tunnel --url "http://localhost:$PORT" >> tunnel.log 2>&1 &
  TUNNEL_PID=$!

  local url="" tries=0
  while [[ -z "$url" && $tries -lt 40 ]]; do
    sleep 1
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' tunnel.log | head -1 || true)"
    tries=$((tries+1))
  done
  if [[ -z "$url" ]]; then
    echo "  Tunnel did not come up. See tunnel.log."
    return 1
  fi
  echo "$url" > "$URL_FILE"
  echo ""
  echo "  ════════════════════════════════════════════════════════════"
  echo "   PUBLIC LINK   $url"
  echo "  ════════════════════════════════════════════════════════════"
  echo ""
  restart_server_with_base "$url"
  return 0
}

start_tunnel || exit 1

# ---- watchdog: bring the link back if the network drops ----------------
(
  fails=0
  while true; do
    sleep 20
    url="$(cat "$URL_FILE" 2>/dev/null || true)"
    [[ -z "$url" ]] && continue
    if curl -s --max-time 12 -o /dev/null "$url/health"; then
      fails=0
    else
      fails=$((fails+1))
      echo "  Link not responding ($fails/3)..."
      if [[ $fails -ge 3 ]]; then
        echo "  Rebuilding the tunnel — the URL will change."
        start_tunnel && fails=0
      fi
    fi
  done
) &
WATCH_PID=$!

echo "  Watching the link. It will rebuild itself if your network drops."
echo "  Current URL is always in:  $URL_FILE"
echo "  Stop everything with Ctrl+C."
echo ""
wait
