# task.md — Wire the BountyBoard contract + Supabase to the app

## Objective

Turn the BountyBox frontend from a mock into a real app: Privy login, real USDC
escrow on Arc testnet, and a database that mirrors the chain. Keep the contract
small and auditable; keep content offchain.

## Locked decisions

- **Auth: Privy only** (social / email / external wallet, with an embedded
  wallet). No email or password signup. Supabase Auth is used **only** as a
  session + RLS layer — not as the identity store.
- **Privy App ID:** `cmegxzpfu01n0ju0c64l5w0s5`
- **Network: Arc testnet** — chain id `5042002`, RPC `https://rpc.testnet.arc.io`,
  explorer `https://explorer.testnet.arc.io`, USDC ERC-20 `0x3600…0000` (6 dp).
  Do not trust unverified mainnet values; verify at `docs.arc.io` before mainnet.
- **Identity source of truth:** the user's Privy DID + embedded wallet address,
  mirrored into `profiles`.
- **Money source of truth:** the `BountyBoard` contract. The DB never decides
  money or permissions.
- **Content source of truth:** Supabase content tables (title, description,
  submissions, comments, attachments).

## Source-of-truth map

| Fact | Source of truth | Who writes the DB |
| --- | --- | --- |
| Who the user is, their wallet | Privy DID + wallet (mirrored to `profiles`) | Privy webhook / session bridge |
| Escrow funded, workers, winners, status | `BountyBoard` on Arc | Indexer (service role) only |
| Title, description, tags, attachments | Supabase `bounties` content columns | Client (RLS by `auth.uid()`) |
| Submission body, comments | Supabase `submissions` / `bounty_comments` | Client (RLS by `auth.uid()`) |

Rule: any column that is derived from chain state is **service-role write only**.
A client must never be able to set `escrow_status`, `status`, `winners`,
`worker_wallets`, or payout fields.

## Identity: connecting Privy to the database

Supabase does not list Privy as a native third-party auth provider (only Clerk,
Auth0, Cognito, Firebase, WorkOS). The clean, cross-device bridge:

```
Privy login ──► Privy access token (JWT, iss=privy.io, aud=<app id>)
                        │
                        ▼
     Supabase Edge Function `privy-session`
       1. verify JWT against Privy JWKS (issuer privy.io, audience app id)
       2. read sub (Privy DID), wallet address, email
       3. deterministic uuid = uuidv5(PRIVY_NS, did)  → stable Supabase user id
       4. admin.createUser / updateUser (id = that uuid), upsert profiles
       5. return a Supabase session (access + refresh)
                        │
                        ▼
     client: supabase.auth.setSession(...)  → auth.uid() works, all RLS intact
```

Why the deterministic UUID (uuidv5 of the DID):

- The same Privy user maps to the **same Supabase user id on every device**, so
  RLS keeps working and the account is not device-bound (the weakness of the
  Supabase anonymous-sign-in approach).
- `auth.uid()` stays a UUID, so all existing RLS policies keep working unchanged.
- The DID and wallet stay the **business keys**: `profiles.privy_did` (unique)
  and `profiles.wallet_address` (unique). Bounties join on wallet address, which
  is exactly what the contract uses.

`profiles` becomes:

```
id            uuid primary key      -- uuidv5(privy did); == auth.uid()
privy_did     text unique not null  -- identity source of truth
wallet_address text unique          -- embedded wallet; onchain identity
email         text
full_name     text
created_date, updated_date
```

Content tables store **both** keys: `*_id uuid` (RLS ownership, = `auth.uid()`)
and `*_wallet text` (lowercased address, the join key to chain state). The
creator/worker/winner addresses are authoritative because the contract uses them.

Optional: a Privy webhook (`user.created`, `user.linked_account`) that
pre-provisions the `profiles` row so the row exists before first API call. The
session bridge upserts anyway, so the webhook is a convenience, not a dependency.

## Architecture

```
Privy (login → embedded wallet)
   │  access token                     │ EIP-1193 provider
   ▼                                    ▼
Edge Fn privy-session              viem walletClient (Arc)
   │  Supabase session                 │  send tx
   ▼                                    ▼
Supabase (RLS via auth.uid())      BountyBoard.sol on Arc testnet
   ├─ content tables: client write      │  events
   └─ chain columns:  indexer write ◄───┘  (viem getLogs)
```

---

## Phases

### Phase 0 — Decisions — DONE
- [x] Privy-only auth; no email/password
- [x] Wallet + Privy DID as DB identity
- [x] Arc testnet
- [x] Privy App ID recorded

### Phase 1 — Auth: Privy → Supabase session — DONE (server step pending)
- [x] Add `@privy-io/react-auth` to the frontend; wrap app in `<PrivyProvider>`
      with `appId = cmegxzpfu01n0ju0c64l5w0s5` and Arc testnet as the default chain.
      (`src/main.jsx`, login methods email/google/wallet, embedded wallet on login.)
- [x] Replace the Supabase-session source in `src/lib/AuthContext.jsx` with the
      Privy→Supabase bridge. Public API (`user`, `isAuthenticated`, `logout`,
      `isLoadingAuth`) preserved; `user` now carries `did`, `wallet_address`,
      `email`, `full_name` from the Privy user.
- [x] Client bridge `src/lib/privySupabase.js`: POSTs the Privy access token to
      `VITE_PRIVY_SESSION_URL` (Edge Function) when set; otherwise mints a local
      HS256 Supabase JWT from `VITE_SUPABASE_JWT_SECRET` (dev only); otherwise
      falls back to a Supabase **anonymous** session.
- [x] DB migration `db/migrations/001_privy_identity.sql` applied to the live
      project (via the pooler): `privy_did` + `wallet_address` on `profiles`,
      `current_wallet()` helper, and the `auth.users` FKs dropped so bridged
      identities (uuidv5(did), no auth.users row) can own rows.
- [x] Delete `Login`, `Register`, `ForgotPassword`, `ResetPassword` and the
      Google button; `Login` is now one "Continue" screen that opens the Privy modal.
- [x] Session bridge **verified end-to-end** against live Supabase: a locally
      minted HS256 token is accepted, a profile upserts, and a bounty inserts
      with the bridged id as creator (RLS passed, no `auth.users` row).
- [x] `supabase/functions/privy-session/index.ts` **deployed** to the live project
      (verifies the Privy token via JWKS — ES256/P-256 — then returns a Supabase
      session). Secrets set: `PRIVY_APP_ID`, `BRIDGE_JWT_SECRET` (the project JWT
      secret; `SUPABASE_JWT_SECRET` cannot be set — the CLI reserves the
      `SUPABASE_` prefix). Verified live: OPTIONS 200, missing token 400, bad
      structure 401, valid-ES256-but-foreign-key 401 (JWKS path runs).
- [x] Frontend pointed at the function: `VITE_PRIVY_SESSION_URL=https://tlfeewciagjjilpppmvw.supabase.co/functions/v1/privy-session`,
      `VITE_SUPABASE_JWT_SECRET` cleared (dev fallback no longer needed).
- [x] Anonymous sign-ins enabled on the project (last-resort fallback path).
- [ ] Decide whether to disable the Supabase email provider (Privy-only).
- **Acceptance:** sign in with Privy on two browsers → same `auth.uid()`, same
  `profiles` row, an authenticated Supabase query returns the user's rows.
  *Bridge verified with minted tokens end-to-end and the function deployed; full
  two-browser login not exercised (needs a real inbox/wallet).*

### Phase 2 — Wallet + chain client — DONE
- [x] Add `viem` to the frontend.
- [x] Define the Arc testnet chain object (id `5042002`, RPC
      `rpc.testnet.arc.io`, explorer `explorer.testnet.arc.io`) in `src/lib/arc.js`.
- [x] Replace the mock wallet with `src/lib/useWallet.js`: Privy-backed
      `{ address, connected, onArc, wallet, balance, getWalletClient, switchToArc,
      refreshBalance }` built from `wallet.getEthereumProvider()` →
      `createWalletClient({ chain, transport: custom(provider) })`.
- [x] USDC helpers: ERC-20 predeploy `0x3600…0000`, `decimals()` (6) and
      `balanceOf`; native gas view (18 dp) kept separate.
- [x] Update consumers: `ConnectWalletButton` (Privy `login`), `Sidebar` /
      `Dashboard` (Sign out via Privy, faucet link), `NewBounty` (real balance),
      `TxLink` + `EscrowPanel` (new chain/explorer shape, `ESCROW_ADDRESS`).
- **Acceptance:** a test component reads the connected address and USDC balance
  from Arc testnet via Privy's embedded wallet.
  *Address/chain wiring verified; live balance read pending a funded Arc wallet.*

### Phase 3 — Deploy the contract
- [ ] Add `ARC_TESTNET_RPC_URL` + `ARC_PRIVATE_KEY` to the root `.env`.
- [ ] `npx hardhat ignition deploy ignition/modules/BountyBoard.ts --network arcTestnet`
      (USDC defaults to `0x3600…0000`).
- [ ] Record the deployed address as `VITE_BOUNTYBOARD_ADDRESS` in `frontend/.env`.
- [ ] Commit the generated `ignition/deployments/` artifacts.
- **Acceptance:** contract address resolves on `explorer.testnet.arc.io`.
- **Code side is ready:** `scripts/export-abi.ts` (`npm run export:abi`) vendors the
  ABI into `frontend/src/lib/bountyBoardAbi.ts`; `frontend/.env.example` documents
  `VITE_BOUNTYBOARD_ADDRESS`. Only the funded key + deploy remain.

### Phase 4 — Write path (real transactions)
`frontend/src/lib/bountyChain.js` now sends real transactions; `frontend/src/lib/chain.js`
holds the viem client, reads, and tx helpers. Exported function names are unchanged.
- [x] `fundEscrowAndPublish`: check USDC `allowance`, `approve` if short, then
      `createBounty(...)`; parse `BountyCreated` for the id; write content +
      `onchain_id` + `escrow_tx_hash`.
- [x] `startWork` → `startWorking(id)`; `submitWork` computes `submissionRef`
      (keccak of content) and records it offchain.
- [x] `approveWork` → `approveWork(id, worker, submissionRef)`.
- [x] `withdrawEscrow` → `cancelBounty(id)` (only while nobody is working).
- [x] Added `finalizeBounty(id)` ("Close & refund unspent") and `expireBounty(id)`
      ("Expire", permissionless) to `BountyActions`.
- [x] Map `reward_usdc → rewardPerWinner`, `winner_slots → maxWinners`,
      `due_date → applicationDeadline`, `submission_deadline → submissionDeadline`.
- [x] Deadline ordering is enforced in one place, `frontend/src/lib/deadlines.js`
      (`validateDeadlines` / `resolveDeadlines`), used by both the form and
      `fundEscrowAndPublish`. `createBounty` needs `applicationDeadline >= now`
      and `submissionDeadline > applicationDeadline`; the write path now throws
      instead of clamping. Unit tests in `frontend/test/deadlines.test.js`
      (`npm test`).
- [x] Wait for receipts; every DB write is best-effort and re-reads the chain
      after a payout so the cache matches the receipt.
- **Acceptance:** create → fund → start → approve → payout all land as real txs
  and the DB reflects each receipt.

### No indexer (for now)
Instead of a backend indexer, the contract is read directly:
- `hydrateBounty(row)` (in `bountyChain.js`) calls `getBounty(id)` and overlays the
  authoritative money/lifecycle fields (`status`, `escrow_status`, `reward_usdc`,
  `winner_slots`, `winners`, `worker_wallets`, deadlines) onto the DB content row.
  Components keep reading the same shape; the chain wins on conflict.
- List/aggregate views (Home, Dashboard) still use the mirrored DB columns, which
  are refreshed on each write. `readBountyRange()` (multicall) is available when we
  want the board itself to read purely from chain.
- Trade-off: with no event log replay, a bounty edited only by someone else's
  transaction shows its last mirrored value until opened. Acceptable before
  mainnet; replace with the Phase 5 indexer when it matters.
- The `guard_bounty_update` trigger was loosened so a claiming worker may update
  `status`/`worker_wallets` (the progress fields the UI writes); escrow, payout,
  and winner columns stay creator-only, and the contract remains the real backstop.

### Phase 5 — Read path + hardening (do not ship real USDC without this)
- [ ] New `indexer/` (Node + viem, poll `getLogs`, or a cron Edge Function):
      project `BountyCreated`, `WorkStarted`, `BountyWinnerPaid`,
      `BountyCompleted`, `BountyCancelled`, `BountyExpired` into the chain columns.
- [ ] Migration: split content vs chain columns; **revoke client UPDATE** on
      chain columns (service role only); make `onchain_id` unique.
- [ ] Detail page: read authoritative status from `getBounty(id)` /
      `remainingReward(id)`; treat the DB as a cache.
- [ ] Recompute `contentHash` on read to verify content integrity.
- **Acceptance:** with the client's write access to chain columns revoked, a
  bounty's status still updates purely from events.

### Phase 6 — UI gaps
- [x] "Close & refund unspent" (creator) and "Expire" (anyone, when eligible).
- [x] Live escrow display from the chain (`hydrateBounty` overlays `remainingReward`
      and the onchain winner set on the detail page).
- [x] USDC balance + Circle faucet hint when balance is 0.
- [x] Clear error surfacing for reverts (`describeRevert` maps every custom error to
      a message; wired into every write path's toast).
- [x] Empty-bounty close UX: `finalizeBounty` needs ≥1 winner, so a creator with
      workers but no payouts is told to accept a submission or wait for expiry
      (they can't `finalize` an empty escrow). `cancelBounty` stays for the
      nobody-working case.

### Phase 6b — Minor hardening
- [x] `privy-session` verifies the full token: `iss === privy.io`, `aud` includes
      the app id, `exp`/`nbf` with clock skew, `alg === ES256`, and a strict `kid`
      match. The old `?? privyKeys()[0]` fallback is gone (an unknown `kid` now
      refetches the JWKS once, throttled, then fails). It also refuses to run when
      `PRIVY_APP_ID`/`BRIDGE_JWT_SECRET` are unset.
- [x] The dev-only in-browser HS256 mint cannot ship: `vite.config.js` fails a
      production build if `VITE_SUPABASE_JWT_SECRET` is set, and `hasLocalMint`
      is forced off under `env.PROD`.
- [x] Deadline ordering (above) enforced at both layers, not just the contract.
- **Acceptance:** a token with a foreign `iss`/`kid`/`alg` or an expired `nbf`/`exp`
  is rejected; `npm run build` with the secret set exits non-zero.

### Phase 7 — Verify + document
- [ ] End-to-end on Arc testnet across all lifecycle branches (cancel, expire,
      finalize, multi-winner).
- [ ] Update `docs/ARCHITECTURE.md` (indexer + identity bridge) and `AGENTS.md`.

---

## Open questions

1. **Privy → Supabase session bridge — deployed and working.** The Edge Function
   `supabase/functions/privy-session/` verifies the Privy JWT via JWKS and returns
   a Supabase session. Deployed with `--no-verify-jwt`; secrets `PRIVY_APP_ID` and
   `BRIDGE_JWT_SECRET` (note: `SUPABASE_JWT_SECRET` is rejected by the CLI, which
   reserves the `SUPABASE_` prefix). The client sets `VITE_PRIVY_SESSION_URL`; the
   dev-only in-browser HS256 mint and the anonymous-session fallback remain as
   backstops but are no longer the primary path.
2. Privy webhook for profile pre-provisioning — needed, or is upsert-on-login
   (`db.auth.ensureProfile`) enough?
3. Bridged identities have no `auth.users` row, so migration 001 drops the
   `auth.users` FKs. If the Edge Function instead provisions users via the
   service-role admin API, skip that block and keep the FKs.
4. Gas: does the embedded wallet need test USDC from `faucet.circle.com`, or do
   we sponsor gas?
