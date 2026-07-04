# PLAYBOOK.md — Production Deployment & Engineering Playbook

> **What this is:** Every hard-won lesson from building and deploying Deflekt (Next.js + FastAPI +
> Postgres/pgvector + Redis + Docker + GitHub Actions + EC2 + RDS + GHCR), distilled so the next
> project skips the trial-and-error.
>
> **How to use in a new project:** Copy this file into the new repo root. Then add this line near
> the top of `CLAUDE.md` (Claude Code) and `GEMINI.md` (Antigravity):
> `Read PLAYBOOK.md before writing any deployment, CI/CD, database, or AI-pipeline code. Its rules are mandatory.`

---

## 1. Golden rules (learned the hard way)

1. **Fail loudly — never fabricate fallback data.** A "mock answer" placeholder written into the
   vector DB when S3 creds were missing silently poisoned retrieval for days. If a pipeline can't
   fetch real input, mark the job `failed` with the error stored on the record. No dummy text, no
   fake success states, no `confidence: 0.9` from a stub.
2. **Read the actual production logs before theorizing.** Every prod bug in this project was
   solved by `docker compose logs <service> --tail 60`. The app-layer error ("500") is almost
   never the root cause — the upstream service's log is.
3. **Safety checks must be wired in, not just written.** The faithfulness/grounding gate existed
   as a function but was never called from the endpoint. After writing any guard, grep for its
   call site.
4. **Environment parity bites hardest at the managed-service boundary.** Everything that "worked
   locally" and broke in prod broke at: RDS (TLS, extensions, migrations), retired model APIs,
   secrets transport, and browser secure-context APIs. Test those boundaries first.
5. **Every fallback path needs an exit alarm.** If code falls back (local storage, dummy key,
   cache), it must log a loud WARNING with the reason, and the fallback result must be
   distinguishable from the real thing.

---

## 2. AWS / RDS lessons (the expensive ones)

### TLS to RDS — the #1 silent killer
- **Symptom:** `no pg_hba.conf entry for host "...", user "...", database "...", no encryption` → 500s on every DB route.
- **Cause:** RDS requires SSL. The Node `postgres` (porsager/postgres.js) driver does **NOT**
  enable SSL by default. Python `psycopg` defaults to `sslmode=prefer`, so the Python service
  works while the Node service fails — confusing as hell.
- **Fix (do this day one):**
  ```ts
  const isLocalDb = /@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(connectionString);
  const client = postgres(connectionString, isLocalDb ? {} : { ssl: { rejectUnauthorized: false } });
  ```
  (`rejectUnauthorized: false` = encrypted without pinning the RDS CA; fine inside a VPC. Pin the
  CA bundle if traffic leaves the VPC.)

### Postgres extensions don't exist on RDS until you create them
- `db/init.sql` mounted into `/docker-entrypoint-initdb.d/` only runs on a **local container's
  first boot**. RDS never sees it. `CREATE EXTENSION IF NOT EXISTS vector;` must run against RDS
  explicitly — put it in the migration runner (idempotent, warn-don't-fail if unprivileged) and
  keep a manual `db/rds-setup.sql` escape hatch.

### Migrations must be a pipeline step, not a memory
- The lean Next.js standalone runtime image contains **no** drizzle-kit and **no** migration SQL.
  Nothing migrated RDS until we built a dedicated one-shot **migrator image**
  (`Dockerfile.migrate` + programmatic `migrate()` script) run on the EC2 host via
  `docker compose run --rm migrate` **before** `up -d`.
- If the DB was ever migrated by hand, the runner must **baseline** already-applied migrations
  into the tracking table (probe for existing tables/columns) or it will try to re-create tables
  and abort every deploy.
- `set -e` at the top of the deploy script so a failed migration **aborts before** the app
  restarts — prod stays on the old version.
- Docker Compose `pull` **skips profiled services**: if the migrator sits behind
  `profiles: ["migrate"]`, you must `docker compose --profile migrate pull` or `run` will reuse a
  stale local image forever after the first deploy.

### Secrets transport to EC2 (GitHub Actions → SSH)
- `export VAR=...` lines inside `appleboy/ssh-action` scripts get dropped (sudo wrapping /
  non-interactive shells). **Write a literal `.env` file on the server** right before
  `docker compose up`, from the action's `envs:` list.
- **Escape `$` as `$$`** when writing that `.env`: Docker Compose interpolates `$` in env files,
  so a password containing `$` gets truncated → auth failures that look like DB outages.
  ```bash
  echo "DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/\$/$$/g')" > .env
  ```
- Default `appleboy/ssh-action` timeout is ~30s — heavy image pulls die mid-deploy and the script
  silently aborts. Set `timeout: 30m` and `command_timeout: 30m`.

### Misc AWS/Docker
- GHCR image names must be **lowercase**: `${GITHUB_REPOSITORY,,}` in bash, and compute it once.
- No S3? A **shared named volume** (`uploads_data:/app/uploads`) mounted into every container
  that touches files, with a `local://` key prefix, is a fine MVP fallback — but the consumer
  must hard-fail when the file isn't found (see Golden Rule 1).
- Healthchecks on every service + `depends_on: condition: service_healthy` — nginx should depend
  on a *healthy* app, not a started one.
- `docker image prune -af` at the end of each deploy or the EC2 disk fills up.

---

## 3. CI/CD pipeline — the working shape

```
on push/PR:   lint + test (both services) + eval harness (AI gate)
on main only: build & push images to GHCR  →  ssh deploy:
              write .env (escaped) → pull (incl. migrate profile)
              → run migrate (one-shot, set -e) → up -d --remove-orphans → prune
```

Known gaps to fix on the NEXT project from day one (we accepted these for MVP):
- **Tag images with the git SHA** in addition to `:latest` — `:latest`-only means no rollback
  target. Rollback = redeploy previous SHA tag, never rebuild.
- **Staging stage:** auto-deploy `main` → staging stack (same compose, different ports/DB);
  production deploy behind a manual approval (`environment:` with required reviewers, or
  tag-push `v*` trigger). Don't wire `main` → prod directly again.
- **Branch protection** on `main`: PRs only, required status checks, short-lived feature branches
  (trunk-based development).
- **TLS on nginx** (Let's Encrypt/certbot or ALB+ACM) from day one — plain HTTP also breaks
  browser APIs (see §6).

---

## 4. Database & multi-tenancy rules

- Every schema change is a migration file. Never hand-edit the DB — hand-migration is what forced
  the baseline logic in §2.
- Every tenant-data table carries `tenant_id`/`workspace_id`; **every** query, cache key, and
  rate-limit key is tenant-scoped. Keep a test proving cross-tenant retrieval returns nothing.
- Store embeddings as `vector(N)` where **N is pinned in one place** and referenced by both the
  schema and the embedding calls (env: `EMBEDDING_DIM`). A dimension mismatch is a runtime error
  at insert/query time, not build time.
- API responses: `{ data }` on success, `{ error: { code, message } }` on failure. Never leak
  stack traces to clients; log them server-side.

---

## 5. AI / RAG pipeline rules

- **Model retirement is a production outage class.** `text-embedding-004` was retired and every
  chat call 404'd (`models/X is not found for API version v1beta`). Make model IDs env-configurable
  (`EMBEDDING_MODEL`, `LLM_MODEL_CHEAP`) with sane defaults so a retirement is a config change,
  not a code deploy. Current known-good: `gemini-embedding-001` with
  `output_dimensionality=768`, `gemini-2.5-flash` for generation.
- **Query and document embeddings must share model + dimension.** Changing the embedding model
  invalidates every stored vector — plan a re-ingest, don't mix spaces.
- `gemini-embedding-001` on the Gemini API does **not** accept batched `contents` — embed
  one-per-request in the background worker (loop is fine there).
- **Grounding gate:** generate → check confidence threshold → run faithfulness check (LLM judge)
  → escalate on failure. Never emit an ungrounded answer. And verify the gate is actually called
  (Golden Rule 3).
- **Cache invalidation is part of ingestion.** Cached answers (24h TTL) served stale/poisoned
  results long after the underlying bug was fixed — the "it's still broken" ghost. Invalidate the
  tenant's answer cache at the end of every successful ingest. When debugging "no change after
  fix," suspect the cache first and test with a *fresh* query.
- Re-ingest must be **idempotent**: delete the document's old chunks before inserting new ones.
- No-API-key/dummy mode must return `confidence 0.0` (escalate), never a confident fake.

---

## 6. Next.js / React production gotchas

- **Server → Client boundary:** passing `onClick` from a Server Component to a client component
  throws `Event handlers cannot be passed to Client Component props` in production renders.
  Extract interactive bits into small `"use client"` components (a `LogoutButton`-style wrapper).
- **Base UI (`@base-ui/react`):** triggers (`MenuPrimitive.Trigger`, etc.) already render a
  native `<button>`. Wrapping your `<Button>` inside them = nested buttons = invalid HTML and
  flaky clicks. Use the **`render` prop** to merge: `<Trigger render={<Button …>…</Button>} />`.
  (`asChild` is the Radix pattern and **breaks the Base UI build** — don't mix them up.)
- **`navigator.clipboard` requires a secure context** (HTTPS/localhost). Over plain HTTP it
  rejects silently. Ship a `document.execCommand("copy")` fallback + error toast — or better,
  serve HTTPS (§3).
- **Hydration mismatch (React #418)** in prod can be caused by browser extensions injecting DOM
  before hydration — `suppressHydrationWarning` on `<html>`/`<body>` is the accepted fix.
- **Standalone Docker builds need dummy env vars** at build time to pass env validation
  (`zod` schema): set placeholder `DATABASE_URL`, secrets, etc. in the builder stage.
- Runtime image = `.next/standalone` + `.next/static` + `public` only. Anything else you need at
  runtime (migrations!) needs its own image or explicit COPY.
- Env validation with zod at startup (`lib/env.ts`) is worth it — fails fast with a named list of
  missing vars instead of undefined-behavior downstream.

---

## 7. Day-one checklist for the next project

Copy-paste and check off before writing feature code:

- [ ] `PLAYBOOK.md` copied in; referenced from `CLAUDE.md` + `GEMINI.md`
- [ ] `docker-compose.yml` (local: pg+extensions image, redis, services, healthchecks)
- [ ] `docker-compose.prod.yml` with `${VAR}` env passthrough + shared volumes + migrate service behind a profile
- [ ] Node DB client: conditional `ssl: { rejectUnauthorized: false }` for non-local hosts
- [ ] Migrator image + baseline-aware migrate script; deploy runs it before `up -d` with `set -e`
- [ ] `db/rds-setup.sql` manual escape hatch (extensions, cleanups)
- [ ] CI: lint + test + eval gates → build/push (SHA **and** latest tags) → deploy
- [ ] Deploy script: literal `.env` written with `$`→`$$` escaping; 30m SSH timeouts
- [ ] Staging stack + manual prod approval (don't skip this time)
- [ ] TLS on nginx from day one
- [ ] Branch protection on `main`; feature branches + PRs
- [ ] Model IDs + embedding dims in env vars, not hardcoded
- [ ] Tenant isolation test green before the first feature ships
- [ ] `.env.example` kept in sync with what code actually reads (audit it — ours drifted)
- [ ] Billing alarm in CloudWatch

---

## 8. Debugging prod — the 5-minute triage that always worked

```bash
cd ~/deflekt   # or the new project dir on EC2
docker compose -f docker-compose.prod.yml ps                       # anything unhealthy/restarting?
docker compose -f docker-compose.prod.yml logs app --tail 60      # app-layer error + digest
docker compose -f docker-compose.prod.yml logs ai-service --tail 60   # usual root cause
docker compose -f docker-compose.prod.yml logs ai-worker --tail 60    # ingestion failures
docker compose -f docker-compose.prod.yml exec <svc> sh -c 'echo ${KEY:0:4}...'  # secret present?
```
Order of suspicion, based on history: upstream service logs → env/secret transport → TLS/managed
service boundary → retired/renamed model API → stale cache → actual code bug. It was almost never
the code you just wrote.
