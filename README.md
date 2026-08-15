# Re-Sort

Re-Sort is a responsive waste-intelligence web app for people in Germany. The demo covers the full product journey: local demo authentication, camera/gallery input, a privacy-aware mock identification flow, deterministic German disposal guidance, an editable disposal-footprint estimate, history and impact views, weekly quota, and a fake Plus checkout.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Demo credentials are pre-filled in the login screen:

- Username: `demo`
- Password: `Demo12345!`

This version intentionally runs in `Demo AI` mode and does not call OpenAI or upload images to an external service. Image inputs are previewed locally in the browser for the simulated flow.

## Verification

```bash
npm run lint
npm run build
npm test
```

The complete product requirements and architecture masterplan are in [CODEX_MASTER_BUILD_SPEC.md](./CODEX_MASTER_BUILD_SPEC.md).

## Important scope notes

- Household accounts, physical Re-Sort Bin connectivity, and real payment processing are explicitly display-only or simulated.
- Carbon values are indicative end-of-life estimates based on a versioned UK waste-treatment proxy, not a full life-cycle assessment or Germany-specific audit.
- Germany-wide rules are informational. Municipal collection rules can differ; users should follow labels and local authority guidance.
