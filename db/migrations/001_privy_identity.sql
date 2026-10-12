-- BountyBox migration 001 — Privy identity in Postgres.
--
-- Phase 2. Apply after db/supabase_schema.sql. Idempotent.
--   psql "$SUPABASE_DB_URL" -f db/migrations/001_privy_identity.sql
--
-- Identity source of truth is Privy (the DID). It is mirrored into Postgres as a
-- deterministic uuid v5(did) that becomes `auth.uid()` inside the session the
-- Privy -> Supabase bridge returns, so every existing RLS policy keeps working.

-- ---------------------------------------------------------------------------
-- 1. Identity columns on profiles.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists privy_did      text;
alter table public.profiles add column if not exists wallet_address  text;

create unique index if not exists profiles_privy_did_key
  on public.profiles (privy_did) where privy_did is not null;

create index if not exists profiles_wallet_address_idx
  on public.profiles (lower(wallet_address));

-- ---------------------------------------------------------------------------
-- 2. Wallet-scoped helper, so policies can key on the wallet when present.
-- ---------------------------------------------------------------------------
create or replace function public.current_wallet()
returns text
language sql
stable
as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'wallet', '')), '');
$$;

-- ---------------------------------------------------------------------------
-- 3. Let bridged identities own rows without a matching auth.users row.
--
-- A session minted by the bridge (or the Edge Function) carries a `sub` derived
-- from the Privy DID. Unless the bridge provisions the user through Supabase's
-- admin API, there is no auth.users row, and the FKs below would reject every
-- insert. Because Privy — not Supabase Auth — is the identity authority, these
-- columns become plain uuids; RLS still scopes every row to auth.uid().
--
-- If your bridge DOES create auth.users rows (service role), skip this block.
-- ---------------------------------------------------------------------------
alter table public.profiles        drop constraint if exists profiles_id_fkey;
alter table public.bounties        drop constraint if exists bounties_creator_id_fkey;
alter table public.bounty_workers  drop constraint if exists bounty_workers_worker_id_fkey;
alter table public.submissions     drop constraint if exists submissions_worker_id_fkey;
alter table public.bounty_comments drop constraint if exists bounty_comments_author_id_fkey;
alter table public.bounty_events   drop constraint if exists bounty_events_actor_id_fkey;
