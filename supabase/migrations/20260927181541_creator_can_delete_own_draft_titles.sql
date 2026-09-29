-- Creators previously had no DELETE policy on titles at all — only
-- titles_delete_admin existed. That means a creator's "delete this title"
-- button would fail RLS no matter what the UI did, unless proxied through
-- an admin-only path.
--
-- This adds creator-owned delete, but only while the title is still a
-- draft (never uploaded for review). Once a title has been submitted,
-- published, or otherwise entered the review pipeline, deleting it should
-- go through moderation/admin rather than disappearing unilaterally — that
-- protects viewers who may have already unlocked episodes, and preserves
-- the history admin review and strikes rely on. Titles with actual
-- transaction history are additionally protected by the existing
-- transactions_related_title_id_fkey FK (ON DELETE NO ACTION), so even a
-- draft title that unexpectedly has earnings tied to it can't be deleted.
create policy titles_delete_own_draft
on public.titles
for delete
to authenticated
using (auth.uid() = creator_id and status = 'draft');
