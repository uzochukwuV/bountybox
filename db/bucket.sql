-- BountyBox — private `box` storage bucket for bounty briefs and attachments.
--
-- Run this in the Supabase SQL editor of project tlfeewciagjjilpppmvw
-- (supabase.com/dashboard/project/tlfeewciagjjilpppmvw/sql/new).
-- Safe to re-run (idempotent). Step 0 proves you are on the right project;
-- step 2 must return one row (box | box | f).

-- ---------------------------------------------------------------------------
-- 0. sanity: must return a row count (if this errors, wrong project)
-- ---------------------------------------------------------------------------
select count(*) as bounty_rows from public.bounties;

-- ---------------------------------------------------------------------------
-- 1. bucket + RLS policies (app uploads/deletes as `authenticated`)
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
-- 2. verify: must return exactly one row
-- ---------------------------------------------------------------------------
select id, name, public from storage.buckets where id = 'box';
