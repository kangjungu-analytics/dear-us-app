-- Run once in Supabase Dashboard > SQL Editor.
-- Creates account pairing, private messages, and private photo storage.

create extension if not exists pgcrypto;

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  member_a uuid not null references auth.users(id) on delete cascade,
  member_b uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint couples_two_different_members check (member_b is null or member_b <> member_a)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_couple_created_idx on public.messages (couple_id, created_at);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  caption text check (caption is null or char_length(caption) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists photos_couple_created_idx on public.photos (couple_id, created_at desc);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  creator_id uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  event_date date not null,
  start_time time,
  end_time time,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint calendar_event_time_order check (
    start_time is null or end_time is null or end_time > start_time
  )
);

create index if not exists calendar_events_couple_date_idx
  on public.calendar_events (couple_id, event_date, start_time);

create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.couples c
    where c.id = p_couple_id and auth.uid() in (c.member_a, c.member_b)
  );
$$;

create or replace function public.get_my_couple()
returns table (id uuid, member_a uuid, member_b uuid, invite_code text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.member_a, c.member_b, c.invite_code
  from public.couples c
  where auth.uid() in (c.member_a, c.member_b)
  limit 1;
$$;

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
  -- gen_random_uuid() is built into supported PostgreSQL versions and avoids
  -- depending on pgcrypto's installation schema for invite-code generation.
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.couples (invite_code, member_a) values (new_code, auth.uid()) returning id into new_id;
  return query select new_id, new_code;
end;
$$;

create or replace function public.join_couple(p_code text)
returns table (couple_id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare
  joined_id uuid;
  joined_code text;
begin
  if auth.uid() is null then raise exception '로그인 후 이용해 주세요.'; end if;
  if exists (select 1 from public.couples c where auth.uid() in (c.member_a, c.member_b)) then
    raise exception '이미 연결된 공간이 있어요.';
  end if;
  update public.couples c
  set member_b = auth.uid()
  where c.invite_code = upper(trim(p_code)) and c.member_b is null and c.member_a <> auth.uid()
  returning c.id, c.invite_code into joined_id, joined_code;
  if joined_id is null then raise exception '코드가 틀렸거나 이미 사용된 초대 코드예요.'; end if;
  return query select joined_id, joined_code;
end;
$$;

alter table public.couples enable row level security;
alter table public.messages enable row level security;
alter table public.photos enable row level security;
alter table public.calendar_events enable row level security;

revoke all on public.couples from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.photos from anon, authenticated;
revoke all on public.calendar_events from anon, authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert, delete on public.photos to authenticated;
grant select, insert, delete on public.calendar_events to authenticated;
grant update (title, event_date, start_time, end_time, notes) on public.calendar_events to authenticated;

drop policy if exists "couple members read messages" on public.messages;
create policy "couple members read messages" on public.messages for select to authenticated
  using (public.is_couple_member(couple_id));
drop policy if exists "couple members send their own messages" on public.messages;
create policy "couple members send their own messages" on public.messages for insert to authenticated
  with check (public.is_couple_member(couple_id) and sender_id = (select auth.uid())
    and char_length(trim(body)) between 1 and 2000);

drop policy if exists "couple members read photos" on public.photos;
create policy "couple members read photos" on public.photos for select to authenticated
  using (public.is_couple_member(couple_id));
drop policy if exists "couple members add photos" on public.photos;
create policy "couple members add photos" on public.photos for insert to authenticated
  with check (public.is_couple_member(couple_id) and uploader_id = (select auth.uid())
    and storage_path like couple_id::text || '/%');
drop policy if exists "couple members remove photos" on public.photos;
create policy "couple members remove photos" on public.photos for delete to authenticated
  using (public.is_couple_member(couple_id));

drop policy if exists "couple members read calendar events" on public.calendar_events;
create policy "couple members read calendar events" on public.calendar_events for select to authenticated
  using (public.is_couple_member(couple_id));
drop policy if exists "couple members add calendar events" on public.calendar_events;
create policy "couple members add calendar events" on public.calendar_events for insert to authenticated
  with check (public.is_couple_member(couple_id) and creator_id = (select auth.uid()));
drop policy if exists "couple members edit calendar events" on public.calendar_events;
create policy "couple members edit calendar events" on public.calendar_events for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));
drop policy if exists "couple members remove calendar events" on public.calendar_events;
create policy "couple members remove calendar events" on public.calendar_events for delete to authenticated
  using (public.is_couple_member(couple_id));

revoke all on function public.is_couple_member(uuid) from public, anon;
revoke all on function public.get_my_couple() from public, anon;
revoke all on function public.create_couple() from public, anon;
revoke all on function public.join_couple(text) from public, anon;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.get_my_couple() to authenticated;
grant execute on function public.create_couple() to authenticated;
grant execute on function public.join_couple(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('couple-photos', 'couple-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "couple members read private photos" on storage.objects;
create policy "couple members read private photos" on storage.objects for select to authenticated
  using (bucket_id = 'couple-photos'
    and public.is_couple_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "couple members upload private photos" on storage.objects;
create policy "couple members upload private photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'couple-photos'
    and public.is_couple_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "couple members delete private photos" on storage.objects;
create policy "couple members delete private photos" on storage.objects for delete to authenticated
  using (bucket_id = 'couple-photos'
    and public.is_couple_member(((storage.foldername(name))[1])::uuid));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'photos') then
    alter publication supabase_realtime add table public.photos;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'calendar_events') then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end;
$$;
