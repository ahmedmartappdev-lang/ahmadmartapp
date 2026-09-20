-- Wire push notifications for all 8 automatic customer events + a
-- promotional broadcast admin RPC. Zero existing RPC bodies are touched
-- except one surgical de-dup: remove the inline order_delivered inserts
-- inside delivery_complete_order_with_credit that would double-fire once
-- the new AFTER-UPDATE trigger below is in place.
--
-- Architecture:
--   - orders_notify_on_insert  (AFTER INSERT)  → order_placed / order_confirmed / payment_success (born-completed)
--   - orders_notify_on_update  (AFTER UPDATE OF status, payment_status)
--       → order_confirmed / order_preparing / order_dispatched / order_delivered / order_cancelled
--       → payment_success / payment_failed
--   - profiles_notify_credit_low (AFTER UPDATE OF credit_balance)
--   - admin_broadcast_promotion RPC (writes one notifications row per customer)
--
-- The pre-existing AFTER INSERT trigger on notifications
-- (notifications_send_push_trg) fans out to the send-push edge fn
-- automatically, respecting the notification_settings.push_enabled toggle.

-- ---------------------------------------------------------------------------
-- Helper: safe order-number label for message text.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notif_order_label(v_number TEXT, v_id UUID)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT '#' || COALESCE(NULLIF(v_number, ''), substr(v_id::text, 1, 8));
$$;

-- ---------------------------------------------------------------------------
-- Trigger A — AFTER INSERT ON orders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_notify_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT := public._notif_order_label(NEW.order_number, NEW.id);
BEGIN
  -- Order lifecycle: born pending → order_placed; born confirmed → order_confirmed.
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (NEW.customer_id, 'order_placed', 'Order placed',
      'Your order ' || v_label || ' has been placed. We''ll update you as it moves.',
      jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
  ELSIF NEW.status = 'confirmed' THEN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (NEW.customer_id, 'order_confirmed', 'Order confirmed',
      'Your order ' || v_label || ' has been confirmed.',
      jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
  END IF;

  -- Credit orders are born payment_status='completed' — no UPDATE will
  -- fire, so emit payment_success from the INSERT.
  IF NEW.payment_status = 'completed' THEN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (NEW.customer_id, 'payment_success', 'Payment received',
      'Payment received for order ' || v_label || '.',
      jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'orders_notify_on_insert failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_notify_on_insert_trg ON public.orders;
CREATE TRIGGER orders_notify_on_insert_trg
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_notify_on_insert();

-- ---------------------------------------------------------------------------
-- Trigger B — AFTER UPDATE OF status, payment_status ON orders
-- Fires only when one of those two columns actually changed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_notify_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label   TEXT := public._notif_order_label(NEW.order_number, NEW.id);
  v_dispatch_prev BOOLEAN;
BEGIN
  -- Status transitions.
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'confirmed'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_confirmed', 'Order confirmed',
        'Your order ' || v_label || ' has been confirmed — vendor will start preparing it.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

    ELSIF NEW.status = 'preparing'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_preparing', 'Order being prepared',
        'Order ' || v_label || ' is being prepared.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

    ELSIF NEW.status IN ('assigned_to_delivery'::order_status, 'picked_up'::order_status, 'out_for_delivery'::order_status) THEN
      -- Fire only on the FIRST transition into any of these three, not on
      -- successive advances between them (assigned → picked_up → OFD).
      v_dispatch_prev := OLD.status IN ('assigned_to_delivery'::order_status, 'picked_up'::order_status, 'out_for_delivery'::order_status);
      IF NOT v_dispatch_prev THEN
        INSERT INTO public.notifications (user_id, notification_type, title, message, data)
        VALUES (NEW.customer_id, 'order_dispatched', 'Order out for delivery',
          'Order ' || v_label || ' is on the way to you.',
          jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
      END IF;

    ELSIF NEW.status = 'delivered'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_delivered', 'Order delivered',
        'Order ' || v_label || ' has been delivered. Enjoy!',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

    ELSIF NEW.status IN ('cancelled'::order_status, 'refunded'::order_status) THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_cancelled', 'Order cancelled',
        'Order ' || v_label || ' was cancelled.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
    END IF;
  END IF;

  -- Payment status transitions.
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    IF NEW.payment_status = 'completed'::payment_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'payment_success', 'Payment received',
        'Payment received for order ' || v_label || '.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

    ELSIF NEW.payment_status = 'failed'::payment_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'payment_failed', 'Payment failed',
        'Payment failed for order ' || v_label || ' — please retry.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'orders_notify_on_update failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_notify_on_update_trg ON public.orders;
CREATE TRIGGER orders_notify_on_update_trg
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_notify_on_update();

-- ---------------------------------------------------------------------------
-- Trigger C — AFTER UPDATE OF credit_balance ON profiles
-- credit_balance semantics in this codebase: AMOUNT OWED (increments on
-- debit, decrements on repayment). "Low" = balance HIGH relative to limit.
-- Debounced to once per 24h per user using the notifications table itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_notify_credit_low()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold NUMERIC;
  v_recent    BOOLEAN;
BEGIN
  IF COALESCE(NEW.credit_limit, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_threshold := 0.80 * NEW.credit_limit;

  -- Crossed the threshold upward (was below, now at/above)?
  IF NEW.credit_balance >= v_threshold
     AND (COALESCE(OLD.credit_balance, 0) < v_threshold) THEN

    SELECT EXISTS (
      SELECT 1 FROM public.notifications
       WHERE user_id = NEW.user_id
         AND notification_type = 'credit_low'
         AND created_at > NOW() - INTERVAL '24 hours'
    ) INTO v_recent;

    IF NOT v_recent THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.user_id, 'credit_low', 'Credit balance low',
        'You have used ' || round(100 * NEW.credit_balance / NEW.credit_limit)::text
          || '% of your ' || NEW.credit_limit::text || ' credit line. Please repay to keep ordering.',
        jsonb_build_object('url', '/credit'));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'profiles_notify_credit_low failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_notify_credit_low_trg ON public.profiles;
CREATE TRIGGER profiles_notify_credit_low_trg
  AFTER UPDATE OF credit_balance ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_notify_credit_low();

-- ---------------------------------------------------------------------------
-- admin_broadcast_promotion — INSERTs one notifications row per customer.
-- A "customer" here is any auth.users row that DOES NOT have an admin,
-- vendor, or delivery_partner role in user_roles. The fan-out AFTER-INSERT
-- trigger on notifications pushes to every subscribed device automatically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_broadcast_promotion(
  p_title   TEXT,
  p_message TEXT,
  p_url     TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_url   TEXT := COALESCE(NULLIF(btrim(p_url), ''), '/');
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can broadcast promotions';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'title_required';
  END IF;
  IF p_message IS NULL OR length(btrim(p_message)) = 0 THEN
    RAISE EXCEPTION 'message_required';
  END IF;

  WITH inserted AS (
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    SELECT p.user_id, 'promotion'::notification_type, p_title, p_message,
           jsonb_build_object('url', v_url, 'broadcast', true)
      FROM public.profiles p
     WHERE NOT EXISTS (
             SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = p.user_id
                AND ur.role IN ('admin'::app_role, 'vendor'::app_role, 'delivery_partner'::app_role)
           )
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN jsonb_build_object('ok', true, 'sent_to', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_promotion(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_promotion(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- De-dup: remove the inline order_delivered inserts from
-- delivery_complete_order_with_credit — Trigger B now handles them.
-- FULL BODY PRESERVED from 20260717000000_web_push_notifications.sql,
-- with only the three "INSERT INTO public.notifications ... order_delivered ..."
-- blocks stripped out.
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
    -- (order_delivered push now comes from orders_notify_on_update_trg)
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
    -- (order_delivered + payment_success pushes now come from orders_notify_on_update_trg)

    RETURN jsonb_build_object('ok', true, 'credit_used', v_credit_used);
  END IF;

  UPDATE public.orders
  SET status = 'delivered'::order_status,
      payment_status = 'completed'::payment_status,
      payment_method = p_payment_method::payment_method
  WHERE id = p_order_id;
  -- (order_delivered + payment_success pushes now come from orders_notify_on_update_trg)

  RETURN jsonb_build_object('ok', true, 'credit_used', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.delivery_complete_order_with_credit(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delivery_complete_order_with_credit(UUID, TEXT, TEXT) TO authenticated;
