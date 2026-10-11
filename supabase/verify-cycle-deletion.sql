-- Disposable fixture accounts only; everything is rolled back. Run as DB administrator.
begin;
select set_config('pandr.test_owner', gen_random_uuid()::text, true);
select set_config('pandr.test_other', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('pandr.test_owner')::uuid), (current_setting('pandr.test_other')::uuid);
do $$
declare account_id uuid; old_version uuid; older_version uuid; check_version uuid; current_version uuid;
begin
  foreach account_id in array array[current_setting('pandr.test_owner')::uuid, current_setting('pandr.test_other')::uuid] loop
    old_version := gen_random_uuid(); older_version := gen_random_uuid(); check_version := gen_random_uuid(); current_version := gen_random_uuid();
    insert into public.pandr_records(user_id, version, kind, record_id, payload) values
      (account_id, older_version, 'session', 'old-session', '{"id":"old-session","notes":"superseded legacy"}'),
      (account_id, old_version, 'session', 'old-session', '{"id":"old-session","notes":"legacy first cycle"}'),
      (account_id, check_version, 'checkIn', 'old-check', '{"id":"old-check","cycleId":"old-cycle","notes":"old check-in"}'),
      (account_id, current_version, 'session', 'current-session', '{"id":"current-session","cycleId":"current-cycle","notes":"preserve this workout"}');
    insert into public.pandr_profiles(user_id, revision, metadata, records) values (account_id, gen_random_uuid(),
      '{"schemaVersion":1,"updatedAt":"2026-09-18T12:00:00Z","settings":{"startDate":"2026-09-18","bodyMass":{"kg":80,"recordedAt":"2026-09-18T12:00:00Z"}},"plan":{"name":"Current plan"},"strength":{"assessments":[{"id":"saved-chinup","reps":8,"bodyweight":{"resistance":80}}],"active":{"items":[{"setup":"unfinished assessment"}]}},"cycles":[{"id":"old-cycle","name":"Old","startDate":"2026-09-01","endedAt":"2026-09-17","plan":{"name":"Archived plan"}},{"id":"current-cycle","name":"Current","startDate":"2026-09-18"}],"activeCycleId":"current-cycle","activeSession":{"id":"ongoing","cycleId":"current-cycle","notes":"preserve active workout"}}',
      jsonb_build_array(
        jsonb_build_object('kind','session','id','old-session','version',old_version,'fingerprint',repeat('0',64)),
        jsonb_build_object('kind','checkIn','id','old-check','version',check_version,'fingerprint',repeat('0',64)),
        jsonb_build_object('kind','session','id','current-session','version',current_version,'fingerprint',repeat('0',64))));
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('pandr.test_owner'), true);
do $$
declare original public.pandr_profiles%rowtype; result jsonb; preserved jsonb;
begin
  select p.* into original from public.pandr_profiles p where user_id = auth.uid();
  preserved := original.metadata - 'cycles' - 'updatedAt';
  begin
    perform public.pandr_delete_closed_cycle(gen_random_uuid(), 'old-cycle');
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.pandr_delete_closed_cycle(original.revision, 'current-cycle');
    raise exception 'Current cycle was deleted';
  exception when invalid_parameter_value then null;
  end;
  update public.pandr_profiles set metadata = jsonb_set(metadata, '{cycles,1,endedAt}', '"2026-09-19"') where user_id = auth.uid();
  begin
    perform public.pandr_delete_closed_cycle(original.revision, 'current-cycle');
    raise exception 'Last ended current cycle was deleted';
  exception when invalid_parameter_value then null;
  end;
  update public.pandr_profiles set metadata = jsonb_set(original.metadata, '{cycles,0}', (original.metadata->'cycles'->0) - 'endedAt') where user_id = auth.uid();
  begin
    perform public.pandr_delete_closed_cycle(original.revision, 'old-cycle');
    raise exception 'Unended cycle was deleted';
  exception when invalid_parameter_value then null;
  end;
  update public.pandr_profiles set metadata = original.metadata where user_id = auth.uid();
  update public.pandr_profiles set records = records || jsonb_build_array(jsonb_build_object('kind','session','id','missing','version',gen_random_uuid(),'fingerprint',repeat('0',64))) where user_id = auth.uid();
  begin
    perform public.pandr_delete_closed_cycle(original.revision, 'old-cycle');
    raise exception 'Incomplete history was deleted';
  exception when invalid_parameter_value then null;
  end;
  update public.pandr_profiles set records = original.records where user_id = auth.uid();
  update public.pandr_profiles set metadata = jsonb_set(metadata, '{activeSession,cycleId}', '"old-cycle"') where user_id = auth.uid();
  begin
    perform public.pandr_delete_closed_cycle(original.revision, 'old-cycle');
    raise exception 'Cycle with an active workout was deleted';
  exception when invalid_parameter_value then null;
  end;
  update public.pandr_profiles set metadata = original.metadata where user_id = auth.uid();
  result := public.pandr_delete_closed_cycle(original.revision, 'old-cycle');
  if ((result->'metadata') - 'cycles' - 'updatedAt') <> preserved then raise exception 'Unrelated metadata or strength changed'; end if;
  if result->'metadata'->'cycles' <> jsonb_build_array(original.metadata->'cycles'->1) then raise exception 'Wrong cycle removal'; end if;
  if result->'records' <> jsonb_build_array(original.records->2) then raise exception 'Other cycle record changed'; end if;
  if (select count(*) from public.pandr_records) <> 1 then raise exception 'Deleted versions survived or current record vanished'; end if;
  if (select payload->>'notes' from public.pandr_records) <> 'preserve this workout' then raise exception 'Current record changed'; end if;
  if (result->>'revision')::uuid = original.revision then raise exception 'Revision did not advance'; end if;
  if has_table_privilege('authenticated', 'public.pandr_records', 'delete') then raise exception 'Direct record delete permission added'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('pandr.test_other'), true);
do $$
begin
  if (select count(*) from public.pandr_records) <> 4 then raise exception 'Other account history changed'; end if;
  if (select jsonb_array_length(metadata->'cycles') from public.pandr_profiles) <> 2 then raise exception 'Other account cycle changed'; end if;
  if (select jsonb_array_length(metadata->'strength'->'assessments') from public.pandr_profiles) <> 1 then raise exception 'Other account strength changed'; end if;
  if exists(select 1 from public.pandr_profiles where user_id = current_setting('pandr.test_owner')::uuid) then raise exception 'Owner profile visible to other account'; end if;
end;
$$;

set local role anon;
do $$
begin
  if has_function_privilege('anon', 'public.pandr_delete_closed_cycle(uuid,text)', 'execute') then raise exception 'Anonymous deletion permission'; end if;
end;
$$;
reset role;
select 'PASS: double-confirmation backend guards, owner isolation, revision protection, legacy deletion, superseded version removal, strength/current-history preservation' as verification;
rollback;
