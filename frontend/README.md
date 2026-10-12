# BountyBox frontend

Vite + React UI for the BountyBox escrow platform. It talks to Supabase for
content and auth, and to the `BountyBoard` escrow contract on Arc for funding
and payouts.

## Setup

```bash
npm install
cp .env.example .env   # then fill in the Supabase values
npm run dev            # http://localhost:12000
```

## Environment

`.env` (gitignored) needs three values from your Supabase project's
**Settings → API**:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (safe in the browser; RLS enforces access) |
| `VITE_SUPABASE_BUCKET` | Storage bucket for attachments (default `box`) |

The database schema lives in [`../db/supabase_schema.sql`](../db/supabase_schema.sql).
Apply it once with `psql "$SUPABASE_DB_URL" -f db/supabase_schema.sql`, or paste
it into the Supabase SQL editor. It is idempotent and creates the tables, the
private `box` storage bucket, and the row-level security policies.

## Container

The image builds without configuration and is served by nginx:

```bash
docker build -t bountybox-frontend .
docker run -p 8080:80 \
  -e VITE_SUPABASE_URL=... \
  -e VITE_SUPABASE_ANON_KEY=... \
  -e VITE_PRIVY_APP_ID=... \
  bountybox-frontend
```

Vite inlines `import.meta.env` at build time, so the same `VITE_*` names are read
at run time instead: `docker-entrypoint.sh` writes them to `/env.js`, which
`index.html` loads and `src/lib/env.js` exposes as `window.__ENV__`. Build-time
values, when present, win. Do not pass `VITE_SUPABASE_JWT_SECRET` to the
container — it is the dev-only in-browser mint.


## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — JS type check

## Data layer

`src/api/db.js` is a thin adapter over `@supabase/supabase-js` that keeps the
call shapes the pages already use (`db.entities.Bounty.filter(...)`,
`db.auth.me()`, `db.integrations.Core.UploadPrivateFile(...)`). `src/lib/bountyChain.js`
is the single seam between the UI and the escrow contract; swap its mock
implementations for real `ethers`/`viem` calls when the contract is deployed.
