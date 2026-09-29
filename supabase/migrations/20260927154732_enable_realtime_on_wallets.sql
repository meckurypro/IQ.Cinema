-- Mirrors enable_realtime_on_profiles: lets the client react immediately
-- when a coin purchase or withdrawal lands (via the Paystack/withdrawal
-- webhooks), instead of only seeing the new balance on next manual refresh.
alter publication supabase_realtime add table public.wallets;
