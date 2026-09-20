-- Fix: ON CONFLICT must repeat the partial-index predicate for payments_order_payment_unique.
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

  SELECT BOOL_AND(payment_status = 'completed')
    INTO v_all_completed
  FROM public.orders
  WHERE id = ANY(v_order_ids);

  IF v_all_completed THEN
    RETURN jsonb_build_object('already_paid', true, 'order_ids', to_jsonb(v_order_ids));
  END IF;

  IF ROUND(p_amount::numeric, 2) <> ROUND(v_total_expected::numeric, 2) THEN
    RAISE EXCEPTION 'amount mismatch: gateway=% expected=%', p_amount, v_total_expected;
  END IF;

  UPDATE public.orders SET
    payment_status = 'completed',
    razorpay_payment_id = p_razorpay_payment_id,
    razorpay_signature = p_razorpay_signature,
    transaction_id = p_razorpay_payment_id,
    confirmed_at = COALESCE(confirmed_at, NOW()),
    status = CASE WHEN status = 'pending' THEN 'confirmed'::order_status ELSE status END,
    updated_at = NOW()
  WHERE id = ANY(v_order_ids) AND payment_status <> 'completed';

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

  RETURN jsonb_build_object('ok', true, 'order_ids', to_jsonb(v_order_ids), 'already_paid', false);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_razorpay_order_paid(TEXT, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;

-- Same fix for the failed RPC
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
    ON CONFLICT (order_id, razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL DO UPDATE SET
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
