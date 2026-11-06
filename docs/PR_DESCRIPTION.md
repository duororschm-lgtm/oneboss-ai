## What changed

Implement the A-group Core backend from an empty repository: shared contracts, Supabase-compatible migrations and RLS, server-priced quotes/add-ons/orders, isolated sandbox and operator-verified manual payments, transactional entitlements, refunds, durable MiMo jobs, scoped revisions, publication/rollback, private artifact delivery and acceptance.

B-owned marketing/studio UI and site/poster rendering remain external integrations. The adapter fails explicitly until B connects it. No live payment provider or fake completed production artifacts are included.

## Validation

- TypeScript and Next.js production build pass.
- 34 unit tests and 21 real PostgreSQL integration tests pass.
- Ten concurrent payment confirmations create one event and one entitlement.
- RLS, cross-tenant reads, direct payment writes, amount tampering, refunds, lease recovery, scoped edits and failed publication rollback are covered.
- Both migrations execute and repeat successfully; production dependency audit reports no known vulnerabilities.
- Actual local production HTTP checks pass for health, plans and unauthorized access. External B module loading was tested with an explicitly non-production wiring stub.

## Remaining integration prerequisites

Real MiMo smoke checks now pass for JSON, native read-only tool calling and image color recognition after secure credential injection. Native tool calls are requested separately from JSON text mode and validated against a strict allowlist; provider request IDs are recorded without secrets. Full Supabase Auth/Storage, B renderer, public HTTPS/mobile/Chinese typography/QR and delivery acceptance remain unverified. See docs/demo-proof.md and docs/RUNBOOK.md. Shared contract v1 awaits B review.

No API keys, passwords, .env files, node_modules, private files or generated artifacts are included. .env.example contains empty placeholders only.

## Hosted database initialization

Provide an atomic, credential-free SQL Editor bootstrap generated from both versioned migrations. Matching migration history is a no-op; unrelated public tables or different history are rejected. The integration suite exercises the generated bootstrap with automatic RLS enabled and verifies data preservation and hashes. CI rejects stale generated SQL.

Hosted Auth settings and private Storage upload/sign/download/access-denial are verified. Native PostgreSQL TCP remains unavailable in this cloud environment; the hosted bootstrap has now been executed in the project's SQL Editor and HTTPS checks confirm public plans/add-ons and anonymous access denial, while application database connectivity remains unverified.
