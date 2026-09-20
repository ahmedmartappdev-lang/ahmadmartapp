-- Admin order flows: enforce credit limit + maintain credit ledger.
--
-- Bug being fixed: admin_create_order silently ignored credit accounting
-- entirely, and AdminEditOrder did direct UPDATEs that didn't validate
-- credit limit and didn't keep orders.credit_used in sync. Result: admin
-- could place a ₹600 credit order on a customer with ₹500 limit, and the
-- platform never recovered the money.
--
-- This migration:
--   1. Rewrites admin_create_order to accept p_credit_used, validate
--      against credit_limit, debit profile balance, log txn.
--   2. Adds admin_finalize_order_edit RPC that the AdminEditOrder client
--      calls AFTER it updates order_items, to reconcile totals + credit
--      atomically with proper validation.

-- Drop the previous overload (sans p_credit_used) so the new one is unambiguous.
DROP FUNCTION IF EXISTS public.admin_create_order(
  text, uuid, uuid, jsonb, double precision, double precision,
  numeric, numeric, numeric, numeric, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.admin_create_order(
  p_order_number text,
  p_customer_id uuid,
  p_vendor_id uuid,
  p_delivery_address jsonb,
  p_delivery_latitude double precision DEFAULT NULL,
  p_delivery_longitude double precision DEFAULT NULL,
  p_subtotal numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_platform_fee numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_payment_status text DEFAULT 'pending',
  p_customer_notes text DEFAULT NULL,
  p_status text DEFAULT 'confirmed',
  p_order_items jsonb DEFAULT '[]'::jsonb,
  p_credit_used numeric DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_credit_balance NUMERIC;
  v_credit_limit NUMERIC;
  v_available NUMERIC;
  v_new_balance NUMERIC;
  v_effective_credit_used NUMERIC := COALESCE(p_credit_used, 0);
  v_effective_payment_status TEXT := p_payment_status;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  -- Single-method rule: no partial credit
  IF p_payment_method <> 'credit' AND v_effective_credit_used > 0 THEN
    RAISE EXCEPTION 'Partial payments not allowed: % cannot be combined with credit', p_payment_method;
  END IF;

  IF p_payment_method = 'credit' THEN
    -- For credit orders, credit_used must equal the full bill
    v_effective_credit_used := p_total_amount;

    -- Lock profile, validate available credit
    SELECT credit_balance, credit_limit
      INTO v_credit_balance, v_credit_limit
    FROM public.profiles
    WHERE user_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer profile not found';
    END IF;

    v_available := COALESCE(v_credit_limit, 0) - COALESCE(v_credit_balance, 0);

    IF p_total_amount > v_available THEN
      RAISE EXCEPTION 'This order (Rs.%) exceeds the customer''s available credit (Rs.%). Reduce items or pick another payment method.',
        p_total_amount, v_available;
    END IF;

    -- Credit-paid orders are paid at order time
    v_effective_payment_status := 'completed';
  END IF;

  -- Insert order
  INSERT INTO public.orders (
    order_number, customer_id, vendor_id, delivery_address,
    delivery_latitude, delivery_longitude,
    subtotal, delivery_fee, platform_fee, total_amount,
    payment_method, payment_status, credit_used, customer_notes, status
  ) VALUES (
    p_order_number, p_customer_id, p_vendor_id, p_delivery_address,
    p_delivery_latitude, p_delivery_longitude,
    p_subtotal, p_delivery_fee, p_platform_fee, p_total_amount,
    p_payment_method::payment_method, v_effective_payment_status::payment_status,
    CASE WHEN v_effective_credit_used > 0 THEN v_effective_credit_used ELSE NULL END,
    p_customer_notes, p_status::order_status
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_snapshot,
      quantity, unit_price, mrp, discount_amount, total_price
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->'product_snapshot',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'mrp')::DECIMAL,
      (v_item->>'discount_amount')::DECIMAL,
      (v_item->>'total_price')::DECIMAL
    );
  END LOOP;

  -- If credit was used, debit profile + log txn
  IF v_effective_credit_used > 0 THEN
    UPDATE public.profiles
    SET credit_balance = COALESCE(credit_balance, 0) + v_effective_credit_used,
        updated_at = NOW()
    WHERE user_id = p_customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO public.customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id, created_by
    ) VALUES (
      p_customer_id,
      v_effective_credit_used,
      v_new_balance,
      'debit',
      'Used for order #' || p_order_number || ' (admin-placed)',
      v_order_id,
      auth.uid()
    );
  END IF;

  RETURN v_order_id;
END;
$$;


-- Reconciles an existing order after admin edits items/totals.
-- The client still updates order_items via direct table writes; this RPC
-- is the atomic finishing step that updates the order row + adjusts the
-- customer's credit balance with proper validation. No more silent
-- over-limit edits.
CREATE OR REPLACE FUNCTION public.admin_finalize_order_edit(
  p_order_id UUID,
  p_new_subtotal NUMERIC,
  p_new_total NUMERIC,
  p_customer_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_old_credit_used NUMERIC;
  v_new_credit_used NUMERIC;
  v_diff NUMERIC;
  v_credit_balance NUMERIC;
  v_credit_limit NUMERIC;
  v_available_for_increase NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_old_credit_used := COALESCE(v_order.credit_used, 0);

  IF v_order.payment_method::TEXT = 'credit' THEN
    v_new_credit_used := p_new_total;
  ELSE
    v_new_credit_used := 0;
  END IF;

  v_diff := v_new_credit_used - v_old_credit_used;

  -- If we're INCREASING the credit owed, validate against the customer's
  -- remaining headroom. The headroom calculation effectively gives the
  -- customer back what's already attributed to this order, so editing
  -- a 400-credit order back up to 500 is valid as long as 100 of free
  -- room is available now.
  IF v_diff > 0 THEN
    SELECT credit_balance, credit_limit
      INTO v_credit_balance, v_credit_limit
    FROM public.profiles
    WHERE user_id = v_order.customer_id
    FOR UPDATE;

    v_available_for_increase := COALESCE(v_credit_limit, 0) - COALESCE(v_credit_balance, 0);

    IF v_diff > v_available_for_increase THEN
      RAISE EXCEPTION 'This order (Rs.%) exceeds the customer''s available credit (Rs.%). Reduce items or pick another payment method.',
        p_new_total, COALESCE(v_credit_balance, 0) + v_available_for_increase - v_old_credit_used + v_old_credit_used;
    END IF;
  END IF;

  -- Update order row
  UPDATE public.orders
  SET subtotal       = p_new_subtotal,
      total_amount   = p_new_total,
      credit_used    = CASE WHEN payment_method::TEXT = 'credit' THEN p_new_total ELSE credit_used END,
      customer_notes = COALESCE(p_customer_notes, customer_notes),
      updated_at     = NOW()
  WHERE id = p_order_id;

  -- Adjust profile + log txn if credit moved
  IF v_diff <> 0 THEN
    UPDATE public.profiles
    SET credit_balance = GREATEST(0, COALESCE(credit_balance, 0) + v_diff),
        updated_at     = NOW()
    WHERE user_id = v_order.customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO public.customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id, created_by
    ) VALUES (
      v_order.customer_id,
      ABS(v_diff),
      v_new_balance,
      CASE WHEN v_diff > 0 THEN 'debit' ELSE 'credit' END,
      'Order ' || v_order.order_number || ' edited: ' ||
        CASE WHEN v_diff > 0 THEN '+Rs. ' ELSE '-Rs. ' END || ABS(v_diff)::TEXT,
      p_order_id,
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'credit_diff', v_diff, 'new_credit_used', v_new_credit_used);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finalize_order_edit(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_finalize_order_edit(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
