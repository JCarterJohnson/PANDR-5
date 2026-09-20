-- Run as database administrator. All fixtures roll back; no real votes are cast.
begin;
select set_config('pandr.test_owner', gen_random_uuid()::text, true);
select set_config('pandr.test_other', gen_random_uuid()::text, true);
select set_config('pandr.test_total', total::text, true) from public.pandr_support_total for update;
insert into auth.users(id) values (current_setting('pandr.test_owner')::uuid), (current_setting('pandr.test_other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('pandr.test_owner'), true);
insert into public.pandr_support_votes(user_id) values(auth.uid()) on conflict(user_id) do nothing;
insert into public.pandr_support_votes(user_id) values(auth.uid()) on conflict(user_id) do nothing;
do $$ begin
  if not (select voted and total = current_setting('pandr.test_total')::bigint + 1 from public.pandr_support_status()) then raise exception 'Vote/idempotence failed'; end if;
  if (select count(*) from public.pandr_support_votes) <> 1 then raise exception 'Owner read failed'; end if;
  begin
    update public.pandr_support_total set total=999;
    raise exception 'Client can falsify total';
  exception when insufficient_privilege then null; end;
  begin
    update public.pandr_support_votes set user_id=current_setting('pandr.test_other')::uuid;
    raise exception 'Client can transfer vote';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pandr_support_votes(user_id,created_at) values(auth.uid(),'2000-01-01');
    raise exception 'Client can falsify timestamp';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('pandr.test_other'), true);
do $$ begin
  if (select count(*) from public.pandr_support_votes) <> 0 then raise exception 'Other voter identity leaked'; end if;
  if (select voted from public.pandr_support_status()) then raise exception 'Vote leaked across accounts'; end if;
  delete from public.pandr_support_votes where user_id=current_setting('pandr.test_owner')::uuid;
  if found then raise exception 'Other account can remove vote'; end if;
  begin
    insert into public.pandr_support_votes(user_id) values(current_setting('pandr.test_owner')::uuid) on conflict(user_id) do nothing;
    raise exception 'Other account can cast vote';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.pandr_support_votes(user_id) values(auth.uid());
do $$ begin
  if not (select voted and total = current_setting('pandr.test_total')::bigint + 2 from public.pandr_support_status()) then raise exception 'Second unique vote failed'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('pandr.test_owner'), true);
delete from public.pandr_support_votes where user_id=auth.uid();
delete from public.pandr_support_votes where user_id=auth.uid();
do $$ begin
  if not (select not voted and total = current_setting('pandr.test_total')::bigint + 1 from public.pandr_support_status()) then raise exception 'Unvote/idempotence failed'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if (select count(*) from public.pandr_support_votes) <> 0 then raise exception 'Anonymous voter identity leak'; end if;
  if not (select not voted and total = current_setting('pandr.test_total')::bigint + 1 from public.pandr_support_status()) then raise exception 'Public count failed'; end if;
  if has_table_privilege('anon','public.pandr_support_votes','insert,update,delete') then raise exception 'Anonymous write grant'; end if;
  begin
    insert into public.pandr_support_votes(user_id) values(current_setting('pandr.test_owner')::uuid);
    raise exception 'Anonymous vote accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','pandr_private.update_support_total()','execute') then raise exception 'Trigger callable by anon'; end if;
  if has_function_privilege('authenticated','pandr_private.update_support_total()','execute') then raise exception 'Trigger callable by account'; end if;
end $$;
delete from auth.users where id=current_setting('pandr.test_other')::uuid;
do $$ begin
  if (select total from public.pandr_support_total) <> current_setting('pandr.test_total')::bigint then raise exception 'Account deletion left stale count'; end if;
end $$;
select 'PASS: unique votes, idempotent removal, ownership, private identities, public total, count tampering denied, server timestamps, account deletion' as verification;
rollback;
