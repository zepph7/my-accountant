# My Accountant — Backend

A personal finance API. You record **income once** and it is automatically split
across your own distribution categories; you record **expenses freely** against
their own categories, with no splitting at all. Everything else — balances,
reports, the dashboard — is derived from those two facts.

- Node LTS · TypeScript (strict) · Express 5
- PostgreSQL on Supabase, driven by `pg` and `node-pg-migrate` — **no ORM**
- Zod validation, JWT + Google OAuth, Socket.IO, optional BullMQ, Pino
- OpenAPI at **`/api/docs`**

---

## Quick start

```bash
npm install
cp .env.example .env      # then fill in DATABASE_URL and the two JWT secrets
npm run migrate           # applies all 9 migrations
npm run dev               # http://localhost:3000
```

Docs at <http://localhost:3000/api/docs>, raw spec at `/api/docs.json`.

### Generating the JWT secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice. The two secrets **must differ** — the app refuses to boot
otherwise, because if they match, a refresh token is also a valid access token
and the entire short-lived-access-token design collapses.

---

## Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Supabase connection string |
| `DATABASE_CA_CERT` | in production | Path to the Supabase CA cert. Without it, production **refuses to start** unless TLS verification is on |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | no | `false` is a local-only escape hatch; production rejects it |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | yes | ≥ 32 chars, must differ |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | no | Default `15m` / `30d` |
| `GOOGLE_CLIENT_ID` | no | Setting it makes `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALLBACK_URL` required |
| `QUEUE_ENABLED` | no | Default `false`. When `true`, `REDIS_URL` is required |
| `SENTRY_DSN` | no | Absent means error reporting is a no-op |
| `CORS_ORIGINS` | no | Comma-separated allowlist. Empty means no cross-origin browser access — **not** "allow all" |

Every variable is validated by Zod at boot. A misconfigured server dies
immediately with a readable list of what is wrong, rather than booting and
failing later on whichever request first touches the bad value.

---

## Architecture

```
routes → controllers → services → repositories → PostgreSQL
```

The layering is enforced, not aspirational:

- **Controllers never write SQL.** They read `req.user`, call one service, and
  shape the response.
- **Repositories never hold business logic.** They take a `user_id` and
  parameters and return rows.
- **Services own the rules** — ownership checks, transactions, distribution
  maths, warnings.

Repositories accept an optional executor (`pool` or a `PoolClient`), which is
how a service composes several writes into one transaction without the
repository knowing anything about transactions.

---

## The decisions that matter

### Money is never a float

Every amount is `NUMERIC(12,2)` in Postgres and a **decimal string** in JSON.
`pg`'s type parsers are overridden so `NUMERIC`, `INT8` and `DATE` all arrive as
strings, and all arithmetic runs on **integer cents** (`src/utils/money.ts`).
`0.1 + 0.2` is not `0.3`, and an accounting API is the last place to find that
out.

### Distribution is atomic and sums exactly

Creating income writes the income *and* its splits inside one transaction. A
persisted income with no splits is corrupt data: every report summing
`distributed_incomes` would silently under-count, with no way to tell later
whether a split was missing or genuinely zero.

Splits are floored in basis points and the **remainder goes to the largest
category** (ties broken by lowest id), so the parts sum to the whole exactly —
no rounding dust, ever.

If your percentages do not total 100 you get a **warning, never an error**.
Moving Savings from 20% to 25% has to pass through a moment where the total is
105% before Essentials comes down; blocking that would make the settings screen
impossible to use.

### Tenancy is enforced in the repository

`user_id` is in the `WHERE` clause of every financial query. Another user's
record returns **404, not 403** — confirming that a record exists is itself a
leak. Services additionally verify that a referenced category or source belongs
to the caller, because a foreign key only proves the row exists, not who owns
it.

### Time is bucketed in *your* timezone

`expenses.occurred_at` is a `TIMESTAMPTZ`, and reports truncate it with
`AT TIME ZONE <your timezone>`. A 01:00 purchase in Nairobi belongs to that
local day, not the previous UTC one. Timezones are validated against the tz
database at registration, so an unrecognised zone can never reach the query.

`incomes.date` is a plain `DATE` — a calendar day with no time — which is why
hourly cashflow is refused: it would stack every paycheque at midnight. Hourly
resolution lives on `/api/reports/expenses`, where it is real.

A bare `to=2026-03-31` covers **all of** the 31st. The naive cast to midnight
drops a whole day, and the resulting monthly total is wrong in a way nobody
notices until they reconcile.

### Balances are derived, not stored

There is no running-total column to drift. `overview` is an **append-only**
ledger of the moments you counted your money; the live balance is the newest
snapshot plus everything recorded since. The cut-off is `created_at`, not the
business date — the snapshot reflects what was actually in your pocket, so only
entries made *afterwards* move it. That means a backdated receipt typed in later
is not double-counted.

`overview` has no `PATCH` and no `DELETE`. A reconciliation you can edit after
the fact is not a reconciliation; correcting means recording a new one.

### Soft deletes everywhere

Records are retired, not destroyed. Unique constraints are **partial indexes
limited to live rows** (`WHERE deleted_at IS NULL`), so deleting "Groceries"
frees the name for reuse instead of poisoning it forever. Retiring a
distribution category leaves past splits untouched — they are the record of how
income was actually divided.

`incomes` and `expenses` additionally have trigger-driven audit tables capturing
before/after JSON and the acting user, attributed via a `SET LOCAL` session
variable inside the transaction.

---

## API surface

| Group | Endpoints |
|---|---|
| Health | `GET /api/health` (liveness, no DB) · `GET /api/ready` (503 when DB is down) |
| Auth | `register` · `login` · `refresh` · `logout` · `me` · `google` · `google/callback` |
| Income | `/api/incomes` CRUD · `/api/income-sources` CRUD |
| Expenses | `/api/expenses` CRUD · `/api/expense-categories` CRUD |
| Distribution | `/api/distribution-categories` CRUD |
| Overview | `GET /api/overview` · `GET /api/overview/current` · `POST /api/overview` |
| Reports | `summary` · `distribution` · `cashflow` · `expenses` |
| Dashboard | `GET /api/dashboard` |

All list endpoints return:

```json
{ "data": [], "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }
```

`limit` is capped at 100. `sort` is validated against a per-resource
**allowlist** — it is interpolated into `ORDER BY`, where parameterisation is
impossible, so a free-text sort column is a SQL injection hole.

### Reporting granularities

| Endpoint | `groupBy` | Default window |
|---|---|---|
| `/api/reports/cashflow` | `day` `week` `month` `year` | Last 12 buckets |
| `/api/reports/expenses` | `hour` `day` `week` `month` `year` | Last 30 days (24 hours when hourly) |
| `/api/reports/summary`, `/distribution` | — | Current calendar month |

Series are **gap-filled**: every bucket in the window comes back, including
empty ones. A series with holes draws a chart that connects March straight to
May and hides the month with no activity — usually the month you most wanted to
see.

---

## Auth

Access tokens are stateless JWTs (15 min). Refresh tokens are **opaque, stored
as SHA-256 hashes, and single-use**: each refresh rotates the token and links
the old one to its replacement. Presenting a refresh token twice is treated as
theft — the entire chain for that user is revoked immediately.

Login returns an identical error for an unknown email and a wrong password, and
runs a dummy bcrypt comparison on unknown emails so the response time does not
reveal which accounts exist.

Google sign-in verifies the ID token's signature, audience and issuer, and uses
a `state` cookie for CSRF. Signing in with Google using an email that already
has a password **links** the accounts rather than creating a second one, which
would orphan your financial history behind a login you no longer use.

> The live Google handshake needs a real browser round trip and has not been
> exercised end to end.

### Setting up Google OAuth

1. **Google Cloud Console** → create or select a project.
2. **APIs & Services → OAuth consent screen.** Pick *External*, fill in the app
   name and support email. Add the scopes `openid`, `email`, `profile` — those
   are exactly what `buildAuthUrl` requests, and a consent screen that offers
   fewer will fail at the exchange. While the app is in *Testing*, add your own
   address under **Test users** or Google will refuse the sign-in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**,
   application type **Web application**.
4. Under **Authorised redirect URIs** add the callback *exactly* as the server
   will send it — Google does string equality, so a trailing slash or `http` vs
   `https` mismatch is rejected:

   ```
   http://localhost:3000/api/auth/google/callback     # development
   https://api.your-domain.com/api/auth/google/callback   # production
   ```

5. Copy the client ID and secret into `.env`:

   ```bash
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
   OAUTH_SUCCESS_REDIRECT=http://localhost:8081/auth/callback
   ```

   Setting `GOOGLE_CLIENT_ID` makes the other two **required** — the app refuses
   to boot with a half-configured OAuth setup rather than failing on the first
   sign-in attempt.

6. Send the browser to `GET /api/auth/google`. The server sets a short-lived
   `httpOnly` state cookie, redirects to Google, and on return verifies that the
   state matches before touching the code.

**What `OAUTH_SUCCESS_REDIRECT` controls.** When set, the callback redirects to
that URL with the tokens as query parameters — the flow a browser or Expo app
needs. When unset, the callback returns the token pair as JSON instead, which is
what makes the endpoint testable with `curl`. Note that tokens in a query string
land in browser history and any intermediate proxy log; treat that redirect
target as sensitive and consume the tokens immediately on arrival.

**Account linking.** Signing in with Google using an email that already has a
password account **links** the two — it does not create a second user. The
password is left working, so both methods remain valid. The alternative would
orphan all of that user's financial history behind a login they have stopped
using.

---

## Realtime

Socket.IO, authenticated with the same access token as REST — an
unauthenticated socket is refused at the handshake. Every client joins a room
named after its own user id and the server **only ever emits to rooms**;
broadcasting to the default namespace would hand every connected client
everyone else's income.

```js
const socket = io('http://localhost:3000', { auth: { token: accessToken } });
socket.on('income:created', console.log);
socket.on('budget:alert', console.log);
```

Events: `income:created|updated|deleted`, `expense:created|updated|deleted`,
`budget:alert`.

---

## Background jobs

Off by default. With `QUEUE_ENABLED=false` the app runs with **no Redis at
all** — `bullmq` and `ioredis` are loaded via dynamic import inside the enabled
branch, so they are never even required into the process.

`enqueue()` becomes a no-op when disabled. It deliberately does *not* fall back
to running the job inline: these jobs exist because they are too slow for the
request path, and quietly doing them there would turn a disabled feature into a
latency bug.

Jobs: `monthly-summary`, `cleanup-expired-tokens`.

---

## Scripts

```bash
npm run dev            # tsx watch
npm run build          # tsc → dist/
npm start              # node dist/server.js
npm run typecheck
npm run lint           # oxlint
npm run format
npm run migrate        # / migrate:down
npm test               # / test:unit / test:integration / test:coverage
```

Integration tests run against a **real** database and clean up after
themselves. Point `DATABASE_URL` at a scratch project, not production.

---

## Deployment & TLS

**This app does not terminate TLS and is not meant to.** It listens on plain
HTTP and expects to sit behind a reverse proxy or platform load balancer
(nginx, Caddy, Fly, Render, Railway, an ALB) that holds the certificate and
speaks HTTPS to the world. Running Node as the public TLS endpoint means
managing renewals in application code and losing the proxy's connection
handling for no benefit.

What that arrangement requires you to get right:

- **`trust proxy` is set to `1`** — trusting exactly one hop. The client IP
  arrives in `X-Forwarded-For`, and without this every user is rate-limited as
  though they were the proxy. Setting it to `true` instead would let a client
  forge the header and dodge the limits entirely. If you run *two* proxies in
  front, raise it to `2` — the number must match reality.
- **Terminate TLS 1.2 or better and redirect HTTP → HTTPS at the proxy.** Helmet
  already sends `Strict-Transport-Security` with a one-year max-age, so a
  browser that has seen the site once will refuse plaintext afterwards.
- **Cookies are `secure` only when `NODE_ENV=production`.** The refresh cookie
  is `httpOnly`, `sameSite=lax`, and scoped to `/api/auth`. If production ever
  serves over plain HTTP, that cookie travels in the clear — the flag assumes
  you did the TLS work.
- **Set `CORS_ORIGINS` to your real front-end origins.** Empty means no
  cross-origin browser access at all, not "allow everything".
- **Database TLS is separate and also required.** Supabase presents a
  self-signed chain, so point `DATABASE_CA_CERT` at their CA certificate.
  Production refuses to start with certificate verification disabled — an
  unverified database connection lets an active attacker read and rewrite every
  query.
- **Health checks:** point the orchestrator's liveness probe at `/api/health`
  (never touches the database) and its readiness probe at `/api/ready` (does,
  and returns 503 when the database is down). Wiring liveness to `/api/ready`
  would make a brief database blip kill otherwise-healthy containers.
- **Run migrations as a release step**, before the new version takes traffic —
  `npm run migrate` is not run at boot on purpose, so that N replicas starting
  at once cannot race each other.

## Operational notes

- **Rate limiting** is keyed on the IPv6 /64 subnet, not the raw address —
  otherwise a single client rotates through its own subnet and walks past the
  auth limit. Successful logins do not count against it.
- **Shutdown** is graceful: stop accepting connections, drain in-flight
  requests, then close sockets, queue, pool and Sentry, with a 10s backstop.
- **Errors** map Postgres SQLSTATEs to HTTP codes with generic messages, so
  constraint names never leak. Stack traces are suppressed in production. Only
  5xx reaches Sentry, with request bodies, cookies and headers stripped.
- `npm audit` reports a `brace-expansion` DoS reachable only through `jest`. It
  is a dev dependency and is not shipped.
