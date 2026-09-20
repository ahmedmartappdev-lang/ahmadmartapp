-- =====================================================
-- Razorpay Payment System
-- Adds: 'online' payment_method enum value, razorpay columns on orders,
-- payments audit table, webhook idempotency table, and SECURITY DEFINER
-- RPCs used by both the verify edge function and the webhook to
-- atomically mark all related orders paid/failed.
-- Multi-vendor checkouts create multiple order rows that share one
-- razorpay_order_id (a single Razorpay charge for the whole cart).
-- =====================================================

-- 1. Extend payment_method enum with 'online'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_method' AND e.enumlabel = 'online'
  ) THEN
    ALTER TYPE public.payment_method ADD VALUE 'online';
  END IF;
END$$;

-- 2. Razorpay tracking columns on orders (non-unique; multi-vendor shares one razorpay order)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id
  ON public.orders(razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id
  ON public.orders(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 3. payments audit table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  gateway TEXT NOT NULL DEFAULT 'razorpay',
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL CHECK (status IN ('created','attempted','captured','failed','refunded')),
  method TEXT,
  error_code TEXT,
  error_description TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique per (order, payment_id) pair — a given payment attempt against an order only flips once
CREATE UNIQUE INDEX IF NOT EXISTS payments_order_payment_unique
  ON public.payments(order_id, razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_read_own_payments" ON public.payments;
CREATE POLICY "customers_read_own_payments" ON public.payments
  FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "admins_read_all_payments" ON public.payments;
CREATE POLICY "admins_read_all_payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies → only service_role writes.

-- 4. Webhook event log (idempotency + audit)
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  signature TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rzp_webhook_events_type ON public.razorpay_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_rzp_webhook_events_created ON public.razorpay_webhook_events(created_at DESC);

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies → only service_role can access.

-- 5. Atomic "mark paid" RPC — loops over ALL orders sharing the razorpay_order_id.
--    Idempotent, amount-guarded, FOR UPDATE locked.
CREATE OR REPLACE FUNCTION public.mark_razorpay_order_paid(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_razorpay_signature TEXT,
  p_amount NUMERIC,
  p_method TEXT,
  p_raw JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_ids UUID[];
  v_total_expected NUMERIC := 0;
  v_order RECORD;
  v_all_completed BOOLEAN := TRUE;
BEGIN
  -- Lock all orders that share this razorpay_order_id
  SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::UUID[]),
         COALESCE(SUM(total_amount), 0)
    INTO v_order_ids, v_total_expected
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no orders found for razorpay_order_id=%', p_razorpay_order_id;
  END IF;

  -- Idempotency: if every order is already completed, short-circuit
  SELECT BOOL_AND(payment_status = 'completed')
    INTO v_all_completed
  FROM public.orders
  WHERE id = ANY(v_order_ids);

  IF v_all_completed THEN
    RETURN jsonb_build_object('already_paid', true, 'order_ids', to_jsonb(v_order_ids));
  END IF;

  -- Server-side amount guard — reject if the charge doesn't match the sum of totals
  IF ROUND(p_amount::numeric, 2) <> ROUND(v_total_expected::numeric, 2) THEN
    RAISE EXCEPTION 'amount mismatch: gateway=% expected=%', p_amount, v_total_expected;
  END IF;

  -- Flip every order in the group
  UPDATE public.orders SET
    payment_status = 'completed',
    razorpay_payment_id = p_razorpay_payment_id,
    razorpay_signature = p_razorpay_signature,
    transaction_id = p_razorpay_payment_id,
    confirmed_at = COALESCE(confirmed_at, NOW()),
    status = CASE WHEN status = 'pending' THEN 'confirmed'::order_status ELSE status END,
    updated_at = NOW()
  WHERE id = ANY(v_order_ids) AND payment_status <> 'completed';

  -- One payment audit row per order (idempotent via partial unique index)
  FOR v_order IN
    SELECT id, customer_id, total_amount
    FROM public.orders
    WHERE id = ANY(v_order_ids)
  LOOP
    INSERT INTO public.payments (
      order_id, customer_id, razorpay_order_id, razorpay_payment_id,
      razorpay_signature, amount, currency, status, method, raw_payload
    ) VALUES (
      v_order.id, v_order.customer_id, p_razorpay_order_id, p_razorpay_payment_id,
      p_razorpay_signature, v_order.total_amount, 'INR', 'captured', p_method, p_raw
    )
    ON CONFLICT (order_id, razorpay_payment_id) DO UPDATE SET
      status = 'captured',
      razorpay_signature = EXCLUDED.razorpay_signature,
      raw_payload = EXCLUDED.raw_payload,
      method = COALESCE(EXCLUDED.method, public.payments.method),
      updated_at = NOW();
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'order_ids', to_jsonb(v_order_ids), 'already_paid', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_razorpay_order_paid(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;

-- 6. Mark failed RPC — webhook-side for payment.failed
CREATE OR REPLACE FUNCTION public.mark_razorpay_order_failed(
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_error_code TEXT,
  p_error_description TEXT,
  p_raw JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_any_completed BOOLEAN := FALSE;
BEGIN
  SELECT BOOL_OR(payment_status = 'completed')
    INTO v_any_completed
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  IF v_any_completed THEN
    RETURN jsonb_build_object('ignored', true, 'reason', 'already_completed');
  END IF;

  UPDATE public.orders SET
    payment_status = 'failed',
    updated_at = NOW()
  WHERE razorpay_order_id = p_razorpay_order_id AND payment_status <> 'completed';

  FOR v_order IN
    SELECT id, customer_id, total_amount
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
  LOOP
    INSERT INTO public.payments (
      order_id, customer_id, razorpay_order_id, razorpay_payment_id,
      amount, currency, status, error_code, error_description, raw_payload
    ) VALUES (
      v_order.id, v_order.customer_id, p_razorpay_order_id, p_razorpay_payment_id,
      v_order.total_amount, 'INR', 'failed', p_error_code, p_error_description, p_raw
    )
    ON CONFLICT (order_id, razorpay_payment_id) DO UPDATE SET
      status = 'failed',
      error_code = EXCLUDED.error_code,
      error_description = EXCLUDED.error_description,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW();
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_razorpay_order_failed(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

COMMENT ON TABLE public.payments IS 'Audit log of every Razorpay payment attempt. Service role writes only.';
COMMENT ON TABLE public.razorpay_webhook_events IS 'Webhook event log for idempotency and audit. Service role only.';
COMMENT ON FUNCTION public.mark_razorpay_order_paid IS 'Atomically mark ALL orders in a razorpay_order_id group paid after signature verification. Enforces amount match; idempotent.';
