-- Reviewed setup script. Apply once to an owner-controlled Supabase project.
-- No elevated functions, public workout data, delete API, or server keys.
begin;

create table public.pandr_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision uuid not null,
  metadata jsonb not null check (jsonb_typeof(metadata) = 'object' and metadata->>'schemaVersion' = '1'),
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  constraint pandr_metadata_size check (octet_length(metadata::text) <= 16777216),
  constraint pandr_manifest_size check (jsonb_array_length(records) <= 200000)
);

-- Revisions are immutable: an atomic profile compare-and-swap publishes a manifest
-- only after all referenced record versions have been successfully inserted.
create table public.pandr_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  version uuid not null,
  kind text not null check (kind in ('session', 'checkIn')),
  record_id text not null check (length(record_id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, version),
  constraint pandr_record_identity check (payload->>'id' = record_id),
  constraint pandr_record_size check (octet_length(payload::text) <= 4194304)
);
create index pandr_records_record_lookup on public.pandr_records(user_id, kind, record_id);

alter table public.pandr_profiles enable row level security;
alter table public.pandr_records enable row level security;
revoke all on table public.pandr_profiles, public.pandr_records from public, anon, authenticated;
grant select, insert, update on table public.pandr_profiles to authenticated;
grant select, insert on table public.pandr_records to authenticated;

create policy "Owner reads profile" on public.pandr_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owner creates profile" on public.pandr_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Owner updates profile" on public.pandr_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner reads workout records" on public.pandr_records for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Owner creates workout records" on public.pandr_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

commit;
