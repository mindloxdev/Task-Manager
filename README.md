# MindLox Task Manager — team task management and accountability

An internal system for assigning work, tracking who is actually doing it, and
reviewing it before it is called done.

One task is stored once, however many people own it. Each assignee carries their
own status and their own reported progress, so a shared task cannot look
finished because one person finished their share. Deadlines keep their history,
blockers stay visible, and every number on a report explains how it was
calculated.

---

## Quick start

Needs Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL and AUTH_SECRET (see Environment below)
npm run setup                 # generate client, run migrations, seed demo data
npm run dev                   # http://localhost:3000
```

`npm run setup` is `prisma generate` + `prisma migrate deploy` + `npm run db:seed`.
To put it on a server, see *Deployment* below.

### Demo accounts

The seed builds a small company — four teams, fifteen people, twenty-one tasks
spread across every lifecycle state, with real progress reports, reviews,
blockers and notifications. Every seeded account uses the password
`cadence2026`:

| Email | Who | Role |
| --- | --- | --- |
| `owner@cadence.test` | Amara Osei | Owner — sees everything |
| `daniel@cadence.test` | Daniel Reyes | Manager, leads Engineering |
| `priya@cadence.test` | Priya Nandakumar | Manager, leads Product Design |
| `mei@cadence.test` | Mei Chen | Employee, has work awaiting review |
| `luca@cadence.test` | Luca Moretti | Employee, on a shared task |

Sign in as each to see the same screens change shape: the owner gets the
company, a manager gets the teams they lead, an employee gets their own work.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run verify` | Typecheck → lint → tests → production build |
| `npm test` | Vitest suite (133 tests) |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply existing migrations (deployment) |
| `npm run db:seed` | Reseed demo data (clears existing rows; refuses if real accounts exist) |
| `npm run db:create-owner` | Create the first owner account on an empty database (`OWNER_EMAIL`, `OWNER_NAME`) |
| `npm run db:reset` | Drop, re-migrate and reseed |

---

## Environment

Copy `.env.example` to `.env`. Only the first two matter to get running.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | PostgreSQL connection URL. See *Database* below. |
| `AUTH_SECRET` | Yes | — | Signs session cookies. **Must be 32+ characters in production** (the app refuses to start otherwise). Generate with `openssl rand -base64 32`. |
| `SESSION_TTL_HOURS` | No | `12` | How long a session lasts. |
| `CRON_SECRET` | No | — | Bearer token for the reminder endpoint. Without it, only a signed-in owner can run the sweep. |
| `ATTACHMENT_DIR` | No | `./storage/attachments` | Private file storage, outside the web root. |
| `MAX_UPLOAD_MB` | No | `10` | Upload size limit. |
| `APP_URL` | No | `http://localhost:3000` | Used to build absolute links in emails. |
| `EMAIL_PROVIDER` | No | — | Set to `resend` to enable email. |
| `EMAIL_API_KEY` | No | — | Required if `EMAIL_PROVIDER` is set. |
| `EMAIL_FROM` | No | — | Required if `EMAIL_PROVIDER` is set. |
| `DOMAIN` | Deploy only | — | Public hostname nginx serves the app at. |
| `PORT` | Deploy only | — | Local port the service listens on (127.0.0.1 only). |

### Email is off until you configure it

There is no mail provider by default, and the app never pretends otherwise.
In-app notifications work regardless; email is attempted only when all three
`EMAIL_*` variables are present *and* the recipient has turned email on in their
own preferences. Settings → Email delivery shows the live status, and the invite
dialog hands the owner the invitation link to pass on by hand.

### Scheduled reminders

Deadline reminders, overdue notices and "your update is due" nudges come from a
sweep you schedule:

```bash
curl -X POST https://your-host/api/cron/reminders \
  -H "Authorization: Bearer $CRON_SECRET"
```

Hourly is a sensible cadence. The sweep is idempotent — every notification
carries a key built from the task, its deadline and the reminder window — so
running it twice an hour, or twice in the same minute, notifies nobody twice.
An owner can also run it by hand from Settings. Use Vercel Cron, a GitHub
Action, a systemd timer, or Windows Task Scheduler; anything that can make an
HTTP request will do.

---

## Database

The app runs on PostgreSQL. The schema avoids provider-specific features — no
database enums, no native JSON columns, no array columns. Enum-like columns are
plain strings validated by Zod at every write boundary (`src/lib/enums.ts`).
Text search ignores case.

---

## Deployment

`deploy/` installs the app on an Ubuntu server that already runs nginx,
PostgreSQL and certbot, the same way as the other apps on this machine:

```bash
sudo OWNER_EMAIL=you@example.com OWNER_NAME="Your Name" deploy/install.sh
```

| Piece | What it is |
| --- | --- |
| Database | `task_manager` (and `task_manager_test` for `npm test`), own role, password generated into `.env` |
| `task-manager.service` | One Next.js process on `127.0.0.1:$PORT` — the frontend and the API (`/api/*`, server actions) together |
| `task-manager-reminders.timer` | Runs the reminder sweep hourly with `CRON_SECRET` |
| nginx | `https://$DOMAIN`, Let's Encrypt certificate, http → https, sign-in throttled per address |

The script generates `AUTH_SECRET`, `CRON_SECRET` and the database password,
builds, migrates, starts and health-checks the app, then checks DNS before it
asks Let's Encrypt for a certificate. If the name does not point at the server
yet, it prints the DNS record to add and stops; run it again once DNS is live.
On the first run `OWNER_EMAIL` creates the owner account and prints a one-time
password. Everyone else is invited from the Employees page. The demo seed is
never run on the server.

To update: `git pull && sudo deploy/install.sh` (the app is stopped while it
rebuilds, about a minute).

---

## How it is put together

```
src/
  lib/            Shared, pure code: enums, validation schemas, dates,
                  task-health maths. Imported by both server and client.
  server/
    auth.ts       Session cookies (JWT + httpOnly), current user
    permissions.ts  Every authorisation rule, in one file
    services/     All business logic and database access
    …             env, errors, rate limiting, email boundary
  app/
    actions/      Server actions — thin wrappers that validate and delegate
    api/          HTTP endpoints that must exist: uploads, downloads,
                  CSV export, the cron sweep, notifications polling
    (app)/        The signed-in application
  components/     UI primitives, task components, charts, the shell
```

**The service layer is the product.** Server actions and API routes validate
input and call a service; they contain no rules of their own. Every service
re-reads the actor's role, status and team memberships from the database before
acting — nothing the browser sends is trusted for authorisation.

### Roles

- **Owner** — everything, company-wide.
- **Manager** — the teams they lead (`TeamMembership.role = LEAD`), plus their
  own work. Nothing outside those teams.
- **Employee** — their own assignments, their teams' tasks, their own reports.

### The lifecycle

Draft → Assigned → Acknowledged → In progress → (Blocked) → Submitted for
review → (Changes requested → resubmit) → Completed, with Cancelled available
throughout.

The task-level status is rolled up from the assignees by `recomputeRollup`,
which refuses to overwrite states only a manager may set. A shared task follows
its completion rule: every required assignee, any one of them, or just the
primary owner.

**Nobody approves their own submission.** `canReviewTask` rejects the submitter
even when they would otherwise have review authority — including a team lead who
assigned the work to themselves.

### Progress is never invented

A task's percentage is either the mean of what its required assignees reported,
or a count of ticked checklist items — never an estimate. The task detail page
prints which of the two is in use.

---

## Reporting, honestly

Every figure on the Reports page carries its own definition, and the page ends
with the full list of them. Two choices worth calling out:

- **On-time completion is measured against the *original* deadline.** Granting
  an extension moves the date for planning, but it cannot retroactively turn a
  late delivery into a punctual one.
- **Per-person numbers are load and responsiveness, not productivity.** Shared
  tasks are divided between their required assignees and open work is weighted
  by priority (Low 1 → Urgent 4), because a raw task count says nothing about
  task size, complexity, or the colleague someone spent a day unblocking. The UI
  says so wherever these numbers appear.

CSV export is available for tasks, people, teams, progress reports, blockers and
late completions, scoped exactly like the screen and written to the audit log.

---

## Security

- Passwords hashed with bcrypt (cost 12); a failed login costs the same whether
  or not the account exists.
- Sessions are signed JWTs in an `httpOnly`, `SameSite=Lax` cookie. Each carries
  a `tokenVersion`; changing a password, a role, or deactivating an account
  bumps it and invalidates every token already issued.
- Authorisation is re-evaluated server-side on every read and write.
- Rate limiting on login, invitation acceptance, password changes and uploads.
- Uploads are type- and size-checked, stored outside the web root under a random
  key, and served only through a route that re-checks access. Filenames are
  stripped of path information; storage keys never reach the browser.
- Audit log for role changes, deactivations, deletions, transfers, settings
  changes and exports.
- Deadlines are stored and compared in UTC and displayed in each person's own
  time zone.

The middleware is a cheap first pass that only checks for a well-formed cookie;
it is never the authorisation decision.

---

## Tests

```bash
npm test
```

133 tests against a real PostgreSQL database built from the live schema — no
mocked database, so constraints, transactions and rollups are the real ones.
The suite reads `TEST_DATABASE_URL` from `.env.test` (on the server,
`deploy/setup-database.sh` writes it) and **deletes everything in that
database**, so it refuses to run against the `DATABASE_URL` in `.env`.

- `tests/workflows.test.ts` — the fourteen workflows from the brief end to end,
  plus the invariants that matter: one task record per assignment, shared tasks
  that refuse to complete early, deadline history, notification targeting.
- `tests/calculations.test.ts` — health, rollup, completion rules, workload,
  time zones, CSV escaping.
- `tests/security.test.ts` — password handling, session invalidation, rate
  limiting, and the private attachment store (including traversal defence).

Two bugs were found and fixed by writing these: deadline reminders were firing
the widest window rather than the tightest, and the service layer accepted an
"individual" task with two assignees when called directly.

---

## Accessibility and theming

The product ships light; dark and "match system" are available from the theme
menu in the header and persist per browser.

Colour is never the only signal — every status, health and priority chip pairs
its tint with an icon and a text label, and every chart has a "show the numbers"
table underneath. Focus rings are visible throughout, dialogs trap and restore
focus, forms label every control and put errors next to the field they belong
to, and all motion is removed under `prefers-reduced-motion`.

---

## Known limits

- **Rate limiting is per process.** It protects a single instance. Behind
  several instances, point `src/server/rate-limit.ts` at a shared store; the
  call signature is designed so only that file changes.
- **Attachments are stored on local disk.** For multi-instance deployment,
  replace the read/write calls in `src/server/services/attachments.ts` with
  object storage. The authorisation boundary already lives in one place.
- **PDF export is the browser's print dialog** ("Print / save as PDF" on the
  Reports page). CSV is a real export.
- **Recurring tasks open the next occurrence on approval**, not on a schedule.
- The dashboard loads the full set of tasks a viewer may see. That is correct at
  one-company scale; at tens of thousands of tasks the summary counts should
  move into aggregate queries.
