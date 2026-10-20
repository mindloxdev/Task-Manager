#!/usr/bin/env bash
# Run the reminder sweep once (task-manager-reminders.service, hourly).
# PORT and CRON_SECRET come from .env. The secret is fed to curl on stdin, so
# it never appears in the process list.
set -euo pipefail
: "${PORT:?PORT is not set}" "${CRON_SECRET:?CRON_SECRET is not set}"
printf 'x-cron-secret: %s\n' "$CRON_SECRET" \
  | curl -fsS --max-time 120 -X POST -H @- "http://127.0.0.1:${PORT}/api/cron/reminders"
echo
