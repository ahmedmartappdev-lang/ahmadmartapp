-- Close a security hole: delivery partner could mark an order delivered
-- with payment_method='credit' via a plain UPDATE (see
-- src/pages/delivery/DeliveryActive.tsx verifyOtpAndDeliver before this fix).
-- No credit-limit check, no debit on profiles.credit_balance, no row in
-- customer_credit_transactions. Customer paid nothing yet the order showed
-- "completed" — money compromised.
--
-- This RPC mirrors the credit handling already in
-- place_customer_order_with_credit: validate available credit, increment
-- profiles.credit_balance, write a customer_credit_transactions debit row,
-- then mark the order delivered. All inside a single transaction.

CREATE OR REPLACE FUNCTION public.delivery_complete_order_with_credit(
  p_order_id      UUID,
  p_otp           TEXT,
  p_payment_method TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid       UUID := auth.uid();
  v_partner_id       UUID;
  v_order_partner_id UUID;
  v_customer_id      UUID;
  v_order_otp        TEXT;
  v_order_status     TEXT;
  v_payment_status   payment_status;
  v_existing_method  payment_method;
  v_existing_credit  NUMERIC;
  v_total_amount     NUMERIC;
  v_credit_limit     NUMERIC;
  v_credit_balance   NUMERIC;
  v_available_credit NUMERIC;
  v_credit_used      NUMERIC;
  v_new_balance      NUMERIC;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be a linked delivery partner
  SELECT id INTO v_partner_id
  FROM public.delivery_partners
  WHERE user_id = v_caller_uid;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Only delivery partners can complete orders';
  END IF;

  -- Lock the order row; pull the fields we need
  SELECT delivery_partner_id, customer_id, delivery_otp,
         status::TEXT, payment_status, payment_method,
         total_amount, credit_used
  INTO v_order_partner_id, v_customer_id, v_order_otp,
       v_order_status, v_payment_status, v_existing_method,
       v_total_amount, v_existing_credit
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'This order is not assigned to you';
  END IF;

  IF v_order_status NOT IN ('assigned_to_delivery', 'picked_up', 'out_for_delivery') THEN
    RAISE EXCEPTION 'Order is not in a deliverable state (status=%)', v_order_status;
  END IF;

  IF v_order_otp IS NULL OR v_order_otp <> p_otp THEN
    RAISE EXCEPTION 'Invalid OTP';
  END IF;

  -- If the order was already paid (online / pay-now), just flip status.
  -- Don't overwrite payment_status/method.
  IF v_payment_status = 'completed' THEN
    UPDATE public.orders
    SET status = 'delivered'::order_status
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', true, 'credit_used', 0, 'note', 'already_paid');
  END IF;

  -- Credit path: enforce the same limit the customer flow enforces.
  IF p_payment_method = 'credit' THEN
    SELECT COALESCE(credit_limit, 0), COALESCE(credit_balance, 0)
    INTO v_credit_limit, v_credit_balance
    FROM public.profiles
    WHERE user_id = v_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer profile not found';
    END IF;

    v_available_credit := v_credit_limit - v_credit_balance;
    -- If the order had pre-allocated credit (e.g. admin-created credit order),
    -- that already counted against the customer's balance, so we should only
    -- charge the remainder. Typical delivery-collected case: v_existing_credit=0.
    v_credit_used := GREATEST(0, v_total_amount - COALESCE(v_existing_credit, 0));

    IF v_credit_used > v_available_credit THEN
      RAISE EXCEPTION 'Customer has insufficient credit (available ₹%, needs ₹%)',
        v_available_credit, v_credit_used;
    END IF;

    IF v_credit_used > 0 THEN
      UPDATE public.profiles
      SET credit_balance = COALESCE(credit_balance, 0) + v_credit_used
      WHERE user_id = v_customer_id
      RETURNING credit_balance INTO v_new_balance;

      INSERT INTO public.customer_credit_transactions (
        customer_id, amount, balance_after, transaction_type,
        description, order_id
      ) VALUES (
        v_customer_id, v_credit_used, v_new_balance, 'debit',
        'Credit applied at delivery for order ' || p_order_id::TEXT,
        p_order_id
      );
    END IF;

    UPDATE public.orders
    SET status = 'delivered'::order_status,
        payment_status = 'completed'::payment_status,
        payment_method = 'credit'::payment_method,
        credit_used = COALESCE(credit_used, 0) + v_credit_used
    WHERE id = p_order_id;

    RETURN jsonb_build_object('ok', true, 'credit_used', v_credit_used);
  END IF;

  -- Cash / UPI / other: same behavior as before, no credit accounting.
  UPDATE public.orders
  SET status = 'delivered'::order_status,
      payment_status = 'completed'::payment_status,
      payment_method = p_payment_method::payment_method
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'credit_used', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_complete_order_with_credit(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_complete_order_with_credit(UUID, TEXT, TEXT) TO authenticated;
