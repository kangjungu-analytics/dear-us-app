-- Run once in Supabase Dashboard > SQL Editor to fix "gen_random_bytes(integer) does not exist".
-- Invite codes now use PostgreSQL's built-in gen_random_uuid(), independent of pgcrypto's schema.
create or replace function public.create_couple()
returns table (couple_id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
  new_code text;
begin
  if auth.uid() is null then raise exception '로그인 후 이용해 주세요.'; end if;
  if exists (select 1 from public.couples c where auth.uid() in (c.member_a, c.member_b)) then
    raise exception '이미 연결된 공간이 있어요.';
  end if;
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.couples (invite_code, member_a) values (new_code, auth.uid()) returning id into new_id;
  return query select new_id, new_code;
end;
$$;

revoke all on function public.create_couple() from public, anon;
grant execute on function public.create_couple() to authenticated;
