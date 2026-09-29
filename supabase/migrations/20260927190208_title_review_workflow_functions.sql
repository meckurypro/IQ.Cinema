
-- Guard: only admins may set titles.status to an admin-controlled value
-- (published/rejected/suspended/coming_soon/ignored-equivalent), and only
-- admins may touch the review audit columns. Creators/admins alike must go
-- through submit_title_for_review() / withdraw_title() to move status
-- between draft/in_review/withdrawn -- enforced via a session-local guard
-- flag those functions set, so a plain client-side `.update({status:...})`
-- from a creator can no longer self-publish or self-approve.
create or replace function public.enforce_title_status_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Non-admin (the owning creator, per titles_update_own_or_admin RLS).
  -- Review/audit fields are admin-only, always.
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.admin_review_note := old.admin_review_note;
  new.review_ignored_at := old.review_ignored_at;
  new.published_at := old.published_at;
  new.total_unique_views := old.total_unique_views;
  new.total_watch_seconds := old.total_watch_seconds;

  if new.status is distinct from old.status then
    if current_setting('app.title_status_guard_bypass', true) is distinct from 'on' then
      raise exception 'Use the submit-for-review or withdraw action to change a project''s status.'
        using errcode = '42501';
    end if;
    if new.status not in ('draft', 'in_review', 'withdrawn') then
      raise exception 'Not allowed to set project status to %', new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_titles_status_guard on titles;
create trigger trg_titles_status_guard
  before update on titles
  for each row
  execute function public.enforce_title_status_guard();

-- Creator (or admin) submits a draft/rejected/withdrawn project for admin
-- review. Requires at least one episode with a video actually attached, so
-- an empty shell project can't be sent for review.
create or replace function public.submit_title_for_review(p_title_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status content_status;
  v_has_video boolean;
begin
  if not (public.is_creator_of_title(p_title_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  select status into v_status from titles where id = p_title_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status not in ('draft', 'rejected', 'withdrawn') then
    return jsonb_build_object('ok', false, 'error', 'wrong_status', 'status', v_status);
  end if;

  select exists(
    select 1 from episodes
    where title_id = p_title_id and video_url is not null
  ) into v_has_video;
  if not v_has_video then
    return jsonb_build_object('ok', false, 'error', 'no_video');
  end if;

  perform set_config('app.title_status_guard_bypass', 'on', true);
  update titles
    set status = 'in_review',
        review_ignored_at = null
    where id = p_title_id;

  return jsonb_build_object('ok', true, 'status', 'in_review');
end;
$$;

-- Creator (or admin) pulls a project out of review/publication. From
-- 'withdrawn' the creator can edit and resubmit via submit_title_for_review.
create or replace function public.withdraw_title(p_title_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status content_status;
begin
  if not (public.is_creator_of_title(p_title_id) or public.is_admin()) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  select status into v_status from titles where id = p_title_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status not in ('in_review', 'published') then
    return jsonb_build_object('ok', false, 'error', 'wrong_status', 'status', v_status);
  end if;

  perform set_config('app.title_status_guard_bypass', 'on', true);
  update titles
    set status = 'withdrawn'
    where id = p_title_id;

  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$$;

-- Admin review action on a project awaiting review: approve (-> published),
-- decline (-> rejected), or ignore (leave in_review, just stamp it as
-- looked-at so it can be filtered out of the default queue and revisited
-- later).
create or replace function public.admin_review_title(
  p_title_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status content_status;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if p_decision not in ('approved', 'declined', 'ignored') then
    return jsonb_build_object('ok', false, 'error', 'bad_decision');
  end if;

  select status into v_status from titles where id = p_title_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_status <> 'in_review' then
    return jsonb_build_object('ok', false, 'error', 'wrong_status', 'status', v_status);
  end if;

  perform set_config('app.title_status_guard_bypass', 'on', true);

  if p_decision = 'approved' then
    update titles
      set status = 'published',
          published_at = coalesce(published_at, now()),
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          admin_review_note = p_note,
          review_ignored_at = null
      where id = p_title_id;
  elsif p_decision = 'declined' then
    update titles
      set status = 'rejected',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          admin_review_note = p_note,
          review_ignored_at = null
      where id = p_title_id;
  else -- ignored
    update titles
      set reviewed_by = auth.uid(),
          reviewed_at = now(),
          admin_review_note = coalesce(p_note, admin_review_note),
          review_ignored_at = now()
      where id = p_title_id;
  end if;

  return jsonb_build_object('ok', true, 'decision', p_decision);
end;
$$;

grant execute on function public.submit_title_for_review(uuid) to authenticated;
grant execute on function public.withdraw_title(uuid) to authenticated;
grant execute on function public.admin_review_title(uuid, text, text) to authenticated;
