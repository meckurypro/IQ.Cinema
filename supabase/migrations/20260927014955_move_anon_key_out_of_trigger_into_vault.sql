CREATE OR REPLACE FUNCTION public.trigger_transcode_episode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anon_key text;
BEGIN
  -- Only fire when the episode is (newly) awaiting processing, to avoid
  -- an http_post on every unrelated UPDATE to the row.
  IF NEW.status IS DISTINCT FROM 'processing' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'processing' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'edge_fn_anon_key';

  IF v_anon_key IS NULL THEN
    RAISE WARNING 'edge_fn_anon_key not found in vault; skipping transcode-episode call for episode %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://xpmrodzzrizacvdmkrmj.supabase.co/functions/v1/transcode-episode',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key
    ),
    body := jsonb_build_object('episode_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
