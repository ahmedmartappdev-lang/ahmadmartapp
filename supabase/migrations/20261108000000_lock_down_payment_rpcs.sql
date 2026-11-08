-- SECURITY: lock the Razorpay / credit payment RPCs to service_role only.
--
-- Earlier migrations only ran `REVOKE ... FROM PUBLIC`. Supabase also grants
-- EXECUTE on every new public function straight to anon and authenticated
-- (default privileges), so those grants stayed. PostgREST then exposed
-- them, and any caller could mark an order paid or wipe credit dues
-- without paying. Only the edge functions should call these. They use
-- SUPABASE_SERVICE_ROLE_KEY, so they keep working after this migration.
--
-- Signatures were checked against their latest definitions:
--   mark_razorpay_order_paid(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB)  20260426000000
--   mark_razorpay_order_failed(TEXT, TEXT, TEXT, TEXT, JSONB)         20260422030000
--   cancel_pending_razorpay_order(TEXT)                               20260422030000
--   expire_stale_razorpay_orders(INT)                                 20260422030000
--   record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB)     20260428100000
--
-- cancel_pending_razorpay_order(TEXT) gets the caller from auth.uid(), and
-- auth.uid() is NULL under service_role. So this migration adds a
-- (TEXT, UUID) overload that takes the customer id explicitly. The new
-- edge function `cancel-razorpay-order` calls that overload after it has
-- verified the user's JWT. The old 1-arg version is kept but becomes
-- unreachable from clients. It can be dropped later, once the new
-- frontend is live.

-- 1. Revoke from client roles, grant to service_role -----------------------

REVOKE ALL ON FUNCTION public.mark_razorpay_order_paid(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_razorpay_order_paid(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.mark_razorpay_order_failed(TEXT, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_razorpay_order_failed(TEXT, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.cancel_pending_razorpay_order(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_razorpay_order(TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.expire_stale_razorpay_orders(INT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_razorpay_orders(INT)
  TO service_role;

REVOKE ALL ON FUNCTION public.record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

-- 2. Service-role cancel with explicit customer id --------------------------
-- Same logic as the 1-arg version, plus two changes:
--   * it only touches orders that are still payment_method='online' AND
--     payment_status='pending', so a COD order that went through
--     "pay now" and was then dismissed is never cancelled;
--   * the customer id is a parameter, checked by the edge function.
CREATE OR REPLACE FUNCTION public.cancel_pending_razorpay_order(
  p_razorpay_order_id TEXT,
  p_customer_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_any_completed BOOLEAN := FALSE;
  v_affected UUID[];
BEGIN
  IF p_customer_id IS NULL OR p_razorpay_order_id IS NULL THEN
    RAISE EXCEPTION 'customer_id and razorpay_order_id required';
  END IF;

  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = p_customer_id
  FOR UPDATE;

  SELECT BOOL_OR(payment_status = 'completed')
    INTO v_any_completed
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = p_customer_id;

  IF v_any_completed THEN
    RETURN jsonb_build_object('ignored', true, 'reason', 'already_completed');
  END IF;

  SELECT array_agg(id)
    INTO v_affected
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
    AND customer_id = p_customer_id
    AND payment_method = 'online'
    AND payment_status = 'pending';

  IF v_affected IS NULL OR array_length(v_affected, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'cancelled', 0);
  END IF;

  UPDATE public.orders
  SET
    payment_status = 'failed',
    status = 'cancelled',
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = COALESCE(cancellation_reason, 'Payment cancelled by customer'),
    updated_at = NOW()
  WHERE id = ANY(v_affected);

  PERFORM public.restore_order_stock(v_affected);

  RETURN jsonb_build_object('ok', true, 'cancelled', array_length(v_affected, 1));
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pending_razorpay_order(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_razorpay_order(TEXT, UUID)
  TO service_role;
