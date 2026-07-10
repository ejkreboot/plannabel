# Plannabel

A cheerful summer schoolwork tracker: subjects, each with their own to-do checklist. Runs as a Cloudflare Worker serving static assets, backed by Cloudflare D1, locked behind Cloudflare Access (email one-time PIN).

## Local development

```
npm install
npx wrangler login          # first time only, opens a browser
npx wrangler d1 create plannabel-db
```

Copy the `database_id` from the output above into `wrangler.jsonc` (replace `REPLACE_WITH_DATABASE_ID`).

```
npm run db:migrate:local
npm run dev
```

Open the printed `http://localhost:8787` URL. Locally there's no Cloudflare Access in front of the app, so the greeting just won't show a name — everything else works the same.

## Deploy

```
npm run db:migrate:remote   # applies the schema to the real D1 database
npm run deploy
```

`wrangler deploy` prints your live URL, something like `https://plannabel.<your-subdomain>.workers.dev`.

## Lock it down with Cloudflare Access (one-time PIN via email)

Do this once, in the Cloudflare dashboard, after your first deploy:

1. **Zero Trust → Settings** — pick a team name (this turns on Zero Trust on the free plan).
2. **Zero Trust → Settings → Authentication** — confirm "One-time PIN" is enabled as a login method (it's on by default).
3. **Zero Trust → Access → Applications → Add an application → Self-hosted.**
   - Application domain: your `workers.dev` URL from `wrangler deploy`.
4. Add a policy: **Action = Allow**, **Include → Emails** → add the family email addresses that should be able to log in.
5. Save.

From then on, visiting the app prompts for an email address, then a PIN sent to that inbox — no passwords, no accounts to manage. The app itself reads the verified email from the `Cf-Access-Authenticated-User-Email` header to show a personalized greeting; no app-level login code is involved.

## Project layout

- `worker/index.js` — the Worker: serves the JSON API under `/api/*`; static files under `public/` are served automatically for everything else.
- `public/` — the single-page app (plain HTML/CSS/JS, no build step).
- `migrations/` — D1 schema.
