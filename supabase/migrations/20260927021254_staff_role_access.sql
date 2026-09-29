
-- Access matrix for the 5 user types:
--   viewer  (Normal user)        - watch/unlock/subscribe, own profile & wallet
--   creator (Creator account)    - viewer rights + upload/manage own titles & episodes
--   creator + creator_status='partner' (Partner) - creator rights + payouts/withdrawals
--     (already modeled: creator_partner_state.is_partner, check_partner_eligibility(),
--      request_withdrawal() etc.)
--   staff                        - can moderate content_reports (view + action), but
--                                  NOT platform_settings, partner approvals, or creator
--                                  approvals — those stay admin-only
--   admin                        - full access: settings, all applications/approvals,
--                                  reports, everything staff can do

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'staff');
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (select 1 from profiles where id = auth.uid() and role IN ('staff', 'admin'));
$$;

-- Let staff moderate reports alongside admins (was admin-only before).
DROP POLICY IF EXISTS reports_select_own_or_admin ON public.content_reports;
CREATE POLICY reports_select_own_or_admin ON public.content_reports FOR SELECT
  USING (auth.uid() = reporter_id OR is_staff_or_admin());

DROP POLICY IF EXISTS reports_admin_update ON public.content_reports;
CREATE POLICY reports_staff_or_admin_update ON public.content_reports FOR UPDATE
  USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
