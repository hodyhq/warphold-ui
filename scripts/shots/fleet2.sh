#!/usr/bin/env bash
# (Re)starts the second, deliberately un-activated Fleet server the Activate
# wizard is shot against. Its last step really activates the server, so it is
# thrown away and rebuilt for every capture of that step - which is also why
# its setup token is a fixed string written before the server starts (the
# server reuses an existing token file) rather than a fresh random one that
# would invalidate the plan on every reset.
set -euo pipefail
ROOT=${1:?scratch root}
BIN=${2:?warphold binary}
PORT=${3:?api port}
TOKEN=${4:-demo-setup-token}

# The wizard's last step really creates its target at /srv/backups/hosted, so
# this server needs the same bound-in demo tree the seed runs under.
# seed.sh has already checked that /home and /srv exist and that unprivileged
# user namespaces work; this only ever runs after it.
if [ "${WARPHOLD_SHOTS_NS:-}" != 1 ]; then
  exec env WARPHOLD_SHOTS_NS=1 unshare -r -m bash "$0" "$@"
fi
mkdir -p "$ROOT/home" "$ROOT/mnt"
mount --bind "$ROOT/home" /home
mount --bind "$ROOT/mnt" /srv

if [ -f "$ROOT/fleet2.pid" ]; then
  kill "$(cat "$ROOT/fleet2.pid")" 2>/dev/null || true
  sleep 0.5
fi
rm -rf "$ROOT/fleet2"
mkdir -p "$ROOT/fleet2/fleet"
chmod 700 "$ROOT/fleet2/fleet"
printf '%s\n' "$TOKEN" >"$ROOT/fleet2/fleet/setup-token"
chmod 600 "$ROOT/fleet2/fleet/setup-token"

setsid "$BIN" --config-file="$ROOT/fleet2/repository.config" server start \
  --insecure --without-password --disable-csrf-token-checks \
  --address="http://127.0.0.1:$PORT" --disable-file-logging --log-level=error \
  </dev/null >"$ROOT/fleet2/server.log" 2>&1 &
echo $! >"$ROOT/fleet2.pid"
echo $! >>"$ROOT/pids"
i=0
until curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/v1/fleet/status" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 100 ] && { echo "fleet2 never came up" >&2; cat "$ROOT/fleet2/server.log" >&2; exit 1; }
  sleep 0.2
done
