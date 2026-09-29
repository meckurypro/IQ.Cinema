-- Reconstructed snapshot of the live IQ CINEMA public schema (project xpmrodzzrizacvdmkrmj).
-- Migrations 0001-0005 (schema, functions, rls, storage, seed) have no stored SQL on the
-- server, so this file stands in for them. It reflects the CURRENT state (i.e. it already
-- includes everything the dated migrations in ./migrations add) and is for reference /
-- bootstrapping a blank project — do NOT run it on top of the dated migrations.
-- Requires: create extension if not exists "uuid-ossp"; (uuid_generate_v4)

-- ENUMS
CREATE TYPE public.application_status AS ENUM ('pending', 'approved', 'declined', 'ignored');
CREATE TYPE public.content_status AS ENUM ('draft', 'in_review', 'published', 'coming_soon', 'suspended', 'rejected', 'withdrawn');
CREATE TYPE public.content_type AS ENUM ('short_episode', 'full_episode', 'one_part_film');
CREATE TYPE public.creator_status AS ENUM ('none', 'applied', 'approved', 'declined', 'ignored', 'partner');
CREATE TYPE public.episode_status AS ENUM ('draft', 'processing', 'published', 'suspended');
CREATE TYPE public.report_status AS ENUM ('pending', 'reviewing', 'upheld', 'dismissed');
CREATE TYPE public.strike_severity AS ENUM ('standard');
CREATE TYPE public.subscription_status AS ENUM ('active', 'canceled', 'expired', 'past_due');
CREATE TYPE public.txn_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
CREATE TYPE public.txn_type AS ENUM ('coin_purchase', 'episode_unlock', 'subscription_purchase', 'creator_earning', 'withdrawal', 'refund', 'admin_adjustment');
CREATE TYPE public.user_role AS ENUM ('viewer', 'creator', 'admin', 'staff');
CREATE TYPE public.withdrawal_status AS ENUM ('requested', 'approved', 'paid', 'declined');

-- TABLES (columns/defaults only; constraints, indexes and policies follow below)
CREATE TABLE public.coin_packs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  coins integer NOT NULL,
  bonus_coins integer NOT NULL DEFAULT 0,
  price_naira numeric(10,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.content_reports (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  reporter_id uuid,
  title_id uuid,
  episode_id uuid,
  reason text NOT NULL,
  details text,
  status report_status NOT NULL DEFAULT 'pending'::report_status,
  reviewed_by uuid,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone
);
CREATE TABLE public.creator_applications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  bio text,
  portfolio_url text,
  primary_genre text,
  sample_url text,
  status application_status NOT NULL DEFAULT 'pending'::application_status,
  reviewed_by uuid,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone
);
CREATE TABLE public.creator_metrics (
  user_id uuid NOT NULL,
  unique_views bigint NOT NULL DEFAULT 0,
  watch_hours numeric(12,2) NOT NULL DEFAULT 0,
  episode_count integer NOT NULL DEFAULT 0,
  last_upload_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.creator_partner_state (
  user_id uuid NOT NULL,
  is_partner boolean NOT NULL DEFAULT false,
  partner_since timestamp with time zone,
  suspended_until timestamp with time zone,
  eligibility_delayed_until timestamp with time zone,
  last_retention_check_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.episode_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.episode_likes (
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.episode_saves (
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.episode_unlocks (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  transaction_id uuid,
  unlocked_via text NOT NULL DEFAULT 'coins'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.episodes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title_id uuid NOT NULL,
  episode_number integer NOT NULL,
  name text,
  video_url text,
  thumbnail_url text,
  duration_seconds integer,
  unlock_cost_coins integer,
  status episode_status NOT NULL DEFAULT 'draft'::episode_status,
  unique_views bigint NOT NULL DEFAULT 0,
  total_watch_seconds bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  published_at timestamp with time zone,
  video_width integer,
  video_height integer,
  processing_error text,
  like_count bigint NOT NULL DEFAULT 0,
  comment_count bigint NOT NULL DEFAULT 0,
  share_count bigint NOT NULL DEFAULT 0,
  save_count bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.feature_flags (
  key text NOT NULL,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE public.genres (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.partner_applications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  status application_status NOT NULL DEFAULT 'pending'::application_status,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone
);
CREATE TABLE public.platform_settings (
  id boolean NOT NULL DEFAULT true,
  coin_to_naira numeric(10,2) NOT NULL DEFAULT 10.00,
  default_episode_unlock_coins integer NOT NULL DEFAULT 30,
  default_free_episodes integer NOT NULL DEFAULT 4,
  min_free_episodes integer NOT NULL DEFAULT 1,
  max_free_episodes integer NOT NULL DEFAULT 8,
  creator_revenue_share numeric(4,3) NOT NULL DEFAULT 0.600,
  min_payout_threshold_naira numeric(10,2) NOT NULL DEFAULT 5000.00,
  min_watch_fraction numeric(3,2) NOT NULL DEFAULT 0.70,
  unique_view_window_hours integer NOT NULL DEFAULT 24,
  partner_min_unique_views integer NOT NULL DEFAULT 1000,
  partner_min_watch_hours numeric(10,2) NOT NULL DEFAULT 100.00,
  partner_min_episodes integer NOT NULL DEFAULT 5,
  partner_min_account_age_days integer NOT NULL DEFAULT 30,
  partner_retention_window_months integer NOT NULL DEFAULT 6,
  partner_min_upload_interval_days integer NOT NULL DEFAULT 90,
  strike_expiry_months integer NOT NULL DEFAULT 12,
  strike_suspension_months integer NOT NULL DEFAULT 2,
  strikes_before_suspension integer NOT NULL DEFAULT 3,
  ads_enabled boolean NOT NULL DEFAULT false,
  ad_reward_coins integer NOT NULL DEFAULT 10,
  ad_daily_view_cap integer NOT NULL DEFAULT 5,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE TABLE public.plays (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  device_id text,
  episode_id uuid NOT NULL,
  title_id uuid NOT NULL,
  watched_seconds integer NOT NULL DEFAULT 0,
  episode_duration_seconds integer,
  is_unique boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username text NOT NULL,
  display_name text,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'viewer'::user_role,
  creator_status creator_status NOT NULL DEFAULT 'none'::creator_status,
  country text DEFAULT 'NG'::text,
  preferred_currency text DEFAULT 'NGN'::text,
  theme_preference text DEFAULT 'system'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_staff boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false
);
CREATE TABLE public.strikes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL,
  report_id uuid,
  reason text NOT NULL,
  issued_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  "interval" text NOT NULL,
  price_naira numeric(10,2) NOT NULL,
  includes_new_releases boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active'::subscription_status,
  current_period_start timestamp with time zone NOT NULL DEFAULT now(),
  current_period_end timestamp with time zone NOT NULL,
  paystack_authorization_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  canceled_at timestamp with time zone
);
CREATE TABLE public.title_genres (
  title_id uuid NOT NULL,
  genre_id uuid NOT NULL
);
CREATE TABLE public.titles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL,
  content_type content_type NOT NULL DEFAULT 'full_episode'::content_type,
  title text NOT NULL,
  slug text NOT NULL,
  synopsis text,
  poster_url text,
  banner_url text,
  language text DEFAULT 'en'::text,
  subtitle_languages text[] DEFAULT '{}'::text[],
  content_rating text DEFAULT '13+'::text,
  status content_status NOT NULL DEFAULT 'draft'::content_status,
  free_episode_count integer,
  is_exclusive boolean NOT NULL DEFAULT false,
  total_unique_views bigint NOT NULL DEFAULT 0,
  total_watch_seconds bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  published_at timestamp with time zone,
  genre text,
  admin_review_note text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_ignored_at timestamp with time zone,
  save_count bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  type txn_type NOT NULL,
  status txn_status NOT NULL DEFAULT 'completed'::txn_status,
  amount_naira numeric(12,2),
  coin_amount bigint,
  reference text,
  related_episode_id uuid,
  related_title_id uuid,
  related_creator_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.wallets (
  user_id uuid NOT NULL,
  coin_balance bigint NOT NULL DEFAULT 0,
  earnings_balance_naira numeric(12,2) NOT NULL DEFAULT 0,
  escrow_balance_naira numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.watch_history (
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  title_id uuid NOT NULL,
  progress_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.watch_time_snapshots (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  creator_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  watch_seconds bigint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.watchlist (
  user_id uuid NOT NULL,
  title_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE public.withdrawal_requests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  amount_naira numeric(12,2) NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'requested'::withdrawal_status,
  bank_account_name text,
  bank_account_number text,
  bank_code text,
  paystack_transfer_code text,
  reviewed_by uuid,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  paid_at timestamp with time zone
);

-- CONSTRAINTS
ALTER TABLE public.coin_packs ADD CONSTRAINT coin_packs_pkey PRIMARY KEY (id);
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.creator_applications ADD CONSTRAINT creator_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.creator_metrics ADD CONSTRAINT creator_metrics_pkey PRIMARY KEY (user_id);
ALTER TABLE public.creator_partner_state ADD CONSTRAINT creator_partner_state_pkey PRIMARY KEY (user_id);
ALTER TABLE public.episode_comments ADD CONSTRAINT episode_comments_pkey PRIMARY KEY (id);
ALTER TABLE public.episode_likes ADD CONSTRAINT episode_likes_pkey PRIMARY KEY (user_id, episode_id);
ALTER TABLE public.episode_saves ADD CONSTRAINT episode_saves_pkey PRIMARY KEY (user_id, episode_id);
ALTER TABLE public.episode_unlocks ADD CONSTRAINT episode_unlocks_pkey PRIMARY KEY (id);
ALTER TABLE public.episodes ADD CONSTRAINT episodes_pkey PRIMARY KEY (id);
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);
ALTER TABLE public.genres ADD CONSTRAINT genres_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.partner_applications ADD CONSTRAINT partner_applications_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.plays ADD CONSTRAINT plays_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.strikes ADD CONSTRAINT strikes_pkey PRIMARY KEY (id);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.title_genres ADD CONSTRAINT title_genres_pkey PRIMARY KEY (title_id, genre_id);
ALTER TABLE public.titles ADD CONSTRAINT titles_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (user_id);
ALTER TABLE public.watch_history ADD CONSTRAINT watch_history_pkey PRIMARY KEY (user_id, episode_id);
ALTER TABLE public.watch_time_snapshots ADD CONSTRAINT watch_time_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE public.watchlist ADD CONSTRAINT watchlist_pkey PRIMARY KEY (user_id, title_id);
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.episode_unlocks ADD CONSTRAINT episode_unlocks_user_id_episode_id_key UNIQUE (user_id, episode_id);
ALTER TABLE public.episodes ADD CONSTRAINT episodes_title_id_episode_number_key UNIQUE (title_id, episode_number);
ALTER TABLE public.genres ADD CONSTRAINT genres_name_key UNIQUE (name);
ALTER TABLE public.genres ADD CONSTRAINT genres_slug_key UNIQUE (slug);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
ALTER TABLE public.titles ADD CONSTRAINT titles_slug_key UNIQUE (slug);
ALTER TABLE public.watch_time_snapshots ADD CONSTRAINT watch_time_snapshots_creator_id_period_start_period_end_key UNIQUE (creator_id, period_start, period_end);

ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_title_id_fkey FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE;
ALTER TABLE public.creator_applications ADD CONSTRAINT creator_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.creator_applications ADD CONSTRAINT creator_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.creator_metrics ADD CONSTRAINT creator_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.creator_partner_state ADD CONSTRAINT creator_partner_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.episode_comments ADD CONSTRAINT episode_comments_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.episode_comments ADD CONSTRAINT episode_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.episode_likes ADD CONSTRAINT episode_likes_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.episode_likes ADD CONSTRAINT episode_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.episode_saves ADD CONSTRAINT episode_saves_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.episode_saves ADD CONSTRAINT episode_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.episode_unlocks ADD CONSTRAINT episode_unlocks_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.episode_unlocks ADD CONSTRAINT episode_unlocks_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id);
ALTER TABLE public.episode_unlocks ADD CONSTRAINT episode_unlocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.episodes ADD CONSTRAINT episodes_title_id_fkey FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE;
ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.partner_applications ADD CONSTRAINT partner_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.partner_applications ADD CONSTRAINT partner_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);
ALTER TABLE public.plays ADD CONSTRAINT plays_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.plays ADD CONSTRAINT plays_title_id_fkey FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE;
ALTER TABLE public.plays ADD CONSTRAINT plays_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.strikes ADD CONSTRAINT strikes_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.strikes ADD CONSTRAINT strikes_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES profiles(id);
ALTER TABLE public.strikes ADD CONSTRAINT strikes_report_id_fkey FOREIGN KEY (report_id) REFERENCES content_reports(id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.title_genres ADD CONSTRAINT title_genres_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE;
ALTER TABLE public.title_genres ADD CONSTRAINT title_genres_title_id_fkey FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE;
ALTER TABLE public.titles ADD CONSTRAINT titles_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.titles ADD CONSTRAINT titles_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_related_creator_id_fkey FOREIGN KEY (related_creator_id) REFERENCES profiles(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_related_episode_id_fkey FOREIGN KEY (related_episode_id) REFERENCES episodes(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_related_title_id_fkey FOREIGN KEY (related_title_id) REFERENCES titles(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.watch_history ADD CONSTRAINT watch_history_episode_id_fkey FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE public.watch_history ADD CONSTRAINT watch_history_title_id_fkey FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE;
ALTER TABLE public.watch_history ADD CONSTRAINT watch_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.watch_time_snapshots ADD CONSTRAINT watch_time_snapshots_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.watchlist ADD CONSTRAINT watchlist_title_id_fkey FOREIGN KEY (title_id) REFERENCES titles(id) ON DELETE CASCADE;
ALTER TABLE public.watchlist ADD CONSTRAINT watchlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.episode_comments ADD CONSTRAINT episode_comments_body_check CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)));
ALTER TABLE public.episode_unlocks ADD CONSTRAINT episode_unlocks_unlocked_via_check CHECK ((unlocked_via = ANY (ARRAY['coins'::text, 'subscription'::text, 'free'::text, 'ad_reward'::text])));
ALTER TABLE public.platform_settings ADD CONSTRAINT singleton CHECK (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_content_tier_only CHECK ((role = ANY (ARRAY['viewer'::user_role, 'creator'::user_role])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_theme_preference_check CHECK ((theme_preference = ANY (ARRAY['light'::text, 'dark'::text, 'system'::text])));
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_interval_check CHECK (("interval" = ANY (ARRAY['weekly'::text, 'monthly'::text, 'annual'::text])));
ALTER TABLE public.titles ADD CONSTRAINT titles_content_rating_check CHECK ((content_rating = ANY (ARRAY['G'::text, '13+'::text, '16+'::text, '18+'::text])));
ALTER TABLE public.wallets ADD CONSTRAINT wallets_coin_balance_check CHECK ((coin_balance >= 0));
ALTER TABLE public.wallets ADD CONSTRAINT wallets_earnings_balance_naira_check CHECK ((earnings_balance_naira >= (0)::numeric));
ALTER TABLE public.wallets ADD CONSTRAINT wallets_escrow_balance_naira_check CHECK ((escrow_balance_naira >= (0)::numeric));

-- INDEXES
CREATE INDEX episode_saves_user_created_idx ON public.episode_saves USING btree (user_id, created_at DESC);
CREATE INDEX idx_content_reports_status ON public.content_reports USING btree (status);
CREATE INDEX idx_creator_applications_status ON public.creator_applications USING btree (status);
CREATE INDEX idx_creator_applications_user ON public.creator_applications USING btree (user_id);
CREATE INDEX idx_episode_comments_episode ON public.episode_comments USING btree (episode_id, created_at DESC);
CREATE INDEX idx_episode_unlocks_user ON public.episode_unlocks USING btree (user_id);
CREATE INDEX idx_episodes_status ON public.episodes USING btree (status);
CREATE INDEX idx_episodes_title ON public.episodes USING btree (title_id, episode_number);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, read, created_at DESC);
CREATE INDEX idx_partner_applications_status ON public.partner_applications USING btree (status);
CREATE INDEX idx_plays_episode ON public.plays USING btree (episode_id, created_at DESC);
CREATE INDEX idx_plays_user_episode ON public.plays USING btree (user_id, episode_id, created_at DESC);
CREATE INDEX idx_profiles_creator_status ON public.profiles USING btree (creator_status);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);
CREATE INDEX idx_strikes_creator ON public.strikes USING btree (creator_id, expires_at);
CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);
CREATE INDEX idx_subscriptions_user ON public.subscriptions USING btree (user_id);
CREATE INDEX idx_titles_content_type ON public.titles USING btree (content_type);
CREATE INDEX idx_titles_creator ON public.titles USING btree (creator_id);
CREATE INDEX idx_titles_status ON public.titles USING btree (status);
CREATE INDEX idx_transactions_creator ON public.transactions USING btree (related_creator_id);
CREATE INDEX idx_transactions_type ON public.transactions USING btree (type);
CREATE INDEX idx_transactions_user ON public.transactions USING btree (user_id, created_at DESC);
CREATE INDEX idx_watch_history_user ON public.watch_history USING btree (user_id, updated_at DESC);
CREATE INDEX idx_withdrawal_requests_status ON public.withdrawal_requests USING btree (status);
CREATE INDEX idx_withdrawal_requests_user ON public.withdrawal_requests USING btree (user_id);

-- ROW LEVEL SECURITY
ALTER TABLE public.coin_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_partner_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.title_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_time_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- POLICIES (public schema)
CREATE POLICY applications_admin_update ON public.creator_applications FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY applications_insert_own ON public.creator_applications FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY applications_select_own ON public.creator_applications FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY coin_packs_admin_write ON public.coin_packs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY coin_packs_select_active ON public.coin_packs FOR SELECT USING (((is_active = true) OR is_admin()));
CREATE POLICY creator_metrics_admin_write ON public.creator_metrics FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY creator_metrics_select_own_or_admin ON public.creator_metrics FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY episode_comments_delete ON public.episode_comments FOR DELETE USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY episode_comments_insert ON public.episode_comments FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY episode_comments_select ON public.episode_comments FOR SELECT USING (true);
CREATE POLICY episode_likes_own ON public.episode_likes FOR ALL USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY episode_saves_own ON public.episode_saves FOR ALL USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY episodes_select_published ON public.episodes FOR SELECT USING (((status = 'published'::episode_status) OR (EXISTS ( SELECT 1 FROM titles t WHERE ((t.id = episodes.title_id) AND ((t.creator_id = auth.uid()) OR is_admin()))))));
CREATE POLICY episodes_write_own ON public.episodes FOR ALL USING ((is_creator_of_title(title_id) OR is_admin())) WITH CHECK ((is_creator_of_title(title_id) OR is_admin()));
CREATE POLICY feature_flags_admin_write ON public.feature_flags FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY feature_flags_select_all ON public.feature_flags FOR SELECT USING (true);
CREATE POLICY genres_admin_write ON public.genres FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY genres_select_all ON public.genres FOR SELECT USING (true);
CREATE POLICY notifications_admin_insert ON public.notifications FOR INSERT WITH CHECK ((is_admin() OR true));
CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY partner_apps_admin_update ON public.partner_applications FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY partner_apps_insert_own ON public.partner_applications FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY partner_apps_select_own ON public.partner_applications FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY partner_state_admin_write ON public.creator_partner_state FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY partner_state_select_own ON public.creator_partner_state FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY plays_insert_any ON public.plays FOR INSERT WITH CHECK (true);
CREATE POLICY plays_select_own_or_creator ON public.plays FOR SELECT USING (((auth.uid() = user_id) OR is_admin() OR (EXISTS ( SELECT 1 FROM titles t WHERE ((t.id = plays.title_id) AND (t.creator_id = auth.uid()))))));
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY profiles_select_own_or_public ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = id));
CREATE POLICY reports_insert_authenticated ON public.content_reports FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY reports_select_own_or_admin ON public.content_reports FOR SELECT USING (((auth.uid() = reporter_id) OR is_staff_or_admin()));
CREATE POLICY reports_staff_or_admin_update ON public.content_reports FOR UPDATE USING (is_staff_or_admin()) WITH CHECK (is_staff_or_admin());
CREATE POLICY settings_admin_write ON public.platform_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY settings_select_all ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY strikes_admin_write ON public.strikes FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY strikes_select_own_or_admin ON public.strikes FOR SELECT USING (((auth.uid() = creator_id) OR is_admin()));
CREATE POLICY sub_plans_admin_write ON public.subscription_plans FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY sub_plans_select_active ON public.subscription_plans FOR SELECT USING (((is_active = true) OR is_admin()));
CREATE POLICY subscriptions_admin_write ON public.subscriptions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY title_genres_select_all ON public.title_genres FOR SELECT USING (true);
CREATE POLICY title_genres_write_own ON public.title_genres FOR ALL USING ((is_creator_of_title(title_id) OR is_admin())) WITH CHECK ((is_creator_of_title(title_id) OR is_admin()));
CREATE POLICY titles_delete_admin ON public.titles FOR DELETE USING (is_admin());
CREATE POLICY titles_delete_own_draft ON public.titles FOR DELETE TO authenticated USING (((auth.uid() = creator_id) AND (status = 'draft'::content_status)));
CREATE POLICY titles_insert_own ON public.titles FOR INSERT WITH CHECK ((auth.uid() = creator_id));
CREATE POLICY titles_select_published ON public.titles FOR SELECT USING (((status = 'published'::content_status) OR (status = 'coming_soon'::content_status) OR (creator_id = auth.uid()) OR is_admin()));
CREATE POLICY titles_update_own_or_admin ON public.titles FOR UPDATE USING (((auth.uid() = creator_id) OR is_admin()));
CREATE POLICY transactions_admin_all ON public.transactions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY transactions_select_own ON public.transactions FOR SELECT USING (((auth.uid() = user_id) OR (auth.uid() = related_creator_id) OR is_admin()));
CREATE POLICY unlocks_admin_write ON public.episode_unlocks FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY unlocks_select_own ON public.episode_unlocks FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY wallets_admin_write ON public.wallets FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY wallets_select_own ON public.wallets FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));
CREATE POLICY watch_history_own ON public.watch_history FOR ALL USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY watch_time_admin_write ON public.watch_time_snapshots FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY watch_time_select_own_or_admin ON public.watch_time_snapshots FOR SELECT USING (((auth.uid() = creator_id) OR is_admin()));
CREATE POLICY watchlist_own ON public.watchlist FOR ALL USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY withdrawals_admin_update ON public.withdrawal_requests FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY withdrawals_insert_own ON public.withdrawal_requests FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY withdrawals_select_own ON public.withdrawal_requests FOR SELECT USING (((auth.uid() = user_id) OR is_admin()));

-- POLICIES (storage.objects)
CREATE POLICY avatars_own_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY avatars_own_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY avatars_public_read ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));
CREATE POLICY posters_creator_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ANY (ARRAY['posters'::text, 'thumbnails'::text])) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY posters_creator_manage ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = ANY (ARRAY['posters'::text, 'thumbnails'::text])) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY posters_creator_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ANY (ARRAY['posters'::text, 'thumbnails'::text])) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY posters_public_read ON storage.objects FOR SELECT USING ((bucket_id = ANY (ARRAY['posters'::text, 'thumbnails'::text])));
CREATE POLICY videos_admin_all ON storage.objects FOR ALL TO authenticated USING (((bucket_id = 'videos'::text) AND is_admin()));
CREATE POLICY videos_creator_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY videos_creator_manage ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY videos_creator_read ON storage.objects FOR SELECT USING (((bucket_id = 'videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY videos_creator_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'videos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
-- videos_viewer_read: see migrations/20260926212142_episode_transcode_pipeline_and_video_read_policies.sql

-- TRIGGERS (public schema; on_auth_user_created is in migrations/20260926213932)
CREATE TRIGGER feature_flags_set_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_episode_comments_count AFTER INSERT OR DELETE ON public.episode_comments FOR EACH ROW EXECUTE FUNCTION bump_episode_comment_count();
CREATE TRIGGER trg_episode_likes_count AFTER INSERT OR DELETE ON public.episode_likes FOR EACH ROW EXECUTE FUNCTION bump_episode_like_count();
CREATE TRIGGER trg_episode_saves_count AFTER INSERT OR DELETE ON public.episode_saves FOR EACH ROW EXECUTE FUNCTION bump_episode_save_count();
CREATE TRIGGER trg_new_profile AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION handle_new_profile();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_title_tag_limit BEFORE INSERT ON public.title_genres FOR EACH ROW EXECUTE FUNCTION enforce_title_tag_limit();
CREATE TRIGGER trg_titles_status_guard BEFORE UPDATE ON public.titles FOR EACH ROW EXECUTE FUNCTION enforce_title_status_guard();
CREATE TRIGGER trg_titles_updated_at BEFORE UPDATE ON public.titles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_watchlist_save_count AFTER INSERT OR DELETE ON public.watchlist FOR EACH ROW EXECUTE FUNCTION bump_title_save_count();
CREATE TRIGGER trigger_transcode_episode_insert AFTER INSERT ON public.episodes FOR EACH ROW WHEN ((new.status = 'processing'::episode_status)) EXECUTE FUNCTION trigger_transcode_episode();
CREATE TRIGGER trigger_transcode_episode_update AFTER UPDATE ON public.episodes FOR EACH ROW WHEN (((new.status = 'processing'::episode_status) AND (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION trigger_transcode_episode();
CREATE TRIGGER validate_episode_media_trigger BEFORE INSERT OR UPDATE ON public.episodes FOR EACH ROW EXECUTE FUNCTION validate_episode_media();

-- BASE FUNCTIONS (from original migration 0002; later ones live in ./migrations)
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_creator_of_title(p_title_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (select 1 from titles where id = p_title_id and creator_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into wallets (user_id) values (new.id) on conflict do nothing;
  insert into creator_partner_state (user_id) values (new.id) on conflict do nothing;
  insert into creator_metrics (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.credit_coins(p_user_id uuid, p_coins bigint, p_amount_naira numeric, p_reference text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_txn_id uuid;
begin
  insert into transactions (user_id, type, status, amount_naira, coin_amount, reference)
  values (p_user_id, 'coin_purchase', 'completed', p_amount_naira, p_coins, p_reference)
  returning id into v_txn_id;

  update wallets set coin_balance = coin_balance + p_coins where user_id = p_user_id;

  return v_txn_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.credit_creator_earning(p_creator_id uuid, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_partner boolean;
  v_suspended boolean;
begin
  select is_partner, (suspended_until is not null and suspended_until > now())
    into v_is_partner, v_suspended
    from creator_partner_state where user_id = p_creator_id;

  if v_is_partner and not v_suspended then
    update wallets set earnings_balance_naira = earnings_balance_naira + p_amount where user_id = p_creator_id;
  else
    update wallets set escrow_balance_naira = escrow_balance_naira + p_amount where user_id = p_creator_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.distribute_subscription_pool(p_period_start date, p_period_end date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total_revenue numeric;
  v_total_watch bigint;
  v_settings platform_settings%rowtype;
  r record;
  v_creator_pool numeric;
  v_share numeric;
begin
  select * into v_settings from platform_settings where id = true;

  select coalesce(sum(amount_naira), 0) into v_total_revenue
  from transactions
  where type = 'subscription_purchase' and status = 'completed'
    and created_at::date between p_period_start and p_period_end;

  v_creator_pool := v_total_revenue * v_settings.creator_revenue_share;

  select coalesce(sum(watch_seconds), 0) into v_total_watch
  from watch_time_snapshots
  where period_start = p_period_start and period_end = p_period_end;

  if v_total_watch = 0 or v_creator_pool = 0 then
    return;
  end if;

  for r in
    select creator_id, watch_seconds from watch_time_snapshots
    where period_start = p_period_start and period_end = p_period_end
  loop
    v_share := v_creator_pool * (r.watch_seconds::numeric / v_total_watch);

    insert into transactions (user_id, type, status, amount_naira, related_creator_id, metadata)
    values (r.creator_id, 'creator_earning', 'completed', v_share, r.creator_id,
      jsonb_build_object('source', 'subscription_pool', 'period_start', p_period_start, 'period_end', p_period_end));

    perform credit_creator_earning(r.creator_id, v_share);
  end loop;
end;
$function$;

-- Not captured here (defined in ./migrations): is_admin/is_staff/is_staff_or_admin, unlock_episode,
-- record_play, request_withdrawal, check_partner_eligibility, issue_strike, release_creator_escrow,
-- admin_* RPCs, title-review RPCs, similar_titles, and the engagement counter triggers.
-- Seed data (0005: genres, coin_packs, subscription_plans, platform_settings row) is not reproduced.
