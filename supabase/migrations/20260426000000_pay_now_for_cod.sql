-- Pay-Now-for-COD support.
-- mark_razorpay_order_paid now also flips payment_method to 'online' so
-- vendors / delivery / reporting treat a COD order paid online identically
-- to a regular online order. Refuses to flip orders already cancelled
-- (covers the rare cancel-mid-payment race; the audit row in payments
-- still records the capture so a manual refund can be initiated).
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
  v_any_cancelled BOOLEAN := FALSE;
BEGIN
  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::UUID[]),
         COALESCE(SUM(total_amount), 0)
    INTO v_order_ids, v_total_expected
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id;

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no orders found for razorpay_order_id=%', p_razorpay_order_id;
  END IF;

  SELECT BOOL_AND(payment_status = 'completed'),
         BOOL_OR(status = 'cancelled')
    INTO v_all_completed, v_any_cancelled
  FROM public.orders
  WHERE id = ANY(v_order_ids);

  IF v_all_completed THEN
    RETURN jsonb_build_object('already_paid', true, 'order_ids', to_jsonb(v_order_ids));
  END IF;

  IF ROUND(p_amount::numeric, 2) <> ROUND(v_total_expected::numeric, 2) THEN
    RAISE EXCEPTION 'amount mismatch: gateway=% expected=%', p_amount, v_total_expected;
  END IF;

  -- Always insert payments audit rows so reconciliation has the truth even
  -- if the order was cancelled mid-flight.
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
    ON CONFLICT (order_id, razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL DO UPDATE SET
      status = 'captured',
      razorpay_signature = EXCLUDED.razorpay_signature,
      raw_payload = EXCLUDED.raw_payload,
      method = COALESCE(EXCLUDED.method, public.payments.method),
      updated_at = NOW();
  END LOOP;

  IF v_any_cancelled THEN
    -- Don't un-cancel orders. The capture is recorded above; flag for refund.
    RETURN jsonb_build_object(
      'ok', true,
      'order_ids', to_jsonb(v_order_ids),
      'requires_refund', true,
      'reason', 'payment captured but order is cancelled'
    );
  END IF;

  -- Flip every order in the group: payment_method becomes 'online' so the
  -- delivery / vendor flow won't try to collect cash for a COD-paid-online.
  UPDATE public.orders SET
    payment_status = 'completed',
    payment_method = 'online'::payment_method,
    razorpay_payment_id = p_razorpay_payment_id,
    razorpay_signature = p_razorpay_signature,
    transaction_id = p_razorpay_payment_id,
    confirmed_at = COALESCE(confirmed_at, NOW()),
    status = CASE WHEN status = 'pending' THEN 'confirmed'::order_status ELSE status END,
    updated_at = NOW()
  WHERE id = ANY(v_order_ids) AND payment_status <> 'completed';

  RETURN jsonb_build_object('ok', true, 'order_ids', to_jsonb(v_order_ids), 'already_paid', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_razorpay_order_paid(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
