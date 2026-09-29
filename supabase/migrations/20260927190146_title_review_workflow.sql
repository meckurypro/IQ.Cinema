
-- ---------------------------------------------------------------------------
-- Project (title) review workflow: draft -> in_review -> published/rejected,
-- plus a creator-initiated 'withdrawn' state and an admin "ignore for now"
-- marker that doesn't change status. Episode-level auto-transcode/publish
-- (trigger_transcode_episode) is untouched -- this gates overall visibility
-- at the title level, which is what actually controls whether a project (and
-- its episodes) can be found/watched by the public (see titles_select_published).
-- ---------------------------------------------------------------------------

alter type content_status add value if not exists 'withdrawn';

alter table titles
  add column if not exists admin_review_note text,
  add column if not exists reviewed_by uuid references profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_ignored_at timestamptz;
