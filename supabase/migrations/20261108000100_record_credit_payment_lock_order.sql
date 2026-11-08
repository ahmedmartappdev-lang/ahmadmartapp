-- record_credit_payment: make it idempotent when calls run concurrently.
--
-- The razorpay-webhook now also calls this RPC (payment.captured for
-- notes.purpose='credit_dues'). That means verify-credit-payment and the
-- webhook can run at the same moment for the same payment. The old body
-- did its "already recorded?" check BEFORE it locked the profile row, so
-- two concurrent calls could both pass the check and reduce the dues twice.
-- This version takes the profile row lock first and then checks.
-- The signature is unchanged and CREATE OR REPLACE keeps the existing grants
-- (service_role only, after 20261108000000).
CREATE OR REPLACE FUNCTION public.record_credit_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_razorpay_order_id TEXT,
  p_razorpay_payment_id TEXT,
  p_razorpay_signature TEXT,
  p_raw JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance     NUMERIC;
  v_already         BOOLEAN;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id required';
  END IF;
  IF p_razorpay_payment_id IS NULL OR p_razorpay_payment_id = '' THEN
    RAISE EXCEPTION 'razorpay_payment_id required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  -- Lock the profile row first; this serialises concurrent calls.
  SELECT credit_balance INTO v_current_balance
  FROM public.profiles
  WHERE user_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found for %', p_customer_id;
  END IF;

  -- Idempotency (now under the lock), checked against both the credit txn
  -- and the payments audit row.
  SELECT EXISTS (
    SELECT 1 FROM public.customer_credit_transactions
    WHERE customer_id = p_customer_id
      AND description = 'Online credit payment ' || p_razorpay_payment_id
  ) OR EXISTS (
    SELECT 1 FROM public.payments
    WHERE order_id IS NULL
      AND customer_id = p_customer_id
      AND razorpay_payment_id = p_razorpay_payment_id
      AND status = 'captured'
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_new_balance := GREATEST(0, COALESCE(v_current_balance, 0) - p_amount);

  UPDATE public.profiles
  SET credit_balance = v_new_balance,
      updated_at     = NOW()
  WHERE user_id = p_customer_id;

  INSERT INTO public.customer_credit_transactions (
    customer_id, amount, balance_after, transaction_type, description
  ) VALUES (
    p_customer_id,
    p_amount,
    v_new_balance,
    'credit',
    'Online credit payment ' || p_razorpay_payment_id
  );

  INSERT INTO public.payments (
    order_id, customer_id, gateway, razorpay_order_id, razorpay_payment_id,
    razorpay_signature, amount, currency, status, method, raw_payload
  ) VALUES (
    NULL, p_customer_id, 'razorpay', p_razorpay_order_id, p_razorpay_payment_id,
    p_razorpay_signature, p_amount, 'INR', 'captured', 'online', p_raw
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'previous_balance', v_current_balance,
    'new_balance', v_new_balance,
    'paid', p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB)
  TO service_role;
