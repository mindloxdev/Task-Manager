#!/usr/bin/env bash
# Create the PostgreSQL role and databases for Task Manager, and fill in
# .env / .env.test.
#
#   sudo deploy/setup-database.sh
#
# Safe to run again: an existing role, database or .env is kept. The role's
# password is (re)set to the one in .env, so the two can never drift apart.
#
#   task_manager        the application's database
#   task_manager_test   throwaway database for `npm test`; never holds real data
#
# Both use the C.UTF-8 locale, like the other applications on this server.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${APP_USER:-$(stat -c %U "$APP_DIR")}"
DB_NAME="${DB_NAME:-task_manager}"
DB_USER="${DB_USER:-task_manager}"
TEST_DB_NAME="${DB_NAME}_test"
ENV_FILE="$APP_DIR/.env"
TEST_ENV_FILE="$APP_DIR/.env.test"

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found: install postgresql first" >&2; exit 1; }
systemctl is-active --quiet postgresql || { echo "postgresql is not running" >&2; exit 1; }

as_postgres() { sudo -u postgres psql -v ON_ERROR_STOP=1 -X -q "$@"; }
env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
env_set() { sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"; }

# --- .env: create from the template once, then keep what is in it -----------
if [[ ! -f "$ENV_FILE" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 600 "$APP_DIR/.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE from .env.example"
fi
chmod 600 "$ENV_FILE"; chown "$APP_USER:$APP_USER" "$ENV_FILE"

# Secrets still at their placeholder values get real random ones (hex only:
# safe unquoted in .env, in systemd's EnvironmentFile and inside a URL).
for var in AUTH_SECRET CRON_SECRET; do
  grep -qE "^$var=" "$ENV_FILE" || echo "$var=" >> "$ENV_FILE"
  value="$(env_get "$var")"
  if [[ -z "$value" || "$value" == replace-with-* ]]; then
    env_set "$var" "$(openssl rand -hex 32)"
    echo "Generated $var"
  fi
done

# The database password lives inside DATABASE_URL; reuse it on later runs.
DB_PASSWORD="$(env_get DATABASE_URL | sed -nE 's|^postgres(ql)?://[^:]+:([^@]*)@.*|\2|p')"
if [[ -z "$DB_PASSWORD" || "$DB_PASSWORD" == "change-me" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  echo "Generated a database password"
fi
env_set DATABASE_URL "postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"

# --- role ---------------------------------------------------------------------
as_postgres -v role="$DB_USER" -v pw="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
ALTER ROLE :"role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'pw';
SQL
echo "Role $DB_USER ready"

# --- databases ----------------------------------------------------------------
for db in "$DB_NAME" "$TEST_DB_NAME"; do
  as_postgres -v db="$db" -v role="$DB_USER" <<'SQL'
SELECT format(
  'CREATE DATABASE %I OWNER %I TEMPLATE template0 ENCODING %L LOCALE_PROVIDER libc LOCALE %L',
  :'db', :'role', 'UTF8', 'C.UTF-8')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
-- Only the application's role may connect.
REVOKE CONNECT, TEMPORARY ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"role";
SQL
  echo "Database $db ready"
done

# --- .env.test: the database `npm test` wipes and refills ---------------------
umask 077
printf '# Written by deploy/setup-database.sh. Used only by `npm test`.\nTEST_DATABASE_URL=postgresql://%s:%s@127.0.0.1:5432/%s\n' \
  "$DB_USER" "$DB_PASSWORD" "$TEST_DB_NAME" > "$TEST_ENV_FILE"
chown "$APP_USER:$APP_USER" "$TEST_ENV_FILE"; chmod 600 "$TEST_ENV_FILE"
echo "Wrote $TEST_ENV_FILE"

# --- prove the application can actually log in --------------------------------
PGPASSWORD="$DB_PASSWORD" psql -X -q -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" \
  -c 'SELECT 1' >/dev/null && echo "Login as $DB_USER over 127.0.0.1 works"
