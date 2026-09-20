-- Cash settlements: admin records physical cash handed over by a delivery
-- partner. This is the missing piece that lets a partner's "net to transfer"
-- balance actually drop to zero once they've paid up.
--
-- Writes happen ONLY through record_cash_settlement() so every entry is
-- traceable to the admin who recorded it. No direct INSERT policy.

CREATE TABLE IF NOT EXISTS public.cash_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id UUID NOT NULL REFERENCES public.delivery_partners(id),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  recorded_by UUID NOT NULL,
  notes TEXT,
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_settlements_partner
  ON public.cash_settlements(delivery_partner_id, settled_at DESC);

ALTER TABLE public.cash_settlements ENABLE ROW LEVEL SECURITY;

-- Partner can read own
DROP POLICY IF EXISTS "Partners read own settlements" ON public.cash_settlements;
CREATE POLICY "Partners read own settlements" ON public.cash_settlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.delivery_partners
      WHERE id = cash_settlements.delivery_partner_id
        AND user_id = auth.uid()
    )
  );

-- Admin can read all
DROP POLICY IF EXISTS "Admins read all settlements" ON public.cash_settlements;
CREATE POLICY "Admins read all settlements" ON public.cash_settlements
  FOR SELECT USING (is_admin(auth.uid()));

-- (No INSERT/UPDATE/DELETE policies — writes go through the RPC.)

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

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_cash_settlement(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_cash_settlement(UUID, NUMERIC, TEXT) TO authenticated;
