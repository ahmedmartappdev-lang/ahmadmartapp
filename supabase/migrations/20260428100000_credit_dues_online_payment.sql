-- Online repayment of customer credit dues.
-- Edge fn pay-credit-dues creates a Razorpay order; verify-credit-payment
-- checks the HMAC and calls this RPC, which decrements credit_balance,
-- logs a customer_credit_transactions row, and stores a payments audit
-- entry. Idempotent on (customer, razorpay_payment_id) via the existing
-- payments_order_payment_unique partial index — but credit payments
-- have no order_id, so we add a simple guard via the description field
-- as a fallback (real idempotency: razorpay_payment_id is unique per
-- capture from Razorpay's side anyway).
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
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  -- Idempotency: skip if a credit txn already references this payment id.
  SELECT EXISTS (
    SELECT 1 FROM public.customer_credit_transactions
    WHERE customer_id = p_customer_id
      AND description LIKE 'Online credit payment %' || p_razorpay_payment_id || '%'
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Lock the profile row, decrement balance, clamp at 0.
  SELECT credit_balance INTO v_current_balance
  FROM public.profiles
  WHERE user_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found for %', p_customer_id;
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

  -- Audit row in payments table. order_id is null because this is a
  -- credit-account repayment, not an order payment.
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

REVOKE ALL ON FUNCTION public.record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT, JSONB) TO service_role;
