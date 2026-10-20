#!/usr/bin/env bash
# The one command to put your changes online:
#
#   deploy/update.sh                       save, sync with GitHub, deploy
#   deploy/update.sh -m "Fix the calendar" same, with your own commit message
#   deploy/update.sh --no-git              deploy the folder as it is, no git
#
# 1. Any changes in this folder are committed (git add -A; .gitignore keeps
#    .env and uploads out), changes on GitHub are pulled in, and the result is
#    pushed to GitHub.
# 2. Dependencies are reinstalled if package-lock.json changed, migrations run.
# 3. The app is rebuilt and restarted. It is offline for about a minute; if the
#    build or the health check fails, the previous build is put back, so a
#    broken change never leaves the site down.
#
# Asks for sudo itself (restarting the service needs root); git runs as the
# folder's owner, with their GitHub credentials.
# First install (database, nginx, certificate) is deploy/install.sh, not this.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="$(stat -c %U "$APP_DIR")"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
ENV_FILE="$APP_DIR/.env"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || exec sudo "$0" "$@"

GIT=1
MESSAGE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message) [[ -n "${2:-}" ]] || fail "-m needs a message, e.g. -m \"Fix the calendar\""; MESSAGE="$2"; shift 2 ;;
    --no-git|--no-pull) GIT=""; shift ;;
    *) fail "unknown option: $1 (use -m \"message\" or --no-git)" ;;
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
say "1/4  Save and sync with GitHub"
PUSH_FAILED=""
BRANCH="$(as_app git rev-parse --abbrev-ref HEAD)"
if [[ -z "$GIT" ]]; then
  echo "Skipping git (--no-git); deploying the folder as it is"
else
  if [[ -n "$(as_app git status --porcelain)" ]]; then
    echo "Committing your changes:"
    as_app git status --short
    as_app git add -A
    as_app git commit -q -m "${MESSAGE:-Update from server, $(date '+%Y-%m-%d %H:%M')}"
    echo "Committed: $(as_app git log --oneline -1)"
  else
    echo "No local changes to commit"
  fi

  # Bring in anything pushed from elsewhere, with local commits on top.
  if ! as_app git pull --rebase origin "$BRANCH"; then
    as_app git rebase --abort 2>/dev/null || true
    fail "could not pull from GitHub (see above): either no connection, or your changes clash with changes there.
Your changes are committed here; nothing was deployed. For a clash, run: git pull --rebase origin $BRANCH
then fix the files it names, and run this script again."
  fi

  if as_app git push origin "$BRANCH"; then
    echo "GitHub is up to date"
  else
    PUSH_FAILED=1
    echo "WARNING: could not push to GitHub (see above). Deploying anyway; run this script again later to push." >&2
  fi
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
[[ -z "$PUSH_FAILED" ]] || echo "WARNING: this version is online but not on GitHub yet; run deploy/update.sh again to push it." >&2
