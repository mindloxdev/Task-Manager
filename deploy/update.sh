#!/usr/bin/env bash
# Put the latest code online: pull, install, migrate, rebuild, restart.
#
#   deploy/update.sh            pull from GitHub, then deploy
#   deploy/update.sh --no-pull  deploy the code as it is in this folder
#
# Asks for sudo itself (restarting the service needs root). If the working
# tree has uncommitted changes it does not pull, and deploys them as they are.
#
# The app is offline while it rebuilds (about a minute). If the build or the
# health check fails, the previous build is put back and started again, so a
# broken change never leaves the site down.
#
# First install (database, nginx, certificate) is deploy/install.sh, not this.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="$(stat -c %U "$APP_DIR")"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
ENV_FILE="$APP_DIR/.env"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || exec sudo "$0" "$@"

PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL="" ;;
    *) fail "unknown option: $arg (only --no-pull is supported)" ;;
  esac
done

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE is missing. Run deploy/install.sh for the first install."
[[ -f /etc/systemd/system/task-manager.service ]] || fail "task-manager.service is not installed. Run deploy/install.sh first."

# The node the service already runs, so the build matches it.
NODE_BIN="$(systemctl cat task-manager | grep -oP '^ExecStart=\K\S+')"
[[ -x "$NODE_BIN" ]] || fail "node not found at $NODE_BIN (from task-manager.service)"
NODE_DIR="$(dirname "$NODE_BIN")"

as_app() {
  sudo -u "$APP_USER" env HOME="$APP_HOME" PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
    CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 NEXT_TELEMETRY_DISABLED=1 "$@"
}
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
PORT="$(env_get PORT)"; DOMAIN="$(env_get DOMAIN)"

healthy() {
  local code
  for _ in $(seq 1 60); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/login" 2>/dev/null || true)"
    [[ "$code" == 200 ]] && return 0
    sleep 1
  done
  return 1
}

cd "$APP_DIR"
OLD_REV="$(as_app git rev-parse HEAD)"

# --- 1. code ------------------------------------------------------------------
say "1/4  Code"
if [[ -z "$PULL" ]]; then
  echo "Not pulling (--no-pull); deploying the folder as it is"
elif [[ -n "$(as_app git status --porcelain --untracked-files=no)" ]]; then
  echo "This folder has uncommitted changes, so not pulling; deploying them as they are:"
  as_app git status --short --untracked-files=no
else
  as_app git pull --ff-only || fail "git pull failed (see above). Nothing was changed on the server."
fi
NEW_REV="$(as_app git rev-parse HEAD)"
if [[ "$OLD_REV" != "$NEW_REV" ]]; then
  as_app git log --oneline "$OLD_REV..$NEW_REV"
else
  echo "At $(as_app git log --oneline -1)"
fi

# --- 2. dependencies and database --------------------------------------------
say "2/4  Dependencies and database migrations"
NEED_CI=""
[[ -d node_modules ]] || NEED_CI=1
[[ "$OLD_REV" != "$NEW_REV" ]] && ! as_app git diff --quiet "$OLD_REV" "$NEW_REV" -- package-lock.json && NEED_CI=1
[[ package-lock.json -nt node_modules/.package-lock.json ]] && NEED_CI=1
if [[ -n "$NEED_CI" ]]; then
  # npm ci replaces node_modules, which the running server reads from.
  echo "Dependencies changed; stopping the app to reinstall them"
  systemctl stop task-manager-reminders.timer task-manager
  as_app npm ci --no-audit --no-fund
else
  echo "Dependencies unchanged"
fi
as_app npx prisma generate >/dev/null
as_app npx prisma migrate deploy

# Uploaded files: every directory down to the store belongs to the app user.
ATTACH_DIR="$(env_get ATTACHMENT_DIR)"; ATTACH_DIR="${ATTACH_DIR:-./storage/attachments}"
[[ "$ATTACH_DIR" == /* ]] || ATTACH_DIR="$APP_DIR/${ATTACH_DIR#./}"
dir="$ATTACH_DIR"
while [[ "$dir" == "$APP_DIR"/* ]]; do [[ -d "$dir" ]] && chown "$APP_USER:$APP_USER" "$dir"; dir="$(dirname "$dir")"; done

# --- 3. build -----------------------------------------------------------------
say "3/4  Production build (the app is offline until it restarts)"
# `next build` replaces .next while the server reads from it, so stop first and
# keep the previous build to fall back on.
systemctl stop task-manager-reminders.timer task-manager
rm -rf .next.prev
[[ -d .next ]] && mv .next .next.prev

rollback() {
  echo "Putting the previous build back" >&2
  rm -rf .next
  if [[ -d .next.prev ]]; then
    mv .next.prev .next
    systemctl start task-manager task-manager-reminders.timer
    healthy && echo "The previous version is online again." >&2
  fi
  fail "$1"
}

as_app npm run build || rollback "the build failed (see above); the site is still on the previous version"

# --- 4. restart ---------------------------------------------------------------
say "4/4  Restart and health check"
systemctl start task-manager
if ! healthy; then
  journalctl -u task-manager -n 40 --no-pager
  systemctl stop task-manager
  rollback "the new version did not come up on 127.0.0.1:$PORT (log above)"
fi
systemctl start task-manager-reminders.timer
rm -rf .next.prev

say "Online: https://${DOMAIN:-127.0.0.1:$PORT} ($(as_app git log --oneline -1))"
