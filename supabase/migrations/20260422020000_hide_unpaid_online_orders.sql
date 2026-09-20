-- 1. Hide unpaid online orders from vendors and delivery partners via RLS.
--    Customers must still see their own pending orders (so they can retry payment),
--    so the customer arm of the USING clause is unchanged.
DROP POLICY IF EXISTS orders_select ON public.orders;

CREATE POLICY orders_select ON public.orders FOR SELECT
USING (
  -- Customer sees their own orders (any status)
  auth.uid() = customer_id
  OR is_admin(auth.uid())
  OR (
    -- Vendor sees orders for their vendor_id, EXCEPT unpaid online orders
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = orders.vendor_id
        AND vendors.user_id = auth.uid()
    )
    AND NOT (
      payment_method = 'online'
      AND payment_status NOT IN ('completed', 'refunded')
    )
  )
  OR (
    -- Delivery partner sees assigned / pickable orders, EXCEPT unpaid online
    is_delivery_partner(auth.uid())
    AND (
      delivery_partner_id = (
        SELECT delivery_partners.id FROM delivery_partners
        WHERE delivery_partners.user_id = auth.uid()
        LIMIT 1
      )
      OR (
        status = 'ready_for_pickup'::order_status
        AND delivery_partner_id IS NULL
        AND is_auto_delivery_assignment()
      )
    )
    AND NOT (
      payment_method = 'online'
      AND payment_status NOT IN ('completed', 'refunded')
    )
  )
);

-- Same guard on UPDATE so vendors/delivery can't flip unpaid online orders either.
DROP POLICY IF EXISTS orders_update ON public.orders;

CREATE POLICY orders_update ON public.orders FOR UPDATE
USING (
  is_admin(auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM vendors
      WHERE vendors.id = orders.vendor_id
        AND vendors.user_id = auth.uid()
    )
    AND NOT (
      payment_method = 'online'
      AND payment_status NOT IN ('completed', 'refunded')
    )
  )
  OR (
    is_delivery_partner(auth.uid())
    AND (
      delivery_partner_id = (
        SELECT delivery_partners.id FROM delivery_partners
        WHERE delivery_partners.user_id = auth.uid()
        LIMIT 1
      )
      OR (
        status = 'ready_for_pickup'::order_status
        AND delivery_partner_id IS NULL
        AND is_auto_delivery_assignment()
      )
    )
    AND NOT (
      payment_method = 'online'
      AND payment_status NOT IN ('completed', 'refunded')
    )
  )
);

-- 2. One-off cleanup of zombie online orders from testing.
--    Any online order still pending and older than 15 minutes → cancelled.
UPDATE public.orders
SET
  payment_status = 'failed',
  status = 'cancelled',
  cancelled_at = NOW(),
  cancellation_reason = COALESCE(cancellation_reason, 'Payment not completed'),
  updated_at = NOW()
WHERE payment_method = 'online'
  AND payment_status = 'pending'
  AND status = 'pending'
  AND created_at < NOW() - INTERVAL '15 minutes';

-- 3. Customer-callable RPC to cancel their own unpaid online order.
--    Used by the client on modal dismiss / payment_failed. Must run as the
--    customer (so auth.uid() ownership check works).
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
  v_updated INT := 0;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Lock the rows
  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = v_customer_id
  FOR UPDATE;

  -- Refuse if any are already completed (don't cancel paid orders)
  SELECT BOOL_OR(payment_status = 'completed')
    INTO v_any_completed
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = v_customer_id;

  IF v_any_completed THEN
    RETURN jsonb_build_object('ignored', true, 'reason', 'already_completed');
  END IF;

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
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'cancelled', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_pending_razorpay_order(TEXT) TO authenticated;

-- 4. SECURITY DEFINER expiry that can be invoked from anywhere trusted
--    (edge fn cron, admin, or inline) to sweep stale unpaid online orders.
CREATE OR REPLACE FUNCTION public.expire_stale_razorpay_orders(
  p_older_than_minutes INT DEFAULT 15
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.orders
  SET
    payment_status = 'failed',
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = COALESCE(cancellation_reason, 'Payment window expired'),
    updated_at = NOW()
  WHERE payment_method = 'online'
    AND payment_status = 'pending'
    AND status = 'pending'
    AND created_at < NOW() - (p_older_than_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_razorpay_orders(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_razorpay_orders(INT) TO service_role;
