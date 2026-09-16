-- Run against the configured project as its database administrator.
-- Every fixture exists only in this transaction; no accounts or workouts persist.
begin;
select set_config('pandr.test_owner', gen_random_uuid()::text, true);
select set_config('pandr.test_other', gen_random_uuid()::text, true);
insert into auth.users (id) values
  (current_setting('pandr.test_owner')::uuid),
  (current_setting('pandr.test_other')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('pandr.test_owner'), true);
insert into public.pandr_profiles(user_id, revision, metadata)
values (auth.uid(), gen_random_uuid(), '{"schemaVersion":1}');
insert into public.pandr_records(user_id, version, kind, record_id, payload)
values (auth.uid(), gen_random_uuid(), 'session', 'rls-test', '{"id":"rls-test"}');
do $$
begin
  if (select count(*) from public.pandr_profiles) <> 1 then raise exception 'Owner cannot read profile'; end if;
  if (select count(*) from public.pandr_records) <> 1 then raise exception 'Owner cannot read records'; end if;
  update public.pandr_profiles set revision = gen_random_uuid() where user_id = auth.uid();
  if not found then raise exception 'Owner cannot update profile'; end if;
  begin
    update public.pandr_profiles set user_id = current_setting('pandr.test_other')::uuid;
    raise exception 'Ownership transfer was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('pandr.test_other'), true);
do $$
begin
  if (select count(*) from public.pandr_profiles) <> 0 then raise exception 'Other account saw profile'; end if;
  if (select count(*) from public.pandr_records) <> 0 then raise exception 'Other account saw records'; end if;
  update public.pandr_profiles set revision = gen_random_uuid() where user_id = current_setting('pandr.test_owner')::uuid;
  if found then raise exception 'Other account updated profile'; end if;
  begin
    insert into public.pandr_records(user_id, version, kind, record_id, payload)
    values (current_setting('pandr.test_owner')::uuid, gen_random_uuid(), 'session', 'attack', '{"id":"attack"}');
    raise exception 'Other account inserted owner record';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.pandr_profiles(user_id, revision, metadata)
    values (current_setting('pandr.test_owner')::uuid, gen_random_uuid(), '{"schemaVersion":1}');
    raise exception 'Other account inserted owner profile';
  exception when insufficient_privilege then null;
  end;
end $$;

set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.pandr_profiles', 'select,insert,update,delete') then raise exception 'Anonymous profile access'; end if;
  if has_table_privilege('anon', 'public.pandr_records', 'select,insert,update,delete') then raise exception 'Anonymous record access'; end if;
end $$;
reset role;
select 'PASS: owner read/write, other-account isolation, reassignment protection, anonymous denial' as verification;
rollback;
