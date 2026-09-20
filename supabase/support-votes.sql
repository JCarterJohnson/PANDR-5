-- Apply after schema.sql. Votes are separate from workout backups/synchronization.
begin;
create schema if not exists pandr_private;
revoke all on schema pandr_private from public, anon, authenticated;

create table public.pandr_support_votes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.pandr_support_total (
  id boolean primary key default true check (id),
  total bigint not null default 0 check (total >= 0)
);
insert into public.pandr_support_total(id) values (true);
alter table public.pandr_support_votes enable row level security;
alter table public.pandr_support_total enable row level security;
revoke all on public.pandr_support_votes, public.pandr_support_total from public, anon, authenticated;
grant select on public.pandr_support_votes, public.pandr_support_total to anon, authenticated;
grant insert(user_id), delete on public.pandr_support_votes to authenticated;
create policy "Read own support vote" on public.pandr_support_votes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Cast own support vote" on public.pandr_support_votes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Remove own support vote" on public.pandr_support_votes for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "Read support total" on public.pandr_support_total for select to anon, authenticated using (true);

-- Only this trigger can maintain the aggregate; API clients cannot edit the count.
-- Its elevation is needed to update the shared row, including auth-user cascades.
create function pandr_private.update_support_total() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.pandr_support_total
  set total = total + case when TG_OP = 'INSERT' then 1 else -1 end where id = true;
  return null;
end;
$$;
revoke all on function pandr_private.update_support_total() from public, anon, authenticated;
create trigger support_total_changed after insert or delete on public.pandr_support_votes
  for each row execute function pandr_private.update_support_total();

-- One consistent snapshot; RLS hides every other account's vote, including from anon.
create function public.pandr_support_status() returns table(total bigint, voted boolean)
language sql stable security invoker set search_path = '' as $$
  select s.total, exists(select 1 from public.pandr_support_votes v where v.user_id = (select auth.uid()))
  from public.pandr_support_total s where s.id = true;
$$;
revoke all on function public.pandr_support_status() from public, anon, authenticated;
grant execute on function public.pandr_support_status() to anon, authenticated;
commit;
