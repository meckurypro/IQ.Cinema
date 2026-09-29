
-- 1. Track why an episode failed processing, so it's never a silent dead end
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS processing_error text;

-- 2. Async HTTP so a DB trigger can invoke an Edge Function
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Fire the transcode-episode Edge Function whenever an episode enters
--    'processing'. The anon key here is a publishable key (safe to embed) —
--    it only satisfies the function's verify_jwt check; the function itself
--    uses its own service-role key (injected via env, never stored in SQL)
--    for privileged writes.
--    NOTE: superseded by 20260927014955, which moves the key into Vault.
--    The key literal is replaced with a placeholder here.
CREATE OR REPLACE FUNCTION public.trigger_transcode_episode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://xpmrodzzrizacvdmkrmj.supabase.co/functions/v1/transcode-episode',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'apikey', '<ANON_KEY>'
    ),
    body := jsonb_build_object('episode_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_transcode_episode_insert ON public.episodes;
CREATE TRIGGER trigger_transcode_episode_insert
  AFTER INSERT ON public.episodes
  FOR EACH ROW
  WHEN (NEW.status = 'processing')
  EXECUTE FUNCTION public.trigger_transcode_episode();

DROP TRIGGER IF EXISTS trigger_transcode_episode_update ON public.episodes;
CREATE TRIGGER trigger_transcode_episode_update
  AFTER UPDATE ON public.episodes
  FOR EACH ROW
  WHEN (NEW.status = 'processing' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trigger_transcode_episode();

-- 4. Close the SELECT gap on the private videos bucket.
--    a) creators can read back their own uploads (dashboard preview, QA)
CREATE POLICY videos_creator_read ON storage.objects FOR SELECT
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

--    b) viewers can read a video only if they're actually entitled to watch
--       it: it's published, and it's either within the title's free-episode
--       window, they've unlocked it individually, or they hold an active
--       subscription.
CREATE POLICY videos_viewer_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'videos' AND EXISTS (
      SELECT 1
      FROM public.episodes e
      JOIN public.titles t ON t.id = e.title_id
      WHERE e.video_url = storage.objects.name
        AND e.status = 'published'
        AND (
          e.episode_number <= COALESCE(
            t.free_episode_count,
            (SELECT default_free_episodes FROM public.platform_settings LIMIT 1)
          )
          OR EXISTS (
            SELECT 1 FROM public.episode_unlocks eu
            WHERE eu.episode_id = e.id AND eu.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.user_id = auth.uid()
              AND s.status = 'active'
              AND s.current_period_end > now()
          )
        )
    )
  );
