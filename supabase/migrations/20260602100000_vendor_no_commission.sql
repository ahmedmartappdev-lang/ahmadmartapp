-- Vendor earnings: stop applying commission. Vendor's earning per unit is
-- vendor_selling_price — full stop. Ahmad Mart's margin is the spread
-- between admin_selling_price and vendor_selling_price (set on the
-- product), NOT a separate commission cut on top.
--
-- Previously accrue_vendor_earnings deducted 15% from vendor_gross before
-- writing to vendors.amount_due and vendor_payment_transactions. This
-- migration:
--   1. Patches the RPC to accrue at gross (no commission multiplier).
--   2. Backfills the existing 42 debit ledger rows so historical
--      earnings reflect the new policy — sets amount = full gross from
--      order_items. (Credit rows = manual payouts, untouched.)
--   3. Recomputes balance_after for every ledger row per vendor in
--      chronological order so the history remains coherent.
--   4. Recompiles each vendor's amount_due from the recomputed ledger.
--
-- commission_rate column stays — admin reporting still uses it as a
-- platform-side "commission earned" metric against admin subtotal,
-- which is independent of what we pay the vendor.

CREATE OR REPLACE FUNCTION public.accrue_vendor_earnings(p_order_id uuid)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id      UUID;
  v_status         TEXT;
  v_already        TIMESTAMPTZ;
  v_vendor_gross   NUMERIC;
  v_new_due        NUMERIC;
  v_order_number   TEXT;
BEGIN
  SELECT vendor_id, status::TEXT, vendor_earnings_accrued_at, order_number
    INTO v_vendor_id, v_status, v_already, v_order_number
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF v_status <> 'delivered' THEN
    RAISE EXCEPTION 'cannot accrue earnings for non-delivered order (status=%)', v_status;
  END IF;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'order % has no vendor_id', p_order_id;
  END IF;

  -- Vendor earns the FULL vendor_selling_price × quantity. No commission
  -- cut. Fall back to unit_price for legacy rows that pre-date the
  -- vendor_selling_price snapshot field (added 2026-05-18).
  SELECT COALESCE(SUM(
           COALESCE(
             NULLIF((product_snapshot->>'vendor_selling_price')::NUMERIC, 0),
             unit_price
           ) * quantity
         ), 0)
    INTO v_vendor_gross
  FROM public.order_items
  WHERE order_id = p_order_id;

  v_vendor_gross := ROUND(v_vendor_gross, 2);

  IF v_vendor_gross <= 0 THEN
    UPDATE public.orders SET vendor_earnings_accrued_at = NOW() WHERE id = p_order_id;
    RETURN 0;
  END IF;

  UPDATE public.vendors
  SET amount_due = COALESCE(amount_due, 0) + v_vendor_gross
  WHERE id = v_vendor_id
  RETURNING amount_due INTO v_new_due;

  INSERT INTO public.vendor_payment_transactions (
    vendor_id, amount, transaction_type, balance_after,
    description, order_id
  ) VALUES (
    v_vendor_id, v_vendor_gross, 'debit', v_new_due,
    'Earnings: order ' || COALESCE(v_order_number, p_order_id::TEXT),
    p_order_id
  );

  UPDATE public.orders
  SET vendor_earnings_accrued_at = NOW()
  WHERE id = p_order_id;

  RETURN v_vendor_gross;
END;
$$;

-- ====== BACKFILL ======

-- 1. Restate each historical 'debit' ledger row at gross. Match the same
--    formula the new RPC uses so future inserts and past rows agree.
UPDATE public.vendor_payment_transactions vpt
   SET amount = sub.gross
  FROM (
    SELECT oi.order_id,
           SUM(COALESCE(
                 NULLIF((oi.product_snapshot->>'vendor_selling_price')::NUMERIC, 0),
                 oi.unit_price
               ) * oi.quantity)::numeric AS gross
      FROM public.order_items oi
     GROUP BY oi.order_id
  ) sub
 WHERE vpt.order_id = sub.order_id
   AND vpt.transaction_type = 'debit'
   AND sub.gross IS NOT NULL;

-- 2. Recompute balance_after for every ledger row in chronological
--    order per vendor. Keeps the running history coherent so the
--    vendor's payments page reads correctly going back through time.
WITH ordered AS (
  SELECT id,
         SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE -amount END)
           OVER (PARTITION BY vendor_id ORDER BY created_at, id) AS running
    FROM public.vendor_payment_transactions
)
UPDATE public.vendor_payment_transactions vpt
   SET balance_after = ordered.running
  FROM ordered
 WHERE ordered.id = vpt.id;

-- 3. Recompile vendors.amount_due from the recomputed ledger.
UPDATE public.vendors v
   SET amount_due = COALESCE((
         SELECT SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE -amount END)
           FROM public.vendor_payment_transactions
          WHERE vendor_id = v.id
       ), 0);
