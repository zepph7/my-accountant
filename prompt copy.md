<!-- 
## Role & Objective
You are a senior backend engineer. Build a production-grade REST API backend for a personal finance management app called **My Accountant**. The app records **income**, automatically **distributes each income by configurable percentages** (e.g. Essentials 60%, Savings 20%, Investments 10%, Emergency 10%), and separately tracks **freely-spent expenses**. Deliver clean, modular, well-tested, documented code.

## Tech Stack (use exactly this)
- **Runtime:** Node.js (LTS) + **TypeScript** (strict mode)
- **Framework:** Express.js
- **Database:** PostgreSQL (hosted on Supabase — connect via `DATABASE_URL`, SSL required)
- **DB access:** `pg` with a connection pool + **`node-pg-migrate`** for migrations (no ORM unless you justify it)
- **Validation:** Zod
- **Auth:** JWT (access + refresh) for email/password **and** Google OAuth 2.0
- **Queue/async:** BullMQ (Redis-backed) — keep it optional via config so the app runs without Redis in dev
- **Realtime:** Socket.IO
- **Logging:** Pino (structured JSON logs)
- **Testing:** Jest + Supertest
- **Docs:** OpenAPI (Swagger) served at `/api/docs`
- **Lint/format:** ESLint (flat config) + Prettier

## Architecture (enforce this layering)
Layered structure — **routes → controllers → services → repositories**. Controllers never touch SQL; repositories never contain business logic; services hold all business rules. Cross-cutting concerns (auth, validation, error handling, rate limiting, request logging) live in middleware.

```
src/
  config/        (env validation, db pool, logger, redis)
  routes/        (route definitions only)
  controllers/   (req/res handling, calls services)
  services/      (business logic, e.g. income distribution)
  repositories/  (SQL only)
  middlewares/   (auth, error handler, validate, rateLimiter, requestLogger)
  validators/    (Zod schemas per resource)
  jobs/          (BullMQ processors)
  sockets/       (Socket.IO handlers)
  utils/         (ApiError, ApiResponse, asyncHandler)
  types/         (shared TS types/DTOs)
  app.ts
  server.ts
migrations/
tests/ (unit + integration)
```

## Data Model Requirements

**Multi-tenancy:** Every financial table must have a `user_id` FK. All queries must be scoped to the authenticated user — a user can never read or mutate another user's data. Enforce this in the repository layer.

**Core tables:**
- `users` — `id (uuid)`, `email (unique, citext)`, `first_name`, `last_name`, `password_hash (nullable — null for Google-only accounts)`, `auth_provider (enum: 'local' | 'google')`, `google_id (nullable, unique)`, `avatar_url`, `is_verified`, `role (enum: 'user' | 'admin', default 'user')`, `created_at`, `updated_at`
- `income_sources` — user-scoped, `name`
- `incomes` — user-scoped, `date`, `amount`, `source_id`, `notes`
- `distribution_categories` — user-scoped, `name`, `percentage`. Seed defaults (Essentials 60, Savings 20, Investments 10, Emergency 10) **per user on registration**, not globally.
- `distributed_incomes` — links `income_id` → `distribution_category_id` with computed `amount`
- `expense_categories` — user-scoped, `name`
- `expenses` — user-scoped, `date`, `amount`, `category_id`, `description`, `payee`
- `overview` — user-scoped balances snapshot (`cash_wallet`, `account_balance`, `mpesa_balance`, `created_at`) kept as history

**Audit/soft-delete requirement:** For all important tables (`incomes`, `expenses`, `distributed_incomes`, and their category tables), do **not** hard-delete. Implement one of:
1. **Soft delete** — `deleted_at TIMESTAMPTZ` column, excluded from normal queries, OR
2. **Audit log tables** — `*_audit` tables capturing the row snapshot + `action (insert/update/delete)` + `changed_by` + `changed_at` via triggers.

Choose soft-delete for the primary records **and** add audit trigger tables for `incomes` and `expenses` specifically, so deleted/edited financial history is always recoverable. Document your reasoning.

**Constraints & integrity:**
- `distribution_categories.percentage` — add a validation (app-level and a DB `CHECK` that each is between 0–100). Warn (don't block) if a user's total ≠ 100%.
- Money columns: `NUMERIC(12,2)`.
- Indexes on `user_id`, `date`, and FKs used in filters.
- Use `updated_at` auto-update triggers.

## Business Logic: Income Distribution
When an income is created (`POST /api/incomes`), within a **single DB transaction**:
1. Insert the income row.
2. Read the user's current `distribution_categories`.
3. Compute each category's amount = `income.amount × percentage / 100`.
4. Insert the resulting `distributed_incomes` rows.
5. Handle rounding so the distributed amounts **sum exactly** to the income amount (assign any rounding remainder to the largest category).

Editing or deleting an income must correspondingly update/soft-delete its `distributed_incomes` in the same transaction. Expenses have **no** distribution logic — they're recorded freely against expense categories.

## Authentication (implement both flows)
**Local:** `POST /api/auth/register` (hash with bcrypt/argon2), `POST /api/auth/login` → returns short-lived access JWT + refresh token (store refresh token hashed, support rotation + revocation). `POST /api/auth/refresh`, `POST /api/auth/logout`.

**Google OAuth 2.0:** `GET /api/auth/google` → redirect, `GET /api/auth/google/callback` → verify, upsert user by `google_id`/`email`, issue the same JWT pair. If an email already exists as a local account, link sensibly and document the chosen behavior.

**Authorization:** `authenticate` middleware verifies JWT and attaches `req.user`. `authorize(role)` middleware for admin-only routes. All `/api/*` financial routes require authentication and are user-scoped.

## API Endpoints
Implement full CRUD (all user-scoped, paginated where lists) for: `auth`, `overview`, `income-sources`, `incomes` (returns distribution breakdown on GET), `distribution-categories`, `expense-categories`, `expenses`. Plus **reporting endpoints**:
- `GET /api/reports/summary?from=&to=` — total income, total expenses, net, per-distribution-category totals, per-expense-category totals
- `GET /api/reports/distribution?from=&to=` — target vs actual distribution
- `GET /api/reports/cashflow?groupBy=month|week` — income vs expense over time
- `GET /api/dashboard` — a single aggregated payload powering the dashboard (balances, current-month income/expense totals, distribution breakdown, recent transactions)

## Cross-cutting Requirements
- **Validation:** Zod schema per endpoint (body, params, query) via a `validate` middleware. Reject unknown fields.
- **Pagination & filtering:** All list endpoints support `?page=&limit=&sort=&order=` plus resource-specific filters (`from`, `to`, `categoryId`, `sourceId`). Return `{ data, pagination: { page, limit, total, totalPages } }`.
- **Error handling:** Central error middleware. Custom `ApiError` class. Consistent JSON shape `{ success, message, errors? }`. Never leak stack traces in production. Distinguish 400/401/403/404/409/422/429/500.
- **Async/notifications:** Use BullMQ for a sample job (e.g. monthly summary generation / email) and Socket.IO to emit real-time events (e.g. `income:created`, budget threshold alerts) to the owning user's room. Degrade gracefully if Redis is absent.
- **Logging & monitoring:** Pino structured logs, per-request logger with request IDs, redact secrets. Add `/health` and `/ready` endpoints. Add hooks/documentation for Sentry.
- **Security:** `helmet`, CORS allowlist, `express-rate-limit` (esp. on auth routes), parameterized queries only (no string-built SQL), input sanitization, bcrypt/argon2 password hashing, secrets only via env, refresh-token rotation, no sensitive data in logs. Document HTTPS/TLS termination expectation for deployment.
- **Testing:** Unit tests for the distribution logic (including rounding edge cases) and services; integration tests (Supertest) covering auth flows, user-scoping isolation (user A cannot access user B's data), CRUD, pagination, and validation failures. Aim for meaningful coverage of business-critical paths.
- **Docs:** OpenAPI spec + Swagger UI at `/api/docs`. A thorough `README` (setup, env vars, migrations, running, testing, Google OAuth setup steps). `.env.example` with every variable.

## Deliverables & Working Style
1. Start by proposing the **final DB schema + migration files** and the **folder scaffold**, then pause for my confirmation before implementing the full logic.
2. Then implement incrementally: config → migrations → auth → core CRUD → distribution logic → reporting → async/sockets → tests → docs.
3. Write TypeScript in strict mode, keep functions small, comment non-obvious decisions, and use conventional commit-style messages if committing.
4. Call out any assumptions explicitly and flag anything that needs a decision from me.

**Begin with step 1 (schema + migrations + folder scaffold) and wait for my approval before proceeding.**

---

A couple of deliberate additions I made as a senior dev, and why:

- **Made it multi-tenant (`user_id` everywhere + scoping).** Your original schema had no user ownership on the financial tables, which would let any logged-in user see everyone's money. This is the single most important correctness/security fix.
- **Per-user distribution seeding** instead of global defaults — otherwise every user shares one set of percentages.
- **Transaction + rounding rule** for distribution — real money math must sum exactly and be atomic, or you get drift and orphaned rows.
- **Refresh-token rotation** — you asked for JWT; a lone long-lived access token is a common security weakness, so I specified the proper access/refresh pattern.
- **Told it to pause after schema** — for a build this size, approving the schema first saves a lot of rework.

additonal: Desing a simple report for income,expense,saving view monthly, yearly for expense extend to daily report and huorly also   -->