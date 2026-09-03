#!/usr/bin/env bash
# Seeds the throwaway servers the screenshots are taken against.
#
# Everything here is fake and generic on purpose: three invented device names,
# invented groups, invented paths. No real host, address or account of anyone's
# fleet may reach a capture, and the only way to guarantee that is for the
# seed to be the only data present - so this refuses to run against a state
# directory that already has something in it.
#
# Leaves $ROOT/vars.env behind with the ids the plan needs.
set -euo pipefail

ROOT=${1:?scratch root}
BIN=${2:?warphold binary}

FLEET_API=${FLEET_API_PORT:-51611}
FLEET2_API=${FLEET2_API_PORT:-51612}
SOLO_API=${SOLO_API_PORT:-51613}

EMAIL=admin@example.com
PASSWORD=testpassword1
PASSPHRASE=testpassphrase

for d in fleet fleet2 solo; do
  if [ -n "$(ls -A "$ROOT/$d" 2>/dev/null || true)" ]; then
    echo "seed: $ROOT/$d already holds state - refusing to seed on top of it" >&2
    exit 1
  fi
done

SETUP_TOKEN=${SETUP_TOKEN:-demo-setup-token}

mkdir -p "$ROOT"/{fleet,solo,hosted} "$ROOT/home/user/Documents" "$ROOT/home/user/Pictures"
: >"$ROOT/pids"

# Demo tree for the single-machine screens. Generic names, plain text.
for n in notes budget travel-plan reading-list; do
  printf 'demo document: %s\n%s\n' "$n" "$(head -c 400 /dev/zero | tr '\0' 'x')" >"$ROOT/home/user/Documents/$n.txt"
done
for n in trip sunset garden; do
  head -c 20000 /dev/urandom >"$ROOT/home/user/Pictures/$n.jpg"
done

wh() { "$BIN" --config-file="$1/repository.config" "${@:2}"; }

start() { # start <dir> <port> [extra...]
  local dir=$1 port=$2
  shift 2
  setsid "$BIN" --config-file="$dir/repository.config" server start --insecure --without-password --disable-csrf-token-checks \
    --address="http://127.0.0.1:$port" --disable-file-logging --log-level=error "$@" \
    <"/dev/null" >"$dir/server.log" 2>&1 &
  echo $! >>"$ROOT/pids"
  local i=0
  until curl -fsS -o /dev/null "http://127.0.0.1:$port/api/v1/repo/status" 2>/dev/null; do
    i=$((i + 1))
    [ "$i" -gt 100 ] && { echo "seed: server on $port never came up" >&2; cat "$dir/server.log" >&2; exit 1; }
    sleep 0.2
  done
}

# ---------------------------------------------------------------- fleet server
wh "$ROOT/fleet" fleet activate --email "$EMAIL" --admin-password "$PASSWORD" --passphrase "$PASSPHRASE" >/dev/null
start "$ROOT/fleet" "$FLEET_API"

JAR=$ROOT/fleet/cookies
API=http://127.0.0.1:$FLEET_API/api/v1/fleet
curl -fsS -c "$JAR" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$API/session" >/dev/null
CSRF=$(awk '$6=="wh_csrf"{print $7}' "$JAR")

adm() { # adm <method> <path> [body]
  local args=(-fsS -b "$JAR" -X "$1" -H "X-WarpHold-CSRF: $CSRF" -H 'content-type: application/json')
  if [ $# -ge 3 ]; then args+=(-d "$3"); fi
  curl "${args[@]}" "$API$2"
}
id_of() { sed -n 's/.*"id":\([0-9]*\).*/\1/p'; }
field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }

T_DISK=$(adm POST /targets "{\"name\":\"Family disk\",\"kind\":\"filesystem\",\"path\":\"$ROOT/hosted\"}" | id_of)
# Two disks rather than a b2 target: a b2 target is verified against the real
# B2 API at creation time, and the seed must never need a cloud account.
adm POST /targets "{\"name\":\"Offsite disk\",\"kind\":\"filesystem\",\"path\":\"$ROOT/offsite\"}" >/dev/null

TPL_HOME=$(adm POST /templates '{"name":"Home folders","sources":["/home/user"],"policy":{"retention":{"keepDaily":30,"keepWeekly":8}}}' | id_of)
TPL_MEDIA=$(adm POST /templates '{"name":"Media library","sources":["/srv/media"],"policy":{"retention":{"keepDaily":7,"keepMonthly":12}}}' | id_of)

G_LAPTOPS=$(adm POST /groups "{\"name\":\"Laptops\",\"target_id\":$T_DISK,\"template_id\":$TPL_HOME}" | id_of)
G_MEDIA=$(adm POST /groups "{\"name\":\"Media\",\"target_id\":$T_DISK,\"template_id\":$TPL_MEDIA}" | id_of)

enroll() { # enroll <group> <hostname> <os> -> "<agent id> <bearer>"
  local tok body
  tok=$(adm POST /tokens "{\"group_id\":$1,\"ttl_seconds\":3600,\"max_uses\":1}" | field token)
  body=$(curl -fsS -H 'content-type: application/json' \
    -d "{\"Token\":\"$tok\",\"Hostname\":\"$2\",\"OS\":\"$3\",\"Arch\":\"amd64\",\"Version\":\"0.1.0\"}" \
    "$API/enroll")
  echo "$(echo "$body" | field agent_id) $(echo "$body" | field bearer)"
}

report() { # report <bearer> <days ago> <status> <source> [stderr]
  local at fin
  at=$(date -u -d "-$2 days -35 minutes" +%Y-%m-%dT%H:%M:%SZ)
  fin=$(date -u -d "-$2 days" +%Y-%m-%dT%H:%M:%SZ)
  curl -fsS -o /dev/null -H "Authorization: Bearer $1" -H 'content-type: application/json' \
    -d "{\"task_id\":\"t-$2-$RANDOM\",\"kind\":\"snapshot\",\"source\":\"$4\",\"started_at\":\"$at\",\"finished_at\":\"$fin\",\"status\":\"$3\",\"bytes\":$((3000000000 + RANDOM * 40000)),\"files\":$((12000 + RANDOM)),\"stderr\":\"${5:-}\"}" \
    "$API/agent/report"
}

read -r AG_LAPTOP AG_LAPTOP_TOK < <(enroll "$G_LAPTOPS" laptop-1 linux)
read -r AG_NUC AG_NUC_TOK < <(enroll "$G_MEDIA" media-nuc linux)
read -r AG_DESK _ < <(enroll "$G_LAPTOPS" office-desktop linux)

# laptop-1: green, a full 30-day strip, and enough runs inside 24 h for the
# Overview timeline to have shape.
for d in $(seq 29 -1 1); do report "$AG_LAPTOP_TOK" "$d" ok /home/user; done
for h in 0 0 0; do report "$AG_LAPTOP_TOK" "$h" ok /home/user; done

# media-nuc: ran fine for weeks, then started failing - the red path.
for d in $(seq 29 -1 1); do report "$AG_NUC_TOK" "$d" ok /srv/media; done
report "$AG_NUC_TOK" 0 error /srv/media \
  "error uploading /srv/media/photos/2019: open /srv/media/photos/2019: input/output error"

# office-desktop: enrolled, never ran. No reports at all, by design.

# One live token so the group's Add-device and Tokens dialogs have something.
adm POST /tokens "{\"group_id\":$G_LAPTOPS,\"ttl_seconds\":86400,\"max_uses\":1}" >/dev/null
adm PUT /settings '{"fleet_name":"Home fleet"}' >/dev/null || true

# ------------------------------------------------- second, unactivated server
bash "$(dirname "$0")/fleet2.sh" "$ROOT" "$BIN" "$FLEET2_API" "$SETUP_TOKEN"

# ------------------------------------------------------------- solo server
# The overridden host and user are what keep the real machine's name out of
# every single-machine screen.
wh "$ROOT/solo" repository create filesystem --path="$ROOT/solo/repo" \
  --password=testrepopassword --override-hostname=laptop-1 --override-username=user \
  --no-check-for-updates >/dev/null

# A snapshot records the absolute path it was taken from, and that path is on
# screen on four of the single-machine shots. The snapshots *and* the server
# that serves them run inside a private mount namespace with the demo tree
# bound onto /home, so they read /home/user/Documents rather than a scratch
# directory - and "snapshot now" in the UI still works, because the server
# sees the same paths. Nothing is mounted for any other process and nothing
# needs root. Where user namespaces are off, the scratch path is used as-is:
# the shots are still generic, just uglier.
SOLO='set -e
if [ "$4" = 1 ]; then mount --bind "$1/home" /home; fi
for i in 1 2 3; do
  echo "revision $i" >>"$3/Documents/notes.txt"
  "$2" --config-file="$1/solo/repository.config" snapshot create "$3/Documents" --password=testrepopassword >/dev/null 2>&1
done
"$2" --config-file="$1/solo/repository.config" snapshot create "$3/Pictures" --password=testrepopassword >/dev/null 2>&1
"$2" --config-file="$1/solo/repository.config" snapshot list "$3/Documents" --password=testrepopassword --json >"$1/solo/snapshots.json"
exec "$2" --config-file="$1/solo/repository.config" server start --insecure --without-password \
  --disable-csrf-token-checks --address="http://127.0.0.1:$5" --disable-file-logging --log-level=error \
  --password=testrepopassword'

if unshare -r -m true 2>/dev/null; then
  SOLO_BASE=/home/user
  setsid unshare -r -m bash -c "$SOLO" _ "$ROOT" "$BIN" "$SOLO_BASE" 1 "$SOLO_API" \
    </dev/null >"$ROOT/solo/server.log" 2>&1 &
else
  SOLO_BASE=$ROOT/home/user
  setsid bash -c "$SOLO" _ "$ROOT" "$BIN" "$SOLO_BASE" 0 "$SOLO_API" \
    </dev/null >"$ROOT/solo/server.log" 2>&1 &
fi
echo $! >>"$ROOT/pids"
i=0
until curl -fsS -o /dev/null "http://127.0.0.1:$SOLO_API/api/v1/repo/status" 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 200 ] && { echo "seed: solo server never came up" >&2; cat "$ROOT/solo/server.log" >&2; exit 1; }
  sleep 0.2
done

OID=$(grep -o '"obj":"[^"]*"' "$ROOT/solo/snapshots.json" | tail -1 | cut -d'"' -f4)

# One snapshot through the server, so the Tasks screen has a real snapshot task
# on it rather than only the repository-open one.
curl -fsS -o /dev/null -X POST \
  "http://127.0.0.1:$SOLO_API/api/v1/sources/upload?userName=user&host=laptop-1&path=$SOLO_BASE/Documents" \
  -H 'content-type: application/json' -d '{}' || true
sleep 2


cat >"$ROOT/vars.env" <<VARS
FLEET_API=$FLEET_API
FLEET2_API=$FLEET2_API
SOLO_API=$SOLO_API
DEVICE_ID=$AG_LAPTOP
DEVICE_FAILING=$AG_NUC
DEVICE_NEVER=$AG_DESK
SNAPSHOT_OID=$OID
SOLO_SOURCE=$SOLO_BASE/Documents
SETUP_TOKEN=$SETUP_TOKEN
DEMO_TARGET_PATH=$ROOT/hosted
VARS
echo "seed: done ($ROOT/vars.env)"
