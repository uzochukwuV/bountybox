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
