create or replace function public.submit_title_for_review(p_title_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Previously this only checked video_url IS NOT NULL, which is also true
  -- for an episode still sitting in "draft" (mid-edit, unfinalized). That
  -- let a title go to admin review — and get approved — while its episode
  -- was never actually finalized, so it never entered the transcode
  -- pipeline and stayed unplayable. Require a finalized episode instead.
  select exists(
    select 1 from episodes
    where title_id = p_title_id and status in ('processing', 'published')
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
$function$;
