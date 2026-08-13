-- ChordLab V5 Supabase schema
-- Run this entire file in Supabase SQL Editor on a NEW project.

create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Musician',
  created_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  data jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  public_slug text unique,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.song_members (
  song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('viewer','editor')),
  created_at timestamptz not null default now(),
  primary key (song_id,user_id)
);

create table if not exists public.song_invites (
  token uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  role text not null check (role in ('viewer','editor')),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index if not exists songs_owner_idx on public.songs(owner_id);
create index if not exists song_members_user_idx on public.song_members(user_id);
create index if not exists song_invites_song_idx on public.song_invites(song_id);
create unique index if not exists songs_public_slug_idx on public.songs(public_slug) where public_slug is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles(id,display_name)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(coalesce(new.email,'Musician'),'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists songs_touch_updated_at on public.songs;
create trigger songs_touch_updated_at before update on public.songs
for each row execute function public.touch_updated_at();

create or replace function private.is_song_owner(p_song_id uuid)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists(
    select 1 from public.songs s
    where s.id = p_song_id
      and s.owner_id = (select auth.uid())
  );
$$;

create or replace function private.is_song_member(p_song_id uuid, p_need_edit boolean default false)
returns boolean
language sql stable
security definer set search_path = ''
as $$
  select exists(
    select 1 from public.song_members m
    where m.song_id = p_song_id
      and m.user_id = (select auth.uid())
      and (not p_need_edit or m.role = 'editor')
  );
$$;

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.song_members enable row level security;
alter table public.song_invites enable row level security;

drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles
for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists songs_public_read on public.songs;
create policy songs_public_read on public.songs
for select to anon using (is_public = true);

drop policy if exists songs_authenticated_read on public.songs;
create policy songs_authenticated_read on public.songs
for select to authenticated
using (
  owner_id = (select auth.uid())
  or is_public = true
  or (select private.is_song_member(id,false))
);

drop policy if exists songs_owner_insert on public.songs;
create policy songs_owner_insert on public.songs
for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists songs_editor_update on public.songs;
create policy songs_editor_update on public.songs
for update to authenticated
using (
  owner_id = (select auth.uid())
  or (select private.is_song_member(id,true))
)
with check (
  owner_id = (select auth.uid())
  or (select private.is_song_member(id,true))
);

drop policy if exists songs_owner_delete on public.songs;
create policy songs_owner_delete on public.songs
for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists members_read_access on public.song_members;
create policy members_read_access on public.song_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_song_owner(song_id))
  or (select private.is_song_member(song_id,false))
);

drop policy if exists members_owner_delete on public.song_members;
create policy members_owner_delete on public.song_members
for delete to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_song_owner(song_id))
);

drop policy if exists invites_owner_read on public.song_invites;
create policy invites_owner_read on public.song_invites
for select to authenticated
using ((select private.is_song_owner(song_id)));

drop policy if exists invites_owner_insert on public.song_invites;
create policy invites_owner_insert on public.song_invites
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.is_song_owner(song_id))
);

drop policy if exists invites_owner_delete on public.song_invites;
create policy invites_owner_delete on public.song_invites
for delete to authenticated
using ((select private.is_song_owner(song_id)));

create or replace function public.accept_song_invite(p_token uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_song uuid;
  v_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'Login required';
  end if;

  select i.song_id,i.role into v_song,v_role
  from public.song_invites i
  where i.token = p_token
    and i.expires_at > now();

  if v_song is null then
    raise exception 'Invite is invalid or expired';
  end if;

  if not exists(
    select 1 from public.songs s
    where s.id=v_song and s.owner_id=(select auth.uid())
  ) then
    insert into public.song_members(song_id,user_id,role)
    values(v_song,(select auth.uid()),v_role)
    on conflict(song_id,user_id) do update set role=excluded.role;
  end if;

  delete from public.song_invites where token=p_token;
  return v_song;
end;
$$;

revoke execute on function public.accept_song_invite(uuid) from public, anon;
grant execute on function public.accept_song_invite(uuid) to authenticated;

grant select on public.profiles to authenticated;
grant select on public.songs to anon;
grant select,insert,update,delete on public.songs to authenticated;
grant select,delete on public.song_members to authenticated;
grant select,insert,delete on public.song_invites to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='songs'
  ) then
    alter publication supabase_realtime add table public.songs;
  end if;
end $$;
