-- Privacy & data-rights compliance — Push 2 of 2.
--
-- Adds two new tables and one sequence to back the consent + account
-- deletion flows that the customer-facing UI hooks into.
--
-- 1. consent_logs:    one row per consent event (registration, re-consent).
-- 2. deletion_requests: tracks every account-deletion request with a
--                     human-readable reference number (DEL-001, DEL-002, …)
--                     auto-generated from a sequence.
--
-- RLS is enabled on both; customers can read/insert their own rows,
-- admins (per is_admin(auth.uid())) can read + update everything.
--
-- Idempotent. Safe to re-apply.

-- ─── 1. consent_logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_version  TEXT NOT NULL,
  agreed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      TEXT,
  user_agent      TEXT,
  app_version     TEXT,
  source          TEXT NOT NULL DEFAULT 'register'  -- 'register' | 're-consent'
);

CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id   ON public.consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_agreed_at ON public.consent_logs(agreed_at DESC);

ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

-- A user can insert their own consent record.
DROP POLICY IF EXISTS "Users insert own consent" ON public.consent_logs;
CREATE POLICY "Users insert own consent"
  ON public.consent_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- A user can read their own consent history.
DROP POLICY IF EXISTS "Users read own consent" ON public.consent_logs;
CREATE POLICY "Users read own consent"
  ON public.consent_logs
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins can read all consent rows (for audit + GDPR-style data export).
DROP POLICY IF EXISTS "Admins read all consent" ON public.consent_logs;
CREATE POLICY "Admins read all consent"
  ON public.consent_logs
  FOR SELECT
  USING (is_admin(auth.uid()));

-- ─── 2. deletion_requests + reference number sequence ─────────────
CREATE SEQUENCE IF NOT EXISTS public.deletion_ref_seq START 1;

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_number  TEXT UNIQUE NOT NULL DEFAULT (
                      'DEL-' || lpad(nextval('public.deletion_ref_seq')::text, 3, '0')
                    ),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','rejected')),
  customer_email    TEXT,
  customer_phone    TEXT,
  what_deleted      JSONB DEFAULT '[]'::jsonb,
  what_retained     JSONB DEFAULT '[]'::jsonb,
  notes             TEXT,
  created_by        UUID  -- the admin who marked it completed (if any)
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status        ON public.deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_requested_at  ON public.deletion_requests(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user_id       ON public.deletion_requests(user_id);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- A user can create a deletion request for themselves.
DROP POLICY IF EXISTS "Users create own deletion request" ON public.deletion_requests;
CREATE POLICY "Users create own deletion request"
  ON public.deletion_requests
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- A user can see their own deletion request (so the UI can show the
-- reference number back to them).
DROP POLICY IF EXISTS "Users read own deletion request" ON public.deletion_requests;
CREATE POLICY "Users read own deletion request"
  ON public.deletion_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins can read + update every request (mark complete, set notes).
DROP POLICY IF EXISTS "Admins read all deletion requests" ON public.deletion_requests;
CREATE POLICY "Admins read all deletion requests"
  ON public.deletion_requests
  FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update deletion requests" ON public.deletion_requests;
CREATE POLICY "Admins update deletion requests"
  ON public.deletion_requests
  FOR UPDATE
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
