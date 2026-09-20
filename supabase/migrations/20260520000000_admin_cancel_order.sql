-- Admin-side cancel order: atomic, validated, with credit refund handling.
--
-- Mirrors cancel_customer_order but gated by is_admin() and accepts a
-- mandatory reason. For credit-paid orders, refunds the customer's
-- credit_balance + logs a customer_credit_transactions row. For online-
-- paid orders, marks status=cancelled + payment_status=refunded; the
-- gateway refund is handled manually by admin within 3–5 business days.
-- For unpaid orders, just cancels with no money movement.

CREATE OR REPLACE FUNCTION public.admin_cancel_order(
  p_order_id UUID,
  p_reason   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_uid    UUID := auth.uid();
  v_order         RECORD;
  v_new_balance   NUMERIC;
  v_refund_method TEXT := 'none';
  v_refund_amount NUMERIC := 0;
BEGIN
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_admin(v_caller_uid) THEN
    RAISE EXCEPTION 'Only admins can cancel orders';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Cancellation reason is required (>= 3 chars)';
  END IF;

  SELECT id, status, payment_status, payment_method,
         total_amount, customer_id, credit_used
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status::TEXT IN ('delivered', 'cancelled', 'refunded') THEN
    RAISE EXCEPTION 'Order is already %, cannot cancel', v_order.status;
  END IF;

  -- Credit-paid → refund the customer's credit balance immediately
  IF v_order.payment_status = 'completed'::payment_status
     AND v_order.payment_method = 'credit'::payment_method THEN

    v_refund_amount := v_order.total_amount;
    v_refund_method := 'credit_refund';

    UPDATE public.profiles
       SET credit_balance = GREATEST(0, COALESCE(credit_balance, 0) - v_refund_amount),
           updated_at     = NOW()
     WHERE user_id = v_order.customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO public.customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id, created_by
    ) VALUES (
      v_order.customer_id,
      v_refund_amount,
      COALESCE(v_new_balance, 0),
      'refund',
      'Order cancelled by admin — credit refunded',
      p_order_id,
      v_caller_uid
    );

    UPDATE public.orders
       SET status              = 'cancelled'::order_status,
           payment_status      = 'refunded'::payment_status,
           cancellation_reason = p_reason,
           cancelled_at        = NOW(),
           updated_at          = NOW()
     WHERE id = p_order_id;

  -- Paid via online/cash/etc → mark refunded; gateway refund happens
  -- manually outside the app (admin tells customer 3–5 business days).
  ELSIF v_order.payment_status = 'completed'::payment_status THEN

    v_refund_amount := v_order.total_amount;
    v_refund_method := 'manual_gateway';

    UPDATE public.orders
       SET status              = 'cancelled'::order_status,
           payment_status      = 'refunded'::payment_status,
           cancellation_reason = p_reason,
           cancelled_at        = NOW(),
           updated_at          = NOW()
     WHERE id = p_order_id;

  -- Unpaid → just cancel
  ELSE
    UPDATE public.orders
       SET status              = 'cancelled'::order_status,
           cancellation_reason = p_reason,
           cancelled_at        = NOW(),
           updated_at          = NOW()
     WHERE id = p_order_id;
  END IF;

  -- Audit (best-effort; doesn't block cancel if helper missing)
  BEGIN
    PERFORM public.log_admin_action(
      'admin_cancel_order',
      'order',
      p_order_id,
      jsonb_build_object(
        'reason', p_reason,
        'refund_method', v_refund_method,
        'refund_amount', v_refund_amount,
        'payment_method', v_order.payment_method,
        'payment_status_before', v_order.payment_status
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'refund_method', v_refund_method,
    'refund_amount', v_refund_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_order(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(UUID, TEXT) TO authenticated;
