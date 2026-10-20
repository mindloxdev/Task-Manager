#!/usr/bin/env bash
# Install MindLox Task Manager on this server: database, app service, reminder
# timer, nginx, https.
#
#   sudo OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" deploy/install.sh
#
# OWNER_EMAIL    sign-in email for the first owner account (first install only;
#                a one-time password is printed at the end)
# OWNER_NAME     their display name (optional)
# NODE_BIN       the node binary the service runs (default: the newest ~/.nvm
#                node of the repo's owner, since sudo drops nvm from PATH)
# CERTBOT_EMAIL  only needed if certbot has no account on this machine yet
#
# Safe to run again after a `git pull`: it reinstalls dependencies, applies new
# migrations, rebuilds, restarts, and keeps the database, .env and certificate.
#
# Stages, in order -- each one is checked before the next starts:
#   1. PostgreSQL role + databases, .env       (deploy/setup-database.sh)
#   2. npm ci, migrate, build                  as the app user
#   3. task-manager service + reminder timer   systemd, then health-checked
#   4. nginx, http only                        answers the ACME challenge
#   5. DNS check, then certbot                 Let's Encrypt, webroot
#   6. nginx, https                            and a final end-to-end check
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="$(stat -c %U "$APP_DIR")"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
DEPLOY="$APP_DIR/deploy"
ENV_FILE="$APP_DIR/.env"
SITE=/etc/nginx/sites-available/task-manager
SNIPPETS=(/etc/nginx/snippets/task-manager-app.conf /etc/nginx/snippets/task-manager-proxy.conf)
WEBROOT=/var/www/letsencrypt

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root: sudo OWNER_EMAIL=you@example.com $0"
[[ "$APP_USER" != root ]] || fail "$APP_DIR is owned by root; it must belong to the user the app runs as"

# --- node ---------------------------------------------------------------------
if [[ -z "${NODE_BIN:-}" ]]; then
  NODE_BIN="$(ls -1d "$APP_HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
  [[ -n "$NODE_BIN" ]] || NODE_BIN="$(command -v node || true)"
fi
[[ -x "${NODE_BIN:-}" ]] || fail "node not found. Pass it: sudo NODE_BIN=\"\$(command -v node)\" $0"
NODE_VERSION="$("$NODE_BIN" -p 'process.versions.node')"
"$NODE_BIN" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
  || fail "node $NODE_VERSION is too old; 20 or newer is required"
NODE_DIR="$(dirname "$NODE_BIN")"
echo "Using node $NODE_VERSION at $NODE_BIN, running as $APP_USER"

as_app() {
  sudo -u "$APP_USER" env HOME="$APP_HOME" PATH="$NODE_DIR:/usr/local/bin:/usr/bin:/bin" \
    CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 NEXT_TELEMETRY_DISABLED=1 "$@"
}
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
env_set() {
  if grep -qE "^$1=" "$ENV_FILE"; then sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; else echo "$1=$2" >> "$ENV_FILE"; fi
}
render() {
  sed -e "s|@APP_DIR@|$APP_DIR|g" -e "s|@APP_USER@|$APP_USER|g" -e "s|@NODE_BIN@|$NODE_BIN|g" \
      -e "s|@DOMAIN@|$DOMAIN|g" -e "s|@PORT@|$PORT|g" "$1"
}

# --- 1. database and .env -----------------------------------------------------
say "1/6  PostgreSQL and .env"
bash "$DEPLOY/setup-database.sh"

DOMAIN="$(env_get DOMAIN)"; PORT="$(env_get PORT)"
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ && "$DOMAIN" == *.* ]] || fail "DOMAIN in $ENV_FILE is not a hostname: '$DOMAIN'"
[[ "$PORT" =~ ^[0-9]+$ ]] || fail "PORT in $ENV_FILE must be a number: '$PORT'"
env_set APP_URL "https://$DOMAIN"
AUTH_SECRET_VALUE="$(env_get AUTH_SECRET)"
[[ ${#AUTH_SECRET_VALUE} -ge 32 ]] || fail "AUTH_SECRET in $ENV_FILE must be at least 32 characters"

# Uploaded files: private to the app user, outside anything nginx serves.
ATTACH_DIR="$(env_get ATTACHMENT_DIR)"; ATTACH_DIR="${ATTACH_DIR:-./storage/attachments}"
[[ "$ATTACH_DIR" == /* ]] || ATTACH_DIR="$APP_DIR/${ATTACH_DIR#./}"
install -d "$ATTACH_DIR"
# `install -d` leaves any parents it creates (./storage) owned by root; every
# directory between the app and the attachment store belongs to the app user.
dir="$ATTACH_DIR"
while [[ "$dir" == "$APP_DIR"/* ]]; do chown "$APP_USER:$APP_USER" "$dir"; dir="$(dirname "$dir")"; done
chmod 700 "$ATTACH_DIR"

# The port may be held by this app's own service (a re-run); by anything
# else, it is a conflict to stop on rather than fight over.
pid="$(ss -ltnpH "( sport = :$PORT )" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [[ -n "$pid" ]]; then
  unit="$(ps -o unit= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  [[ "$unit" == task-manager.service ]] \
    || fail "port $PORT is already used by another program (pid $pid${unit:+, $unit}). Change PORT in $ENV_FILE."
fi

# --- 2. dependencies, migrations, build ---------------------------------------
say "2/6  Dependencies, database migrations, production build"
# On a re-run, stop the app first: npm ci replaces node_modules and the build
# replaces .next, both of which the running server reads from.
systemctl stop task-manager-reminders.timer task-manager 2>/dev/null || true
cd "$APP_DIR"
as_app npm ci --no-audit --no-fund
as_app npx prisma generate
as_app npx prisma migrate deploy
as_app npm run build

if [[ -n "${OWNER_EMAIL:-}" ]]; then
  OWNER_OUTPUT="$(as_app env OWNER_EMAIL="$OWNER_EMAIL" OWNER_NAME="${OWNER_NAME:-}" npx tsx prisma/create-owner.ts)" \
    || fail "could not create the owner account: $OWNER_OUTPUT"
  echo "$OWNER_OUTPUT" | grep -v 'Password:' || true
fi
OWNER_COUNT="$(psql -X -qAt "$(env_get DATABASE_URL)" \
  -c "SELECT count(*) FROM \"User\" WHERE role = 'OWNER'" 2>/dev/null || echo "?")"

# --- 3. services --------------------------------------------------------------
say "3/6  systemd: task-manager + hourly reminder timer"
render "$DEPLOY/task-manager.service" > /etc/systemd/system/task-manager.service
render "$DEPLOY/task-manager-reminders.service" > /etc/systemd/system/task-manager-reminders.service
cp "$DEPLOY/task-manager-reminders.timer" /etc/systemd/system/task-manager-reminders.timer
systemctl daemon-reload
systemctl enable task-manager task-manager-reminders.timer >/dev/null
systemctl restart task-manager

ok=""
for _ in $(seq 1 60); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/login" 2>/dev/null || true)"
  [[ "$code" == 200 ]] && { ok=1; break; }
  sleep 1
done
[[ -n "$ok" ]] || { journalctl -u task-manager -n 40 --no-pager; fail "the app did not come up on 127.0.0.1:$PORT (log above)"; }
systemctl start task-manager-reminders.timer
echo "App on 127.0.0.1:$PORT is healthy (the sign-in page reads from the database)"

# --- nginx helper: install a site, test, roll back if nginx rejects it --------
install_site() {  # template
  local backup; backup="$(mktemp -d)"
  for f in "$SITE" "${SNIPPETS[@]}"; do [[ -f "$f" ]] && cp "$f" "$backup/$(basename "$f")"; done
  render "$DEPLOY/nginx-task-manager-app.conf"   > /etc/nginx/snippets/task-manager-app.conf
  render "$DEPLOY/nginx-task-manager-proxy.conf" > /etc/nginx/snippets/task-manager-proxy.conf
  render "$1" > "$SITE"
  ln -sfn "$SITE" /etc/nginx/sites-enabled/task-manager
  if ! nginx -t 2>"$backup/nginx-test.log"; then
    cat "$backup/nginx-test.log" >&2
    for f in "$SITE" "${SNIPPETS[@]}"; do
      if [[ -f "$backup/$(basename "$f")" ]]; then cp "$backup/$(basename "$f")" "$f"; else rm -f "$f"; fi
    done
    [[ -f "$SITE" ]] || rm -f /etc/nginx/sites-enabled/task-manager
    rm -rf "$backup"
    fail "nginx rejected the new config; the previous one was restored and nothing was reloaded"
  fi
  systemctl reload nginx
  rm -rf "$backup"
}

CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
mkdir -p "$WEBROOT"

# --- 4. + 5. certificate ------------------------------------------------------
if [[ -f "$CERT" ]]; then
  say "4/6  Certificate for $DOMAIN already exists (certbot renews it automatically)"
  say "5/6  Skipped"
else
  say "4/6  nginx, http only (for the ACME challenge)"
  install_site "$DEPLOY/nginx-task-manager-http.conf"

  say "5/6  DNS and certificate"
  PUBLIC_IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
  RESOLVED="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
  if [[ -z "$RESOLVED" || ( -n "$PUBLIC_IP" && "$RESOLVED" != "$PUBLIC_IP" ) ]]; then
    cat >&2 <<MSG

$DOMAIN does not point at this server yet.
  resolves to: ${RESOLVED:-nothing}
  this server: ${PUBLIC_IP:-unknown}

Add this record at your DNS provider, wait a few minutes, then run this script again:
  Type A   Name ${DOMAIN%%.*}   Value ${PUBLIC_IP:-<your public IP>}   TTL 300

The app is running; only https is waiting on DNS.
MSG
    exit 2
  fi
  echo "$DOMAIN resolves to $RESOLVED (this server)"
  # Let's Encrypt prefers IPv6 when a name has an AAAA record; a stray one
  # that does not reach this nginx makes issuance fail.
  V6="$(getent ahostsv6 "$DOMAIN" | awk '{print $1}' | grep -v '^::ffff:' | head -1 || true)"
  [[ -z "$V6" ]] || echo "Note: $DOMAIN also has an IPv6 (AAAA) record, $V6. If certbot fails, remove it."

  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos --keep-until-expiring \
    --deploy-hook "systemctl reload nginx" \
    ${CERTBOT_EMAIL:+-m "$CERTBOT_EMAIL"} \
    || fail "certbot could not issue a certificate (see above). Check that ports 80 and 443 on your router forward to this server."
fi

# --- 6. https -----------------------------------------------------------------
say "6/6  nginx, https"
install_site "$DEPLOY/nginx-task-manager-https.conf"

# Checked through nginx on this machine, so it does not depend on the router
# supporting hairpin NAT. `systemctl reload` returns before nginx's workers
# have switched over, so retry briefly.
code=""
for _ in $(seq 1 15); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login" 2>/dev/null || true)"
  [[ "$code" == 200 ]] && break
  sleep 1
done
[[ "$code" == 200 ]] || fail "https://$DOMAIN/login did not answer through nginx (HTTP ${code:-no response})"
redirect="$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 10 --resolve "$DOMAIN:80:127.0.0.1" "http://$DOMAIN/" || true)"
[[ "$redirect" == "https://$DOMAIN/" ]] || fail "http://$DOMAIN/ should redirect to https, got: ${redirect:-nothing}"

say "Done: https://$DOMAIN"
if [[ -n "${OWNER_OUTPUT:-}" && "$OWNER_OUTPUT" == *Password:* ]]; then
  echo "$OWNER_OUTPUT"
elif [[ "$OWNER_COUNT" == 0 ]]; then
  echo "No owner account yet. Create one with:"
  echo "  sudo OWNER_EMAIL=you@example.com OWNER_NAME=\"Your Name\" $0"
fi
cat <<MSG

Service:   systemctl status task-manager
Logs:      journalctl -u task-manager -f
Reminders: systemctl list-timers task-manager-reminders.timer
Update:    git pull && sudo $0
MSG
