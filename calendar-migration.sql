-- Run once in Supabase Dashboard > SQL Editor for an existing project.
-- Calendar data is private to members of the matching couple.

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

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant select, insert, delete on public.calendar_events to authenticated;
grant update (title, event_date, start_time, end_time, notes) on public.calendar_events to authenticated;

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_events'
  ) then
    alter publication supabase_realtime add table public.calendar_events;
  end if;
end;
$$;
