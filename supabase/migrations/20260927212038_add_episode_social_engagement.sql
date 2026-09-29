-- Denormalized counters, following the same pattern as episodes.unique_views /
-- titles.total_unique_views elsewhere in the schema.
alter table episodes add column if not exists like_count bigint not null default 0;
alter table episodes add column if not exists comment_count bigint not null default 0;
alter table episodes add column if not exists share_count bigint not null default 0;
alter table titles add column if not exists save_count bigint not null default 0;

create table if not exists episode_likes (
  user_id uuid not null references profiles(id) on delete cascade,
  episode_id uuid not null references episodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, episode_id)
);
alter table episode_likes enable row level security;
create policy episode_likes_own on episode_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists episode_comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
alter table episode_comments enable row level security;
create policy episode_comments_select on episode_comments for select using (true);
create policy episode_comments_insert on episode_comments
  for insert with check (auth.uid() = user_id);
create policy episode_comments_delete on episode_comments
  for delete using (auth.uid() = user_id or is_admin());

create index if not exists idx_episode_comments_episode on episode_comments(episode_id, created_at desc);

-- Counters are maintained by trigger rather than trusted client writes,
-- so the client can keep doing plain RLS-scoped inserts/deletes on the
-- join tables (consistent with how `watchlist` already works) without
-- ever needing UPDATE rights on episodes/titles themselves.
create or replace function bump_episode_like_count() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    update episodes set like_count = like_count + 1 where id = new.episode_id;
    return new;
  else
    update episodes set like_count = greatest(0, like_count - 1) where id = old.episode_id;
    return old;
  end if;
end;
$$;
create trigger trg_episode_likes_count
  after insert or delete on episode_likes
  for each row execute function bump_episode_like_count();

create or replace function bump_episode_comment_count() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    update episodes set comment_count = comment_count + 1 where id = new.episode_id;
    return new;
  else
    update episodes set comment_count = greatest(0, comment_count - 1) where id = old.episode_id;
    return old;
  end if;
end;
$$;
create trigger trg_episode_comments_count
  after insert or delete on episode_comments
  for each row execute function bump_episode_comment_count();

create or replace function bump_title_save_count() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    update titles set save_count = save_count + 1 where id = new.title_id;
    return new;
  else
    update titles set save_count = greatest(0, save_count - 1) where id = old.title_id;
    return old;
  end if;
end;
$$;
create trigger trg_watchlist_save_count
  after insert or delete on watchlist
  for each row execute function bump_title_save_count();

-- Shares aren't a toggle (no "unshare"), so a plain counter RPC is enough —
-- no join table needed.
create or replace function record_episode_share(p_episode_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_count bigint;
begin
  update episodes set share_count = share_count + 1
    where id = p_episode_id
    returning share_count into v_count;
  if v_count is null then
    return jsonb_build_object('ok', false, 'error', 'episode_not_found');
  end if;
  return jsonb_build_object('ok', true, 'share_count', v_count);
end;
$$;
