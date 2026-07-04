# @flowlet/ui

The shared UI kit copied from Deflekt (P1): Base UI + CVA primitives (`button`,
`card`, `input`, `label`, `badge`, `avatar`, `dropdown-menu`, `separator`,
`sonner`) plus the `cn()` helper and the theme tokens in `globals.css`.

## Where the components currently live

For Phase 0 the primitives physically live in **`web/src/components/ui/`** and are
imported via the `@/components/ui/*` alias. They were **not** lifted into this
package yet, deliberately:

- Extracting into a workspace package requires `transpilePackages` wiring in Next
  and vitest module resolution changes across ~15 already-green files. That risk
  buys nothing while `web/` is the only consumer.
- Deflekt itself kept the kit inside its app for the same reason.

## When to lift them here

Move the primitives into `packages/ui/src` the moment a **second** consumer
appears (e.g. a separate marketing site or an embeddable widget). At that point
add `transpilePackages: ["@flowlet/ui"]` to `web/next.config.ts` and repoint the
`@/components/ui/*` imports.

This is recorded in `DECISIONS.md`.
