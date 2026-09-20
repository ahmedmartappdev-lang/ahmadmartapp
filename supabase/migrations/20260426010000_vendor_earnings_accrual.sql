-- Vendor earnings accrual.
-- Up to now vendors.amount_due was never incremented, so the admin
-- "Vendor Dues" page showed ₹0 for every vendor. This migration:
--   1. Adds an idempotency sentinel orders.vendor_earnings_accrued_at.
--   2. Adds vendor_payment_transactions.order_id for traceability.
--   3. Defines accrue / reverse helpers (SECURITY DEFINER).
--   4. Wires a trigger so status flips drive accrual / reversal automatically.
--   5. Backfills every already-delivered order so the dashboard reflects
--      historical earnings immediately.

-- 1. Sentinel column
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor_earnings_accrued_at TIMESTAMPTZ;

-- 2. Order-id link on the txn table for audit + idempotency lookups
ALTER TABLE public.vendor_payment_transactions
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_payment_txn_order_id
  ON public.vendor_payment_transactions(order_id)
  WHERE order_id IS NOT NULL;

-- 3a. Accrue helper.
-- Idempotent: skips if vendor_earnings_accrued_at is already set.
-- Snapshots the commission rate so a later commission_rate change doesn't
-- silently alter past earnings.
CREATE OR REPLACE FUNCTION public.accrue_vendor_earnings(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal       NUMERIC;
  v_vendor_id      UUID;
  v_status         TEXT;
  v_already        TIMESTAMPTZ;
  v_commission     NUMERIC;
  v_vendor_share   NUMERIC;
  v_new_due        NUMERIC;
  v_order_number   TEXT;
BEGIN
  -- Lock the order row first
  SELECT subtotal, vendor_id, status::TEXT, vendor_earnings_accrued_at, order_number
    INTO v_subtotal, v_vendor_id, v_status, v_already, v_order_number
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN 0;  -- idempotent no-op
  END IF;

  IF v_status <> 'delivered' THEN
    RAISE EXCEPTION 'cannot accrue earnings for non-delivered order (status=%)', v_status;
  END IF;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'order % has no vendor_id', p_order_id;
  END IF;

  -- Lock the vendor row, snapshot commission_rate
  SELECT COALESCE(commission_rate, 15)
    INTO v_commission
  FROM public.vendors
  WHERE id = v_vendor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor not found: %', v_vendor_id;
  END IF;

  v_vendor_share := ROUND(COALESCE(v_subtotal, 0) * (1 - v_commission / 100.0), 2);
  IF v_vendor_share <= 0 THEN
    -- Still mark the sentinel so we don't keep retrying on zero-subtotal orders.
    UPDATE public.orders SET vendor_earnings_accrued_at = NOW() WHERE id = p_order_id;
    RETURN 0;
  END IF;

  UPDATE public.vendors
  SET amount_due = COALESCE(amount_due, 0) + v_vendor_share
  WHERE id = v_vendor_id
  RETURNING amount_due INTO v_new_due;

  INSERT INTO public.vendor_payment_transactions (
    vendor_id, amount, transaction_type, balance_after,
    description, order_id
  ) VALUES (
    v_vendor_id, v_vendor_share, 'debit', v_new_due,
    'Earnings: order ' || COALESCE(v_order_number, p_order_id::TEXT)
      || ' (commission ' || v_commission || '%)',
    p_order_id
  );

  UPDATE public.orders
  SET vendor_earnings_accrued_at = NOW()
  WHERE id = p_order_id;

  RETURN v_vendor_share;
END;
$$;

REVOKE ALL ON FUNCTION public.accrue_vendor_earnings(UUID) FROM PUBLIC;

-- 3b. Reverse helper for cancellations / refunds AFTER delivery.
CREATE OR REPLACE FUNCTION public.reverse_vendor_earnings(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already       TIMESTAMPTZ;
  v_vendor_id     UUID;
  v_order_number  TEXT;
  v_share         NUMERIC;
  v_new_due       NUMERIC;
BEGIN
  SELECT vendor_earnings_accrued_at, vendor_id, order_number
    INTO v_already, v_vendor_id, v_order_number
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  IF v_already IS NULL THEN
    RETURN 0;  -- nothing to reverse
  END IF;

  -- Find the most recent debit txn we wrote for this order.
  SELECT amount
    INTO v_share
  FROM public.vendor_payment_transactions
  WHERE order_id = p_order_id
    AND transaction_type = 'debit'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_share IS NULL OR v_share <= 0 THEN
    UPDATE public.orders
      SET vendor_earnings_accrued_at = NULL
      WHERE id = p_order_id;
    RETURN 0;
  END IF;

  UPDATE public.vendors
    SET amount_due = GREATEST(0, COALESCE(amount_due, 0) - v_share)
    WHERE id = v_vendor_id
    RETURNING amount_due INTO v_new_due;

  INSERT INTO public.vendor_payment_transactions (
    vendor_id, amount, transaction_type, balance_after,
    description, order_id
  ) VALUES (
    v_vendor_id, v_share, 'credit', v_new_due,
    'Reversal: order ' || COALESCE(v_order_number, p_order_id::TEXT)
      || ' refunded/cancelled',
    p_order_id
  );

  UPDATE public.orders
    SET vendor_earnings_accrued_at = NULL
    WHERE id = p_order_id;

  RETURN v_share;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_vendor_earnings(UUID) FROM PUBLIC;

-- 4. Trigger glue: on UPDATE of orders, accrue when status enters delivered;
--    reverse when an already-accrued order leaves delivered (refunded /
--    cancelled). Also reverses if payment_status flips to 'refunded'.
CREATE OR REPLACE FUNCTION public.trg_orders_vendor_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Status entered 'delivered' → accrue if not already accrued
  IF NEW.status::TEXT = 'delivered'
     AND OLD.status::TEXT IS DISTINCT FROM 'delivered'
     AND NEW.vendor_earnings_accrued_at IS NULL THEN
    PERFORM public.accrue_vendor_earnings(NEW.id);
  END IF;

  -- Status left 'delivered' (cancelled / refunded) AFTER having been accrued
  IF OLD.status::TEXT = 'delivered'
     AND NEW.status::TEXT IS DISTINCT FROM 'delivered'
     AND NEW.status::TEXT IN ('cancelled', 'refunded')
     AND OLD.vendor_earnings_accrued_at IS NOT NULL THEN
    PERFORM public.reverse_vendor_earnings(NEW.id);
  END IF;

  -- payment_status flipped to refunded on a still-delivered order
  IF NEW.status::TEXT = 'delivered'
     AND NEW.payment_status::TEXT = 'refunded'
     AND OLD.payment_status::TEXT IS DISTINCT FROM 'refunded'
     AND OLD.vendor_earnings_accrued_at IS NOT NULL THEN
    PERFORM public.reverse_vendor_earnings(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_vendor_earnings ON public.orders;
CREATE TRIGGER trg_orders_vendor_earnings
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_vendor_earnings();

-- 5. Backfill everything currently delivered without an accrual sentinel.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.orders
    WHERE status = 'delivered'
      AND vendor_earnings_accrued_at IS NULL
      AND vendor_id IS NOT NULL
    ORDER BY created_at ASC
  LOOP
    PERFORM public.accrue_vendor_earnings(r.id);
  END LOOP;
END $$;
