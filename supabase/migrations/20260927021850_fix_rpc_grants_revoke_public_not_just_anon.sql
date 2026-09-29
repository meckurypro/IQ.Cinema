
-- Revoking FROM anon alone doesn't remove access if PUBLIC still has the
-- default grant every function gets on creation — PUBLIC covers anon too.
-- Have to revoke PUBLIC's grant and then explicitly re-grant to
-- authenticated for the five that legitimately need a logged-in caller.
REVOKE EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(uuid, numeric, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.unlock_episode(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_episode(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_partner_eligibility(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_partner_eligibility(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.release_creator_escrow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_creator_escrow(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.issue_strike(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_strike(uuid, uuid, text, uuid) TO authenticated;

-- handle_new_profile is trigger-only (fires via trg_new_profile on
-- public.profiles) — same class as handle_new_user/trigger_transcode_episode,
-- which were already locked down. Matching that here for consistency.
REVOKE EXECUTE ON FUNCTION public.handle_new_profile() FROM PUBLIC, anon, authenticated;
