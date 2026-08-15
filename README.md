# Re-Sort Mobile Web App

Re-Sort is a standalone, local-first mobile web application. It is **not a ChatGPT Site** and has no Sites hosting dependency. The workspace is a pnpm monorepo with:

- `apps/web`: Vue 3, Vite, Vue Router, Pinia and Axios.
- `apps/api`: NestJS REST API with Swagger, mock image identification, deterministic Germany rules, quota, history, analytics and fake checkout.
- `packages/contracts`: shared strict TypeScript DTOs.
- Optional PostgreSQL 17 schema/seed scripts and Docker Compose configuration.

The default `DATA_MODE=memory` makes the full demo run without Docker or an OpenAI key. Restarting the API resets local demo data.

## Quick start

Requirements: Node.js 22+ and pnpm 11+.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

The web server and API both bind to `0.0.0.0`:

- Mobile web app: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Swagger: `http://localhost:3000/api/v1/docs`
- Ready health: `http://localhost:3000/api/v1/health/ready`

Demo account:

- Username: `demo`
- Password: `Demo12345!`

The frontend logs into this account automatically. If the API is temporarily unavailable, the UI stays usable with a clearly identified local fallback dataset.

## Connect ngrok

Keep `pnpm dev` running, then expose the web port:

```bash
ngrok http 5173
```

Open the HTTPS forwarding URL on your phone. Vite accepts the forwarded hostname and proxies `/api/*` to NestJS on port 3000, so only one tunnel is required. The HTTPS tunnel also allows browsers to request camera permission.

Never expose the included demo credentials or default JWT/database secrets on a public production deployment.

## Optional PostgreSQL

Docker is optional for the current memory-mode demo. When Docker is installed:

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
```

The schema is prepared for users, plans, subscriptions, quota, scans and waste records. The running demo remains in memory mode until a PostgreSQL repository adapter is selected with `DATA_MODE=postgres` in a future production hardening pass.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The detailed product requirements and architecture reference are in [CODEX_MASTER_BUILD_SPEC.md](./CODEX_MASTER_BUILD_SPEC.md).

## Product disclosures

- `AI_MODE=mock` never calls an external model and returns deterministic yogurt-cup identification for the demo flow.
- Household accounts, physical Re-Sort Bin connectivity and real payment processing are display-only or simulated.
- Carbon output is an indicative end-of-life estimate based on a versioned waste-treatment proxy, not a full product life-cycle assessment.
- Germany-wide sorting guidance is informational; municipal rules can differ.
