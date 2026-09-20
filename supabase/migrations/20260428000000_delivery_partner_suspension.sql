-- Delivery partner account-state suspension (mirrors vendors.status='suspended').
-- Lifecycle separate from delivery_status (which is the partner's own
-- availability toggle: offline/available/busy/on_break).
DO $$ BEGIN
  CREATE TYPE delivery_account_status AS ENUM ('active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS account_status delivery_account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Block suspended partners from passing the role gate. RLS policies that
-- key off is_delivery_partner() (orders SELECT/UPDATE, etc.) will start
-- returning empty for suspended partners immediately.
CREATE OR REPLACE FUNCTION public.is_delivery_partner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_partners
    WHERE user_id = _user_id
      AND account_status = 'active'
  )
$$;

-- Admin-callable RPC. Suspends or reactivates a partner.
-- Suspension also forces availability to 'offline' so they vanish from
-- auto-assignment immediately. In-flight orders are left intact (they
-- can finish what's already in their hands).
CREATE OR REPLACE FUNCTION public.set_delivery_partner_account_status(
  p_partner_id UUID,
  p_status delivery_account_status,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_was RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'only admins can change delivery partner account status';
  END IF;

  IF p_status = 'suspended' THEN
    IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
      RAISE EXCEPTION 'suspension reason is required (>= 3 chars)';
    END IF;
  END IF;

  SELECT id, account_status INTO v_was
  FROM public.delivery_partners
  WHERE id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery partner not found';
  END IF;

  IF p_status = 'suspended' THEN
    UPDATE public.delivery_partners
    SET account_status   = 'suspended',
        suspended_at     = NOW(),
        suspension_reason= p_reason,
        status           = 'offline'::delivery_status,
        updated_at       = NOW()
    WHERE id = p_partner_id;
  ELSE
    UPDATE public.delivery_partners
    SET account_status   = 'active',
        suspended_at     = NULL,
        suspension_reason= NULL,
        updated_at       = NOW()
    WHERE id = p_partner_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'partner_id', p_partner_id, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_delivery_partner_account_status(UUID, delivery_account_status, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_delivery_partner_account_status(UUID, delivery_account_status, TEXT) TO authenticated;
