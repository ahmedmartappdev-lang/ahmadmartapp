-- Fix: FOR UPDATE cannot be combined with aggregate (BOOL_OR) in the same SELECT.
-- Split into a row-lock pass, then an aggregate pass.
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
  -- 1. Lock all affected rows
  PERFORM 1 FROM public.orders
  WHERE razorpay_order_id = p_razorpay_order_id
  FOR UPDATE;

  -- 2. Check if any are already completed (no aggregate + FOR UPDATE conflict)
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
