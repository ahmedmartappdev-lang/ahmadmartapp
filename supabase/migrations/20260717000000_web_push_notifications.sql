-- Web Push notifications infrastructure.
--
-- Adds:
--   1. push_subscriptions table (one row per browser/device per user)
--   2. save_push_subscription / delete_push_subscription RPCs
--   3. AFTER INSERT trigger on notifications that calls the send-push edge
--      function via pg_net.http_post so any code that creates a notification
--      row automatically fires a Web Push to every subscribed device.
--   4. Additive inserts into notifications in admin_finalize_order_edit and
--      delivery_complete_order_with_credit so those flows trigger the push.
--      The original bodies are preserved verbatim — only a notification
--      INSERT (in a graceful-degrade BEGIN/EXCEPTION block) is added at
--      the end.
--
-- Requires: pg_net (enabled below) + three Supabase Edge Functions secrets:
-- VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own push subscriptions"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users insert own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users delete own push subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users read own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- save_push_subscription — upsert the (user, endpoint) row + refresh last_seen
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint   TEXT,
  p_p256dh     TEXT,
  p_auth       TEXT,
  p_user_agent TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id      UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF p_endpoint IS NULL OR length(btrim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    VALUES (v_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id      = EXCLUDED.user_id,
        p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        user_agent   = COALESCE(EXCLUDED.user_agent, public.push_subscriptions.user_agent),
        last_seen_at = NOW()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- delete_push_subscription — remove one subscription by endpoint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.push_subscriptions
   WHERE endpoint = p_endpoint AND user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_push_subscription(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: whenever a notifications row is inserted, fire the send-push
-- edge function via pg_net. Push is best-effort — failures never block the
-- in-app notification insert.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_dispatch_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url         TEXT := 'https://otksdfphbgneusgjvjzg.supabase.co/functions/v1/send-push';
  v_service_key TEXT;
  v_url_path    TEXT;
BEGIN
  v_url_path := COALESCE(NEW.data->>'url', '/orders');

  BEGIN
    v_service_key := current_setting('app.supabase_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  PERFORM net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'user_id',           NEW.user_id,
                 'title',             NEW.title,
                 'body',              NEW.message,
                 'url',               v_url_path,
                 'notification_type', NEW.notification_type,
                 'data',              NEW.data
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', COALESCE('Bearer ' || v_service_key, '')
               )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notifications_dispatch_push failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_send_push_trg ON public.notifications;
CREATE TRIGGER notifications_send_push_trg
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_dispatch_push();

-- ---------------------------------------------------------------------------
-- admin_finalize_order_edit — PRESERVED verbatim from
-- 20260429000000_admin_credit_validation.sql, with a single additive
-- notification insert before RETURN. Nothing else about the logic changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_finalize_order_edit(
  p_order_id UUID,
  p_new_subtotal NUMERIC,
  p_new_total NUMERIC,
  p_customer_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_old_credit_used NUMERIC;
  v_new_credit_used NUMERIC;
  v_diff NUMERIC;
  v_credit_balance NUMERIC;
  v_credit_limit NUMERIC;
  v_available_for_increase NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_old_credit_used := COALESCE(v_order.credit_used, 0);

  IF v_order.payment_method::TEXT = 'credit' THEN
    v_new_credit_used := p_new_total;
  ELSE
    v_new_credit_used := 0;
  END IF;

  v_diff := v_new_credit_used - v_old_credit_used;

  IF v_diff > 0 THEN
    SELECT credit_balance, credit_limit
      INTO v_credit_balance, v_credit_limit
    FROM public.profiles
    WHERE user_id = v_order.customer_id
    FOR UPDATE;

    v_available_for_increase := COALESCE(v_credit_limit, 0) - COALESCE(v_credit_balance, 0);

    IF v_diff > v_available_for_increase THEN
      RAISE EXCEPTION 'This order (Rs.%) exceeds the customer''s available credit (Rs.%). Reduce items or pick another payment method.',
        p_new_total, COALESCE(v_credit_balance, 0) + v_available_for_increase - v_old_credit_used + v_old_credit_used;
    END IF;
  END IF;

  UPDATE public.orders
  SET subtotal       = p_new_subtotal,
      total_amount   = p_new_total,
      credit_used    = CASE WHEN payment_method::TEXT = 'credit' THEN p_new_total ELSE credit_used END,
      customer_notes = COALESCE(p_customer_notes, customer_notes),
      updated_at     = NOW()
  WHERE id = p_order_id;

  IF v_diff <> 0 THEN
    UPDATE public.profiles
    SET credit_balance = GREATEST(0, COALESCE(credit_balance, 0) + v_diff),
        updated_at     = NOW()
    WHERE user_id = v_order.customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO public.customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id, created_by
    ) VALUES (
      v_order.customer_id,
      ABS(v_diff),
      v_new_balance,
      CASE WHEN v_diff > 0 THEN 'debit' ELSE 'credit' END,
      'Order ' || v_order.order_number || ' edited: ' ||
        CASE WHEN v_diff > 0 THEN '+Rs. ' ELSE '-Rs. ' END || ABS(v_diff)::TEXT,
      p_order_id,
      auth.uid()
    );
  END IF;

  -- NEW: customer-facing notification. Trigger on notifications turns
  -- this into a Web Push. Wrapped in BEGIN/EXCEPTION so an error in the
  -- notification path can never fail the order edit.
  BEGIN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (
      v_order.customer_id,
      'general'::notification_type,
      'Order updated',
      'Admin updated your order — new total ₹' || p_new_total::text || '.',
      jsonb_build_object('order_id', p_order_id, 'url', '/orders')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_finalize_order_edit notify failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'credit_diff', v_diff, 'new_credit_used', v_new_credit_used);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_finalize_order_edit(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_finalize_order_edit(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- delivery_complete_order_with_credit — PRESERVED verbatim from
-- 20260518000000_delivery_complete_with_credit.sql, with a single additive
-- notification insert before each RETURN path.
-- ---------------------------------------------------------------------------
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
  v_order_number     TEXT;
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

  SELECT id INTO v_partner_id
  FROM public.delivery_partners
  WHERE user_id = v_caller_uid;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Only delivery partners can complete orders';
  END IF;

  SELECT delivery_partner_id, customer_id, order_number, delivery_otp,
         status::TEXT, payment_status, payment_method,
         total_amount, credit_used
  INTO v_order_partner_id, v_customer_id, v_order_number, v_order_otp,
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

  IF v_payment_status = 'completed' THEN
    UPDATE public.orders
    SET status = 'delivered'::order_status
    WHERE id = p_order_id;

    BEGIN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (
        v_customer_id, 'order_delivered'::notification_type,
        'Order delivered',
        'Your order ' || COALESCE(v_order_number, '') || ' has been delivered. Enjoy!',
        jsonb_build_object('order_id', p_order_id, 'url', '/orders')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delivery_complete notify failed: %', SQLERRM;
    END;

    RETURN jsonb_build_object('ok', true, 'credit_used', 0, 'note', 'already_paid');
  END IF;

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

    BEGIN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (
        v_customer_id, 'order_delivered'::notification_type,
        'Order delivered',
        'Your order ' || COALESCE(v_order_number, '') || ' has been delivered on credit. Enjoy!',
        jsonb_build_object('order_id', p_order_id, 'url', '/orders')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'delivery_complete notify failed: %', SQLERRM;
    END;

    RETURN jsonb_build_object('ok', true, 'credit_used', v_credit_used);
  END IF;

  UPDATE public.orders
  SET status = 'delivered'::order_status,
      payment_status = 'completed'::payment_status,
      payment_method = p_payment_method::payment_method
  WHERE id = p_order_id;

  BEGIN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (
      v_customer_id, 'order_delivered'::notification_type,
      'Order delivered',
      'Your order ' || COALESCE(v_order_number, '') || ' has been delivered. Enjoy!',
      jsonb_build_object('order_id', p_order_id, 'url', '/orders')
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'delivery_complete notify failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object('ok', true, 'credit_used', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_complete_order_with_credit(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_complete_order_with_credit(UUID, TEXT, TEXT) TO authenticated;
