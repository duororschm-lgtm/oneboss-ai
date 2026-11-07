# B renderer source

Imported with project-owner authorization from sibling `onsboss-b`, commit `cdc04e2e914d631b098acb62dab5db30b09add3a` (2026-11-07). Original source remains untouched.

Included: actual React site renderer, SVG poster engine, geometry, QR matrix, composer, design presets and B-side rendering schemas. The primary A contract remains `src/contracts/index.ts`; conversion is isolated in `src/lib/creative/b-mapping.ts`.

Integration changes: Next client boundary, one outer main landmark, browser-QA interaction marker, authorized Storage-image display, production footer wording, site-only CSS extraction and responsive rules. All React imports resolve to A's single installed React instance. No B demo order/localStorage logic or fixture products are imported into the production adapter.

Rendering schemas inside this directory describe B engine inputs, not an alternative API/database contract. Dependencies retain their upstream licenses; see repository THIRD_PARTY_NOTICES.md.
Additional integration fixes: section-type navigation instead of legacy IDs; iframe ownerDocument lookup; reduced-motion-aware scrolling; keyboard tab focus and panel associations; visible focus styling. Public cross-page navigation remains in A adapter, using a server-derived published path. Portrait/square geometry continues to use the original B layout engine.
