-- Episode-level bookmarks, distinct from the movie-level `watchlist` (My List).
--   watchlist      (user_id, title_id)   -> "I want to watch this movie"
--   episode_saves  (user_id, episode_id) -> "I want to come back to this episode"
-- Mirrors watchlist/episode_likes: composite PK, cascade FKs, own-row RLS,
-- and a SECURITY DEFINER trigger keeping a denormalised counter in sync.

create table public.episode_saves (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);

-- Library lists a user's saves newest-first.
create index episode_saves_user_created_idx
  on public.episode_saves (user_id, created_at desc);

alter table public.episode_saves enable row level security;

create policy episode_saves_own on public.episode_saves
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Tighter than the older tables' default grants: no anon access, and
-- signed-in users only need to read, add and remove their own rows.
revoke all on public.episode_saves from anon, authenticated;
grant select, insert, delete on public.episode_saves to authenticated;
grant all on public.episode_saves to service_role;

alter table public.episodes
  add column save_count bigint not null default 0;

create or replace function public.bump_episode_save_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    update episodes set save_count = save_count + 1 where id = new.episode_id;
    return new;
  else
    update episodes set save_count = greatest(0, save_count - 1) where id = old.episode_id;
    return old;
  end if;
end;
$$;

revoke all on function public.bump_episode_save_count() from public, anon, authenticated;

create trigger trg_episode_saves_count
  after insert or delete on public.episode_saves
  for each row execute function public.bump_episode_save_count();
