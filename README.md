# Re-Sort mobile web app

Re-Sort is a standalone Vue 3 + NestJS mobile web app. It identifies photographed waste with the OpenAI Responses API, asks the user to confirm the identity, then applies a deterministic versioned Germany rule-set to choose the disposal route. Accepted results persist in PostgreSQL and update Home, History and Impact.

The OpenAI key stays in the backend `.env`; it is never shipped to the browser.

## Clean local start

Requirements: Node.js 22+, pnpm 11+, PostgreSQL 17 (local or Docker).

1. Install dependencies and prepare configuration:

   ```bash
   cd '/Users/Khanh Vy/Documents/ChatGPT/buildahub final'
   pnpm install
   cp .env.example .env
   open -a TextEdit .env
   ```

2. In `.env`, set at minimum:

   ```dotenv
   DATA_MODE=postgres
   AI_MODE=openai
   OPENAI_API_KEY=sk-proj-your-real-key
   OPENAI_MODEL=gpt-5.6
   JWT_ACCESS_SECRET=use-a-random-secret-at-least-32-characters-long
   ```

   Generate the JWT secret with `openssl rand -hex 32`. Never paste the OpenAI key into Vue code, browser devtools, screenshots or Git.

3. Start PostgreSQL. With Docker:

   ```bash
   docker compose up -d postgres
   ```

   Or, when PostgreSQL 17 was installed with Homebrew:

   ```bash
   brew services start postgresql@17
   pg_isready -h localhost -p 5432
   ```

4. Create/migrate/seed once. The default connection is `postgresql://resort:resort@localhost:5432/resort`:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

5. Start both servers:

   ```bash
   pnpm dev
   ```

6. Open [http://localhost:5173](http://localhost:5173). API readiness should return `dataMode: postgres` and `aiMode: openai` at [http://localhost:3000/api/v1/health/ready](http://localhost:3000/api/v1/health/ready).

Demo login: username `demo`, password `Demo12345!`. Normal registration also works.

## Live demo checklist

1. Sign in.
2. Open Scan and verify Germany is selected; other countries are visibly Coming soon.
3. Take a photo or choose one, verify the preview, then press **Use this photo**.
4. Review should show **Live OpenAI**, the real object identity and confidence.
5. Accept to generate a grounded OpenAI environmental insight after the deterministic Germany route is resolved, or Reject to persist feedback.
6. Confirm Analysis, Home, History and Impact update.
7. Open Profile → Manage plan and simulate Plus/Free switching. Household and Re-Sort Bin hardware are explicitly Coming soon.

If OpenAI is unavailable during an emergency rehearsal, set `AI_MODE=mock` and restart. The Review/Analysis UI explicitly labels this as demo fallback; it is never presented as live AI.

## Expose the app with ngrok

Only tunnel the Vite web port. Vite forwards same-origin `/api/*` requests to NestJS, so the OpenAI key and API port do not need a public tunnel.

1. Install and authenticate ngrok once:

   ```bash
   brew install ngrok/ngrok/ngrok
   ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
   ```

2. Keep `pnpm dev` running in Terminal 1.

3. In Terminal 2:

   ```bash
   cd '/Users/Khanh Vy/Documents/ChatGPT/buildahub final'
   ngrok http 5173
   ```

4. Open ngrok's `https://...ngrok-free.app` forwarding URL on the phone. Use HTTPS so mobile camera permission is available. Keep the Mac awake and both terminal processes running.

Do not run `ngrok http 3000`; the web app needs the Vite route fallback and `/api` proxy on port 5173.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Key disclosures: subscription checkout is simulated and collects no card input; Household and physical-bin connectivity are Coming soon; the footprint is a versioned end-of-life disposal proxy, not a full product life-cycle assessment; municipal collection rules may differ from Germany-wide guidance.
