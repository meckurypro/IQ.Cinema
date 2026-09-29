
-- New value must be committed on its own before anything in this migration
-- set can reference it (Postgres restriction on ALTER TYPE ... ADD VALUE).
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
