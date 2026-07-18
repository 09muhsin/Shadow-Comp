# Shadow Company

Shadow Company turns a business brief into an editable, evidence-gated business report with sourced research, scenario analysis, a downloadable PDF, and optional private report archiving.

## What it does

- Organizes a written business brief into editable report inputs.
- Keeps assumptions, research, and calculated results visibly separate.
- Generates a decision report, PDF, and downloadable model-data CSV.
- Supports private administrator access to saved PDFs when Supabase storage is configured.

## Run locally

Requirements: Node.js 20+ and npm.

```powershell
npm ci
npm run check
npm start
```

Open [http://localhost:4173](http://localhost:4173).

## Codex hackathon demo mode

Use this mode on your own computer to demonstrate the Codex and GPT-5.6 workflow:

```powershell
codex login
$env:AI_PROVIDER="codex"
$env:HOST="127.0.0.1"
npm start
```

The app will show **CODEX ACCOUNT MODE**. Use the demo to show brief organization, sourced research, editable assumptions, report generation, and PDF download.

## Provider modes

```powershell
# Local deterministic mode: no external research
$env:AI_PROVIDER="local"

# Public deployment: OpenAI API and sourced web research
$env:AI_PROVIDER="openai"
$env:OPENAI_API_KEY="your-server-side-key"
```

Do not commit API keys or deploy a personal Codex login session.

## Deploy on Railway

1. Push this repository to GitHub.
2. In Railway, select **New Project** then **Deploy from GitHub repo**.
3. Select this repository.
4. Set the build command to:

   ```text
   npm ci && npm run build
   ```

5. Set the start command to:

   ```text
   node scripts/serve.mjs
   ```

6. Add these Railway variables:

   ```text
   HOST=0.0.0.0
   AI_PROVIDER=codex
   CODEX_API_KEY=your-server-side-codex-api-key
   ENABLE_WEB_RESEARCH=true
   RESEARCH_TIMEOUT_MS=90000
   ```

   Railway supplies `PORT` automatically; do not set it yourself.

7. Deploy, then use Railway's generated domain or add your custom domain.
8. Open `https://YOUR-RAILWAY-DOMAIN/api/status` to confirm the server is running.

For this Railway setup, the application runs in **CODEX API MODE**. Keep `CODEX_API_KEY` only in Railway variables, never in GitHub or browser code. The local `codex login` mode remains available for your hackathon demo.

## Private report archive

To keep generated PDFs and review them as an administrator, configure the optional private Supabase archive. It adds a password-protected report list at `/admin/reports`.

See [Supabase report archive setup](docs/supabase-setup.md).

## Hackathon submission

Use the repository URL, deployed Railway URL, public YouTube demo, and Codex `/feedback` session ID in your submission.

See [hackathon submission checklist](docs/hackathon-submission.md).

## Verify

```powershell
npm run check
```
