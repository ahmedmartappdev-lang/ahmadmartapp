-- Admin audit log: every consequential admin action recorded with who/what/when.
-- Trigger-driven from the existing admin RPCs so we don't have to refactor
-- callers; the RPCs themselves call log_admin_action() at the end.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
  ON public.admin_audit_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON public.admin_audit_log(entity_type, entity_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins read audit log" ON public.admin_audit_log
  FOR SELECT USING (is_admin(auth.uid()));

-- No INSERT policy — writes only via the helper below
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_changes JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.admin_audit_log (admin_user_id, action, entity_type, entity_id, changes)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_changes, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- Patch existing admin RPCs to log their actions (best-effort; non-blocking).
-- record_cash_settlement
CREATE OR REPLACE FUNCTION public.record_cash_settlement(
  p_partner_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can record cash settlements';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be greater than zero';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.delivery_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'delivery partner not found';
  END IF;

  INSERT INTO public.cash_settlements (delivery_partner_id, amount, recorded_by, notes)
  VALUES (p_partner_id, p_amount, auth.uid(), NULLIF(TRIM(p_notes), ''))
  RETURNING id INTO v_id;

  PERFORM public.log_admin_action(
    'record_cash_settlement', 'delivery_partner', p_partner_id,
    jsonb_build_object('amount', p_amount, 'settlement_id', v_id, 'notes', p_notes)
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- set_delivery_partner_account_status — also log
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

  PERFORM public.log_admin_action(
    'set_partner_account_status', 'delivery_partner', p_partner_id,
    jsonb_build_object('from', v_was.account_status, 'to', p_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'partner_id', p_partner_id, 'status', p_status);
END;
$$;
