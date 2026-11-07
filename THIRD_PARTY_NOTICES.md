# Third-party dependencies

No candidate application source was copied. npm packages retain their upstream license files. Versions below are installed versions; package-lock.json is authoritative.

| Package | Version | Declared license |
|---|---|---|
| @supabase/supabase-js | 2.119.0 | MIT |
| @tailwindcss/postcss | 4.3.4 | MIT |
| jsqr | 1.4.0 | Apache-2.0 |
| jszip | 3.10.2 | (MIT OR GPL-3.0-or-later) |
| lucide-react | 0.468.0 | ISC |
| qrcode | 1.5.4 | MIT |
| next | 16.4.5 | MIT |
| postcss | 8.5.32 | MIT |
| postgres | 3.4.9 | Unlicense |
| playwright-core | 1.65.0 | Apache-2.0 |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| sharp | 0.35.5 | Apache-2.0 |
| tailwindcss | 4.3.4 | MIT |
| undici | 7.30.2 | MIT |
| zod | 4.6.7 | MIT |

JSZip: elect the MIT option of its (MIT OR GPL-3.0-or-later) license. Sharp includes separately licensed libvips/native binaries; preserve their distributed notices. Review transitive and B renderer dependencies before external redistribution.

Project-owned B renderer sources are reused under src/vendor/creative-b. Their source commit, unchanged original directory and integration adjustments are documented in PROVENANCE.md there. The runtime image installs Debian fonts-noto-cjk and fontconfig; retain package notices in the image.

The customer application adopts the existing B brand palette and actual renderer; its Next.js/Auth/API integration does not use B localStorage business fixtures. Runtime publication QA installs Debian Chromium; retain its distributed notices. WeChat APIv3 uses Node crypto and was implemented against official merchant documentation, without copying a third-party SDK.
