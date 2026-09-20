-- =========================================================================
-- Stock deduction, server-side price validation, atomic cancel + refund.
-- All mutations happen inside SECURITY DEFINER RPCs. Direct client inserts
-- into orders/order_items are no longer needed (client code updated).
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper: restore stock for a set of orders.
-- Used by every cancellation / expire / payment-failed path so inventory
-- released by abandoned or failed orders comes back to the catalog.
-- Guarded against double-restore via orders.stock_restored_at sentinel.
-- -------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restored INT := 0;
  v_order_id UUID;
  v_item RECORD;
BEGIN
  FOREACH v_order_id IN ARRAY p_order_ids LOOP
    -- Lock the order row; skip if already restored
    PERFORM 1 FROM public.orders
    WHERE id = v_order_id
      AND stock_restored_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;

    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = v_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.product_id;
    END LOOP;

    UPDATE public.orders
    SET stock_restored_at = NOW()
    WHERE id = v_order_id;

    v_restored := v_restored + 1;
  END LOOP;

  RETURN v_restored;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_order_stock(UUID[]) FROM PUBLIC;

-- -------------------------------------------------------------------------
-- Rewrite: place_customer_order_with_credit.
-- Additions vs. current definition:
--   * For each item: FOR UPDATE lock on products, validate selling_price,
--     validate stock, decrement stock atomically.
--   * Everything else (fee split, order/order_items insert, credit debit)
--     is preserved 1:1 to keep COD/credit flows unchanged.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_customer_order_with_credit(
  p_vendor_groups jsonb,
  p_delivery_address jsonb,
  p_delivery_latitude numeric DEFAULT NULL,
  p_delivery_longitude numeric DEFAULT NULL,
  p_payment_method text DEFAULT 'credit',
  p_customer_notes text DEFAULT NULL,
  p_credit_used numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_platform_fee numeric DEFAULT 0,
  p_small_order_fee numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_current_balance numeric;
  v_credit_limit numeric;
  v_available_credit numeric;
  v_remaining_credit numeric;
  v_order_id uuid;
  v_order_number text;
  v_group jsonb;
  v_item jsonb;
  v_subtotal numeric;
  v_total_amount numeric;
  v_order_credit numeric;
  v_gst numeric;
  v_order_delivery_fee numeric;
  v_order_platform_fee numeric;
  v_order_small_order_fee numeric;
  v_payment_status payment_status;
  v_result jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_vendor_id uuid;
  v_product_id uuid;
  v_qty int;
  v_unit_price numeric;
  v_catalog_price numeric;
  v_stock integer;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Credit guard (unchanged)
  IF p_credit_used > 0 THEN
    SELECT credit_balance, credit_limit INTO v_current_balance, v_credit_limit
    FROM profiles
    WHERE user_id = v_customer_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    v_available_credit := COALESCE(v_credit_limit, 0) - COALESCE(v_current_balance, 0);
    IF p_credit_used > v_available_credit THEN
      RAISE EXCEPTION 'Insufficient credit. Available: %', v_available_credit;
    END IF;
  END IF;

  v_remaining_credit := p_credit_used;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_vendor_groups)
  LOOP
    v_vendor_id := (v_group->>'vendor_id')::uuid;

    -- -------------------------------------------------------
    -- NEW: lock every product, validate price, reserve stock.
    -- Do this BEFORE computing subtotal so validation errors
    -- abort the whole transaction cleanly.
    -- -------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty        := (v_item->>'quantity')::int;
      v_unit_price := (v_item->>'unit_price')::numeric;

      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'invalid quantity for product %', v_product_id;
      END IF;

      SELECT selling_price, stock_quantity
        INTO v_catalog_price, v_stock
      FROM public.products
      WHERE id = v_product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'product not found: %', v_product_id;
      END IF;

      IF ROUND(v_catalog_price, 2) <> ROUND(v_unit_price, 2) THEN
        RAISE EXCEPTION 'price tampering detected for product %: catalog=% client=%',
          v_product_id, v_catalog_price, v_unit_price;
      END IF;

      IF v_stock < v_qty THEN
        RAISE EXCEPTION 'insufficient stock for product %: available=% requested=%',
          v_product_id, v_stock, v_qty;
      END IF;

      UPDATE public.products
      SET stock_quantity = stock_quantity - v_qty
      WHERE id = v_product_id;
    END LOOP;

    -- Subtotal from catalog-verified prices
    v_subtotal := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_subtotal := v_subtotal + ((v_item->>'unit_price')::numeric * (v_item->>'quantity')::int);
    END LOOP;

    IF v_idx = 0 THEN
      v_order_delivery_fee := p_delivery_fee;
      v_order_platform_fee := p_platform_fee;
      v_order_small_order_fee := p_small_order_fee;
    ELSE
      v_order_delivery_fee := 0;
      v_order_platform_fee := 0;
      v_order_small_order_fee := 0;
    END IF;

    v_gst := v_order_platform_fee * 0.18;
    v_total_amount := v_subtotal + v_order_delivery_fee + v_order_platform_fee + v_order_small_order_fee + v_gst;

    v_order_credit := LEAST(v_remaining_credit, v_total_amount);
    v_remaining_credit := v_remaining_credit - v_order_credit;

    IF p_payment_method = 'credit' AND v_order_credit >= v_total_amount THEN
      v_payment_status := 'completed';
    ELSE
      v_payment_status := 'pending';
    END IF;

    v_order_number := 'AM' || upper(to_hex(extract(epoch from now())::bigint)) || upper(substr(md5(random()::text), 1, 4));

    INSERT INTO orders (
      order_number, customer_id, vendor_id,
      delivery_address, delivery_latitude, delivery_longitude,
      subtotal, delivery_fee, platform_fee, total_amount,
      payment_method, payment_status, credit_used, customer_notes, status
    ) VALUES (
      v_order_number, v_customer_id, v_vendor_id,
      p_delivery_address, p_delivery_latitude, p_delivery_longitude,
      v_subtotal, v_order_delivery_fee, v_order_platform_fee, v_total_amount,
      p_payment_method::payment_method, v_payment_status,
      CASE WHEN v_order_credit > 0 THEN v_order_credit ELSE NULL END,
      p_customer_notes, 'pending'::order_status
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      INSERT INTO order_items (
        order_id, product_id, product_snapshot,
        quantity, unit_price, mrp, discount_amount, total_price
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::uuid,
        v_item->'product_snapshot',
        (v_item->>'quantity')::int,
        (v_item->>'unit_price')::numeric,
        (v_item->>'mrp')::numeric,
        (v_item->>'discount_amount')::numeric,
        (v_item->>'total_price')::numeric
      );
    END LOOP;

    v_result := v_result || jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
    v_idx := v_idx + 1;
  END LOOP;

  -- Credit card model: increase due amount
  IF p_credit_used > 0 THEN
    UPDATE profiles
    SET credit_balance = credit_balance + p_credit_used
    WHERE user_id = v_customer_id;

    SELECT credit_balance INTO v_current_balance
    FROM profiles WHERE user_id = v_customer_id;

    INSERT INTO customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id
    ) VALUES (
      v_customer_id, p_credit_used, v_current_balance,
      'debit',
      'Used for order #' || (v_result->0->>'order_number'),
      (v_result->0->>'id')::uuid
    );
  END IF;

  RETURN v_result;
END;
$$;

-- -------------------------------------------------------------------------
-- New: cancel_customer_order.
-- Customer-callable. Single source of truth for cancellation.
-- Rules:
--   * Only the owner can cancel.
--   * Only cancellable while status IN ('pending','confirmed').
--   * Restores stock via restore_order_stock.
--   * If credit_used > 0: refunds credit_balance, logs 'credit' txn.
--   * Leaves payment_status alone if 'completed' (that's a refund case;
--     requires gateway refund via Razorpay).
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID := auth.uid();
  v_order RECORD;
  v_new_balance NUMERIC;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND customer_id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found or not yours';
  END IF;

  IF v_order.status NOT IN ('pending'::order_status, 'confirmed'::order_status) THEN
    RAISE EXCEPTION 'order cannot be cancelled in status %', v_order.status;
  END IF;

  IF v_order.payment_status = 'completed' THEN
    -- Completed payments need a gateway refund; don't fake-reverse in DB.
    RAISE EXCEPTION 'paid orders must be refunded via the payment gateway, not cancelled locally';
  END IF;

  UPDATE public.orders
  SET
    status = 'cancelled'::order_status,
    cancelled_at = NOW(),
    cancellation_reason = 'Cancelled by customer',
    updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM public.restore_order_stock(ARRAY[p_order_id]);

  IF COALESCE(v_order.credit_used, 0) > 0 THEN
    UPDATE profiles
    SET credit_balance = credit_balance - v_order.credit_used
    WHERE user_id = v_customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id
    ) VALUES (
      v_customer_id, v_order.credit_used, v_new_balance,
      'credit',
      'Refund: order ' || v_order.order_number || ' cancelled',
      p_order_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_customer_order(UUID) TO authenticated;

-- -------------------------------------------------------------------------
-- Wire stock-restore into the existing Razorpay failure paths.
-- -------------------------------------------------------------------------
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
  v_affected UUID[];
BEGIN
  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  SELECT BOOL_OR(payment_status = 'completed')
    INTO v_any_completed
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id;

  IF v_any_completed THEN
    RETURN jsonb_build_object('ignored', true, 'reason', 'already_completed');
  END IF;

  SELECT array_agg(id)
    INTO v_affected
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND payment_status <> 'completed';

  UPDATE public.orders SET
    payment_status = 'failed',
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = COALESCE(cancellation_reason, 'Payment failed'),
    updated_at = NOW()
  WHERE razorpay_order_id = p_razorpay_order_id
    AND payment_status <> 'completed';

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
    ON CONFLICT (order_id, razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL DO UPDATE SET
      status = 'failed',
      error_code = EXCLUDED.error_code,
      error_description = EXCLUDED.error_description,
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW();
  END LOOP;

  IF v_affected IS NOT NULL AND array_length(v_affected, 1) > 0 THEN
    PERFORM public.restore_order_stock(v_affected);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_razorpay_order_failed(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.cancel_pending_razorpay_order(
  p_razorpay_order_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID := auth.uid();
  v_any_completed BOOLEAN := FALSE;
  v_affected UUID[];
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = v_customer_id
  FOR UPDATE;

  SELECT BOOL_OR(payment_status = 'completed')
    INTO v_any_completed
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = v_customer_id;

  IF v_any_completed THEN
    RETURN jsonb_build_object('ignored', true, 'reason', 'already_completed');
  END IF;

  SELECT array_agg(id)
    INTO v_affected
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = v_customer_id
    AND payment_status <> 'completed';

  UPDATE public.orders
  SET
    payment_status = 'failed',
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = COALESCE(cancellation_reason, 'Payment cancelled by customer'),
    updated_at = NOW()
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = v_customer_id
    AND payment_status <> 'completed';

  IF v_affected IS NOT NULL AND array_length(v_affected, 1) > 0 THEN
    PERFORM public.restore_order_stock(v_affected);
  END IF;

  RETURN jsonb_build_object('ok', true, 'cancelled', COALESCE(array_length(v_affected, 1), 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_pending_razorpay_order(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_stale_razorpay_orders(
  p_older_than_minutes INT DEFAULT 15
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected UUID[];
BEGIN
  SELECT array_agg(id)
    INTO v_affected
  FROM public.orders
  WHERE payment_method = 'online'
    AND payment_status = 'pending'
    AND status = 'pending'
    AND created_at < NOW() - (p_older_than_minutes || ' minutes')::INTERVAL;

  IF v_affected IS NULL OR array_length(v_affected, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.orders
  SET
    payment_status = 'failed',
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = COALESCE(cancellation_reason, 'Payment window expired'),
    updated_at = NOW()
  WHERE id = ANY(v_affected);

  PERFORM public.restore_order_stock(v_affected);

  RETURN array_length(v_affected, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_razorpay_orders(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_razorpay_orders(INT) TO service_role;
