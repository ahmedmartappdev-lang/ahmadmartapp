-- Fix: FOR UPDATE cannot be combined with aggregates (array_agg, SUM) in the same SELECT.
-- Split the locking pass from the aggregate pass.
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
  -- 1. Lock all orders sharing this razorpay_order_id (no aggregates here)
  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  -- 2. Now aggregate ids + expected total in a separate pass
  SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::UUID[]),
         COALESCE(SUM(total_amount), 0)
    INTO v_order_ids, v_total_expected
  FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id;

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

  -- Server-side amount guard
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

  -- One payment audit row per order
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
