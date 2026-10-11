-- BountyBox — Supabase schema (Postgres + Row Level Security + Storage)
--
-- The onchain escrow contract (contracts/BountyBoard.sol) holds money and enforces
-- payout rules. Everything else — bounty briefs, submissions, comments, the
-- lifecycle feed — lives here, keyed by the same bounty id the UI passes around.
--
-- Apply with:  psql "$SUPABASE_DB_URL" -f db/supabase_schema.sql
-- or paste into the Supabase SQL editor. Safe to re-run (idempotent).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created by the auth.users trigger below.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text,
  role         text not null default 'user',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bounties — the escrow-backed job. Money columns mirror the contract state.
-- ---------------------------------------------------------------------------
create table if not exists public.bounties (
  id                  uuid primary key default gen_random_uuid(),
  creator_id          uuid references auth.users (id) on delete set null,
  creator_name        text,
  creator_email       text,
  creator_wallet      text,
  title               text not null,
  description         text,
  category            text,
  complexity          text,
  tags                jsonb not null default '[]'::jsonb,
  attachments         jsonb not null default '[]'::jsonb,
  reward_usdc         numeric not null default 0,
  winner_slots        integer not null default 1,
  status              text not null default 'open',
  escrow_status       text not null default 'funded',
  contract_address    text,
  onchain_id          integer,
  worker_wallets      jsonb not null default '[]'::jsonb,
  winners             jsonb not null default '[]'::jsonb,
  escrow_tx_hash      text,
  escrow_funded_at    timestamptz,
  payout_tx_hash      text,
  payout_at           timestamptz,
  refund_tx_hash      text,
  submission_count    integer not null default 0,
  comment_count       integer not null default 0,
  due_date            date,
  submission_deadline date,
  created_date        timestamptz not null default now(),
  updated_date        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bounty_workers — who clicked "working on it" (the onchain applicant set).
-- ---------------------------------------------------------------------------
create table if not exists public.bounty_workers (
  id            uuid primary key default gen_random_uuid(),
  bounty_id     uuid not null references public.bounties (id) on delete cascade,
  bounty_title  text,
  worker_id     uuid references auth.users (id) on delete set null,
  worker_name   text,
  worker_email  text,
  worker_wallet text,
  status        text not null default 'working',
  share_usdc    numeric,
  started_at    timestamptz not null default now(),
  created_date  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- submissions — the actual work. Only the reference hash goes onchain.
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  bounty_id     uuid not null references public.bounties (id) on delete cascade,
  bounty_title  text,
  worker_id     uuid references auth.users (id) on delete set null,
  worker_name   text,
  worker_email  text,
  worker_wallet text,
  content       text not null,
  attachments   jsonb not null default '[]'::jsonb,
  commit_hash   text,
  status        text not null default 'pending',
  review_note   text,
  created_date  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bounty_comments — discussion thread per bounty.
-- ---------------------------------------------------------------------------
create table if not exists public.bounty_comments (
  id           uuid primary key default gen_random_uuid(),
  bounty_id    uuid not null references public.bounties (id) on delete cascade,
  author_id    uuid references auth.users (id) on delete set null,
  author_name  text,
  author_email text,
  body         text not null,
  created_date timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bounty_events — append-only lifecycle feed (onchain and offchain steps).
-- ---------------------------------------------------------------------------
create table if not exists public.bounty_events (
  id           uuid primary key default gen_random_uuid(),
  bounty_id    uuid not null references public.bounties (id) on delete cascade,
  event_type   text not null,
  actor_id     uuid references auth.users (id) on delete set null,
  actor_name   text,
  actor_wallet text,
  detail       text,
  tx_hash      text,
  block_number integer,
  onchain      boolean not null default true,
  logged_at    timestamptz not null default now(),
  created_date timestamptz not null default now()
);

create index if not exists bounties_creator_idx        on public.bounties (creator_id);
create index if not exists bounties_status_idx         on public.bounties (status);
create index if not exists bounty_workers_bounty_idx   on public.bounty_workers (bounty_id);
create index if not exists bounty_workers_worker_idx   on public.bounty_workers (worker_id);
create index if not exists submissions_bounty_idx      on public.submissions (bounty_id);
create index if not exists submissions_worker_idx      on public.submissions (worker_id);
create index if not exists bounty_comments_bounty_idx  on public.bounty_comments (bounty_id);
create index if not exists bounty_events_bounty_idx    on public.bounty_events (bounty_id);

-- ---------------------------------------------------------------------------
-- updated_date maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists bounties_touch_updated on public.bounties;
create trigger bounties_touch_updated
  before update on public.bounties
  for each row execute function public.touch_updated_date();

-- ---------------------------------------------------------------------------
-- Column guard: RLS lets a claiming worker update the bounty row, but only the
-- creator may touch escrow / payout / winner fields. The contract is the source
-- of truth for money; the table must not drift from it.
-- ---------------------------------------------------------------------------
create or replace function public.guard_bounty_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or old.creator_id = auth.uid() then
    return new;
  end if;
  if (new.creator_id, new.creator_wallet, new.creator_email, new.creator_name,
      new.reward_usdc, new.winner_slots, new.winners, new.worker_wallets,
      new.escrow_status, new.escrow_tx_hash, new.escrow_funded_at,
      new.payout_tx_hash, new.payout_at, new.refund_tx_hash,
      new.status, new.contract_address, new.onchain_id)
     is distinct from
     (old.creator_id, old.creator_wallet, old.creator_email, old.creator_name,
      old.reward_usdc, old.winner_slots, old.winners, old.worker_wallets,
      old.escrow_status, old.escrow_tx_hash, old.escrow_funded_at,
      old.payout_tx_hash, old.payout_at, old.refund_tx_hash,
      old.status, old.contract_address, old.onchain_id)
  then
    raise exception 'Only the bounty creator may change escrow, payout, or winner fields'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists bounties_guard_update on public.bounties;
create trigger bounties_guard_update
  before update on public.bounties
  for each row execute function public.guard_bounty_update();

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever someone signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.bounties        enable row level security;
alter table public.bounty_workers  enable row level security;
alter table public.submissions     enable row level security;
alter table public.bounty_comments enable row level security;
alter table public.bounty_events   enable row level security;

-- profiles: readable by any signed-in user; you may only write your own row.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- bounties: everyone signed in can browse; the creator funds, and a worker who
-- has claimed the bounty may update its progress fields.
drop policy if exists bounties_select on public.bounties;
create policy bounties_select on public.bounties
  for select to authenticated using (true);

drop policy if exists bounties_insert on public.bounties;
create policy bounties_insert on public.bounties
  for insert to authenticated with check (creator_id = auth.uid());

drop policy if exists bounties_update on public.bounties;
create policy bounties_update on public.bounties
  for update to authenticated
  using (
    creator_id = auth.uid()
    or exists (
      select 1 from public.bounty_workers w
      where w.bounty_id = bounties.id and w.worker_id = auth.uid()
    )
  )
  with check (
    creator_id = auth.uid()
    or exists (
      select 1 from public.bounty_workers w
      where w.bounty_id = bounties.id and w.worker_id = auth.uid()
    )
  );

drop policy if exists bounties_delete on public.bounties;
create policy bounties_delete on public.bounties
  for delete to authenticated using (creator_id = auth.uid());

-- bounty_workers: you claim yourself; the creator can update any applicant.
drop policy if exists bounty_workers_select on public.bounty_workers;
create policy bounty_workers_select on public.bounty_workers
  for select to authenticated using (true);

drop policy if exists bounty_workers_insert on public.bounty_workers;
create policy bounty_workers_insert on public.bounty_workers
  for insert to authenticated with check (worker_id = auth.uid());

drop policy if exists bounty_workers_update on public.bounty_workers;
create policy bounty_workers_update on public.bounty_workers
  for update to authenticated
  using (
    worker_id = auth.uid()
    or exists (
      select 1 from public.bounties b
      where b.id = bounty_workers.bounty_id and b.creator_id = auth.uid()
    )
  )
  with check (
    worker_id = auth.uid()
    or exists (
      select 1 from public.bounties b
      where b.id = bounty_workers.bounty_id and b.creator_id = auth.uid()
    )
  );

-- submissions: you write your own; the creator reviews (accept / request changes).
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select to authenticated using (true);

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert to authenticated with check (worker_id = auth.uid());

drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions
  for update to authenticated
  using (
    worker_id = auth.uid()
    or exists (
      select 1 from public.bounties b
      where b.id = submissions.bounty_id and b.creator_id = auth.uid()
    )
  )
  with check (
    worker_id = auth.uid()
    or exists (
      select 1 from public.bounties b
      where b.id = submissions.bounty_id and b.creator_id = auth.uid()
    )
  );

-- comments: anyone signed in can read; you post as yourself.
drop policy if exists bounty_comments_select on public.bounty_comments;
create policy bounty_comments_select on public.bounty_comments
  for select to authenticated using (true);

drop policy if exists bounty_comments_insert on public.bounty_comments;
create policy bounty_comments_insert on public.bounty_comments
  for insert to authenticated with check (author_id = auth.uid());

-- events: append-only feed written by whoever triggered the step.
drop policy if exists bounty_events_select on public.bounty_events;
create policy bounty_events_select on public.bounty_events
  for select to authenticated using (true);

drop policy if exists bounty_events_insert on public.bounty_events;
create policy bounty_events_insert on public.bounty_events
  for insert to authenticated with check (actor_id is null or actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for bounty briefs and submission attachments.
-- Objects are reached through short-lived signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('box', 'box', false)
on conflict (id) do nothing;

drop policy if exists "box read" on storage.objects;
create policy "box read" on storage.objects
  for select to authenticated using (bucket_id = 'box');

drop policy if exists "box insert" on storage.objects;
create policy "box insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'box');

drop policy if exists "box update" on storage.objects;
create policy "box update" on storage.objects
  for update to authenticated using (bucket_id = 'box');

drop policy if exists "box delete" on storage.objects;
create policy "box delete" on storage.objects
  for delete to authenticated using (bucket_id = 'box');

-- ---------------------------------------------------------------------------
-- Grants (Supabase normally sets these by default; make it explicit).
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.profiles, public.bounties, public.bounty_workers,
  public.submissions, public.bounty_comments, public.bounty_events
to authenticated;
grant select on
  public.bounties, public.bounty_workers, public.submissions,
  public.bounty_comments, public.bounty_events, public.profiles
to anon;
