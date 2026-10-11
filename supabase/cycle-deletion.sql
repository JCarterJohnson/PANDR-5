-- Apply after schema.sql. This adds one explicit, owner-scoped history deletion API.
-- Ordinary sync remains append-only; no direct record DELETE grant is added.
begin;

create schema if not exists pandr_private;
revoke all on schema pandr_private from public, anon;
grant usage on schema pandr_private to authenticated;

create or replace function pandr_private.delete_closed_cycle(expected_revision uuid, cycle_id text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  profile public.pandr_profiles%rowtype;
  target jsonb;
  first_cycle_id text;
  remaining_cycles jsonb;
  remaining_records jsonb;
begin
  if owner_id is null then raise exception 'Sign in before deleting a cycle' using errcode = '42501'; end if;
  if cycle_id is null or length(cycle_id) not between 1 and 200 then
    raise exception 'Invalid cycle' using errcode = '22023';
  end if;

  -- The row lock and expected revision protect both the previewed counts and all
  -- concurrent metadata/history saves. The whole operation commits atomically.
  select p.* into profile from public.pandr_profiles p where p.user_id = owner_id for update;
  if not found then raise exception 'Account history not found' using errcode = '22023'; end if;
  if expected_revision is null or profile.revision <> expected_revision then
    raise exception 'Account changed; refresh History before deleting' using errcode = '40001';
  end if;
  if jsonb_typeof(profile.metadata->'cycles') is distinct from 'array' then
    raise exception 'Only a previous, ended cycle can be deleted' using errcode = '22023';
  end if;
  first_cycle_id := profile.metadata->'cycles'->0->>'id';
  select c.value into target from jsonb_array_elements(profile.metadata->'cycles') c
    where c.value->>'id' = cycle_id;
  if not found or target->>'endedAt' is null
    or coalesce(profile.metadata->>'activeCycleId', first_cycle_id) = cycle_id
    or jsonb_array_length(profile.metadata->'cycles') < 2 then
    raise exception 'Only a previous, ended cycle can be deleted' using errcode = '22023';
  end if;
  if profile.metadata ? 'activeSession'
    and coalesce(profile.metadata->'activeSession'->>'cycleId', first_cycle_id) = cycle_id then
    raise exception 'This cycle still has a workout in progress' using errcode = '22023';
  end if;
  -- Fail closed on an incomplete manifest rather than silently losing other logs.
  if exists (
    select 1 from jsonb_array_elements(profile.records) r
    left join public.pandr_records p on p.user_id = owner_id
      and p.version::text = r.value->>'version'
      and p.kind = r.value->>'kind' and p.record_id = r.value->>'id'
    where p.version is null
  ) then raise exception 'Account history is incomplete; no cycle was deleted' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(c.value order by c.ordinality), '[]'::jsonb) into remaining_cycles
    from jsonb_array_elements(profile.metadata->'cycles') with ordinality c
    where c.value->>'id' <> cycle_id;
  select coalesce(jsonb_agg(r.value order by r.ordinality), '[]'::jsonb) into remaining_records
    from jsonb_array_elements(profile.records) with ordinality r
    join public.pandr_records p on p.user_id = owner_id
      and p.version::text = r.value->>'version'
      and p.kind = r.value->>'kind' and p.record_id = r.value->>'id'
    where coalesce(p.payload->>'cycleId', first_cycle_id) <> cycle_id;

  -- Remove every stored version belonging to this cycle, including superseded
  -- versions; strength observations live in untouched profile metadata.
  delete from public.pandr_records p where p.user_id = owner_id
    and coalesce(p.payload->>'cycleId', first_cycle_id) = cycle_id;
  update public.pandr_profiles p
    set revision = gen_random_uuid(),
      metadata = jsonb_set(jsonb_set(profile.metadata, '{cycles}', remaining_cycles),
        '{updatedAt}', to_jsonb(to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
      records = remaining_records
    where p.user_id = owner_id
    returning p.* into profile;
  return jsonb_build_object('user_id', profile.user_id, 'revision', profile.revision,
    'metadata', profile.metadata, 'records', profile.records);
end;
$$;
revoke all on function pandr_private.delete_closed_cycle(uuid, text) from public, anon, authenticated;
grant execute on function pandr_private.delete_closed_cycle(uuid, text) to authenticated;

-- Only the invoker wrapper is exposed through the public API. The private
-- implementation still checks ownership and revision before touching history.
create or replace function public.pandr_delete_closed_cycle(expected_revision uuid, cycle_id text)
returns jsonb language sql security invoker set search_path = '' as $$
  select pandr_private.delete_closed_cycle(expected_revision, cycle_id);
$$;
revoke all on function public.pandr_delete_closed_cycle(uuid, text) from public, anon, authenticated;
grant execute on function public.pandr_delete_closed_cycle(uuid, text) to authenticated;

commit;
