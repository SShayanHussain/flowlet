# @flowlet/web

The Flowlet SaaS shell — Next.js app with the auth + UI kit copied from Deflekt (P1), rebranded to
Flowlet. Owns login/signup/refresh (issues the JWT), the `(public)` / `(auth)` / `(dashboard)`
shell, workspace + member management, and the builder/runs surfaces (net-new, added in later phases).

See the [root README](../README.md) and [`DECISIONS.md`](../DECISIONS.md) for the auth split
(web issues tokens, `api/` verifies them) and the overall architecture.

```bash
npm run dev         # http://localhost:3000
npm run test        # vitest (auth, auth-flows, cross-tenant isolation)
npm run db:generate # drizzle-kit — regenerate shell migrations
```
