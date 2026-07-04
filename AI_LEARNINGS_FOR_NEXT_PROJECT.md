# AI Context & Memory for Next Project

> **Agent Instructions:** 
> Read this file before initializing, planning, or writing deployment, CI/CD, AWS, database, or AI code in this new project. This document contains critical lessons learned through extensive trial and error on the previous MVP to ensure smooth development and deployment. 
> Follow these practices strictly to prevent repeating past mistakes.

---

## 1. AWS & RDS (Database) Deployments
- **RDS requires SSL/TLS by default:** Do NOT forget to configure SSL for database connections in production. The Node.js `postgres` driver does not enable SSL by default (unlike Python). 
  - **Rule:** Conditionally set `ssl: { rejectUnauthorized: false }` for any connection outside of `localhost`/`127.0.0.1`.
- **Database Extensions (`pgvector`):** `db/init.sql` mounted in Docker does NOT run against AWS RDS. Extensions like `pgvector` must be created explicitly via a migration script or a manual `rds-setup.sql` script that runs against the production RDS instance.
- **Migrating Production Data:** The lean Next.js standalone Docker image lacks migration tools. 
  - **Rule:** Create a dedicated `Dockerfile.migrate` (a one-shot migrator container). This container must be run in the CI/CD pipeline on the EC2 host *before* starting the main app containers (`docker compose run --rm migrate`). 
  - If the database was ever manually modified, migrations must "baseline" existing tables to prevent recreating them and crashing deployments.

## 2. CI/CD Pipeline Practices
- **Deployment Safety (`set -e`):** In the deployment script, ALWAYS use `set -e` so that if the database migration fails, the deployment aborts *before* restarting the app. The production environment should remain on the old stable version.
- **Handling Secrets on EC2:** When passing secrets to an EC2 instance via SSH actions (like `appleboy/ssh-action`), `export VAR=...` often gets dropped. 
  - **Rule:** Write a literal `.env` file on the server. Escape `$` signs as `$$` to prevent Docker Compose from incorrectly interpolating passwords or tokens.
  - Example: `echo "DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/\$/$$/g')" > .env`
- **SSH Timeouts:** Heavy Docker image pulls will kill the default SSH action timeout (which is typically ~30s). 
  - **Rule:** Set `timeout: 30m` and `command_timeout: 30m` for SSH deployment actions.
- **Docker Profiles:** If the migrator container is behind a `profile: ["migrate"]`, you MUST explicitly pull it (`docker compose --profile migrate pull`), otherwise the server will reuse a stale local image forever.
- **Image Tagging:** Tag Docker images with both `:latest` and the `GITHUB_SHA`. `:latest` alone makes rollbacks impossible.

## 3. Code, Framework, & Multi-Tenancy Rules
- **Multi-Tenancy is Strict:** Every tenant-data table MUST carry a `tenant_id` (or `workspace_id`). Every single database query, cache key, and rate limit MUST be scoped by this ID.
- **Fail Loudly (No Mock Data):** If an external resource (like an S3 bucket or an API) fails, the system MUST throw an error or mark the job as failed. NEVER fabricate mock data, fallback text, or fake success states (e.g., dummy embeddings or confidence scores). Fake data silently poisons the database and destroys retrieval accuracy.
- **Strict Environment Validation:** Use a library like `zod` to validate all environment variables at startup. Let the app crash immediately with a clear missing-variable message rather than causing undefined behavior downstream.
- **React Server vs Client Components:** Passing `onClick` or other interactive handlers from a Server Component to a Client Component in Next.js will crash in production. Extract interactive elements into small `"use client"` wrapper components.
- **HTTPS & Secure Contexts:** Browser APIs like `navigator.clipboard` will silently fail over plain HTTP. Serve the application over HTTPS from day one (using Let's Encrypt/nginx or an AWS ALB).

## 4. Debugging & AI System Practices
- **Always Check Logs First:** If the app throws a 500 error, the root cause is almost always in the upstream service (e.g., the AI worker or the FastAPI service). Do not theorize; check the logs: `docker compose logs <service> --tail 60`.
- **Cache Invalidation:** If using a semantic cache (like Redis), it MUST be invalidated whenever the underlying data changes (e.g., during re-ingestion of documents). Stale caches cause "ghost bugs" where fixes appear to not work.
- **Model Dependencies:** Treat LLM/Embedding model APIs as ephemeral. Do not hardcode model IDs (e.g., `text-embedding-004`). Pass them via environment variables so model deprecations can be handled via config changes rather than code deployments.
- **Grounding Gate:** Never emit an ungrounded AI answer. Use a confidence threshold and an LLM judge. If the check fails, abstain and escalate to a human. Ensure this gate is explicitly invoked in the core `/chat` endpoint.

---
*Created automatically to preserve institutional knowledge from the Deflekt MVP.*
