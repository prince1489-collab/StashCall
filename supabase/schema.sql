-- StashCall family sharing. Paste this whole file into the Supabase SQL
-- editor once (Project → SQL Editor → New query → Run).
--
-- Each household shares its trips, items and people as "records": one row
-- per thing, holding its JSON. Photos never leave the phone.

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  invite_code text unique not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  household_id uuid not null references public.households on delete cascade,
  user_id uuid not null default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.records (
  household_id uuid not null references public.households on delete cascade,
  kind text not null check (kind in ('trip', 'item', 'person', 'prefs')),
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (household_id, kind, id)
);
create index if not exists records_changed on public.records (household_id, updated_at);

-- The server's clock decides what is newest, never a phone's.
create or replace function public.touch_record() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.touch_record();

create or replace function public.is_member(h uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where household_id = h and user_id = auth.uid());
$$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;

drop policy if exists "members see their household" on public.households;
create policy "members see their household" on public.households for select using (public.is_member(id));

drop policy if exists "members see each other" on public.members;
create policy "members see each other" on public.members for select using (public.is_member(household_id));
drop policy if exists "anyone can leave" on public.members;
create policy "anyone can leave" on public.members for delete using (user_id = auth.uid());

drop policy if exists "members share records" on public.records;
create policy "members share records" on public.records for all
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Start a household and become its first member. Returns its id and invite code.
create or replace function public.create_household() returns table (id uuid, invite_code text)
  language plpgsql security definer set search_path = public as $$
declare h households;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into households (invite_code)
    values (upper(substr(translate(encode(gen_random_bytes(9), 'base64'), '+/0O1Il', ''), 1, 8)))
    returning * into h;
  insert into members (household_id) values (h.id);
  return query select h.id, h.invite_code;
end $$;

-- Join with an invite code. Returns the household id, or null for a wrong code.
create or replace function public.join_household(code text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select households.id into h from households where invite_code = upper(trim(code));
  if h is null then return null; end if;
  insert into members (household_id) values (h) on conflict do nothing;
  return h;
end $$;

-- Signed-in phones reach the tables through the API; the policies above
-- decide which rows. (Needed when "Grant API access to new tables" was off.)
grant usage on schema public to authenticated;
grant select, delete on public.members to authenticated;
grant select on public.households to authenticated;
grant select, insert, update, delete on public.records to authenticated;

grant execute on function public.create_household() to authenticated;
grant execute on function public.join_household(text) to authenticated;

-- Live updates, so a tick on one phone shows on the other within seconds.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;
