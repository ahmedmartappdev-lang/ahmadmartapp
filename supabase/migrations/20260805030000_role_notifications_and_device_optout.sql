-- 1. Fix "turned notifications off but still getting them":
--    save_push_subscription upserts ON CONFLICT (endpoint) and reassigns
--    user_id — a browser has ONE push endpoint shared by every account
--    that logs in on it. Turning off deleted rows for the CURRENT user
--    only, so a row bound to a previously-logged-in account survived and
--    the device kept receiving that account's pushes.
--    delete_push_subscription now deletes by endpoint REGARDLESS of the
--    owning user: the caller demonstrably controls the device (they hold
--    its endpoint), which justifies silencing that device entirely.
--
-- 2. Role-specific notifications for vendors and delivery agents:
--      vendor_new_order       → vendor's user on every order INSERT for their store
--      vendor_order_cancelled → vendor's user when an order is cancelled/refunded
--      agent_order_assigned   → delivery partner's user when assigned
--    All flow through the existing notifications AFTER-INSERT fan-out, so
--    the admin toggle page controls each one and device subscriptions
--    gate delivery as usual.
--
-- Requires 20260805020000_add_role_notification_types (enum).

-- ---------------------------------------------------------------------------
-- Toggle rows for the three new role events (default ON).
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_settings (notification_type, push_enabled, label, description) VALUES
  ('vendor_new_order',       true, 'Vendor: new order',       'Sent to the vendor when a new order lands for their store.'),
  ('vendor_order_cancelled', true, 'Vendor: order cancelled', 'Sent to the vendor when one of their orders is cancelled or refunded.'),
  ('agent_order_assigned',   true, 'Agent: delivery assigned','Sent to the delivery partner when an order is assigned to them.')
ON CONFLICT (notification_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- delete_push_subscription: endpoint-wide removal (device possession).
-- Same signature as before — existing frontend callers keep working.
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

  -- Holding the endpoint = holding the device. Remove the subscription no
  -- matter which signed-in account originally registered it, so "turn off
  -- on this device" always silences this device.
  DELETE FROM public.push_subscriptions
   WHERE endpoint = p_endpoint;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_push_subscription(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- orders_notify_on_insert — full body from 20260717020000 plus the vendor
-- "new order" branch. Vendor lookup failing (no linked auth user) is a
-- silent skip; the outer EXCEPTION guard keeps order creation safe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_notify_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label       TEXT := public._notif_order_label(NEW.order_number, NEW.id);
  v_vendor_user UUID;
BEGIN
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

  IF NEW.payment_status = 'completed' THEN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (NEW.customer_id, 'payment_success', 'Payment received',
      'Payment received for order ' || v_label || '.',
      jsonb_build_object('order_id', NEW.id, 'url', '/orders'));
  END IF;

  -- NEW: tell the vendor a fresh order landed for their store.
  SELECT user_id INTO v_vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
  IF v_vendor_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, notification_type, title, message, data)
    VALUES (v_vendor_user, 'vendor_new_order', 'New order received',
      'Order ' || v_label || ' · ₹' || COALESCE(NEW.total_amount, 0)::text
        || '. Open your dashboard to start preparing.',
      jsonb_build_object('order_id', NEW.id, 'url', '/vendor/orders'));
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'orders_notify_on_insert failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- orders_notify_on_update — full body from 20260805010000 plus:
--   * agent_order_assigned to the delivery partner on assignment
--   * vendor_order_cancelled to the vendor on cancel/refund
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_notify_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label       TEXT := public._notif_order_label(NEW.order_number, NEW.id);
  v_agent_user  UUID;
  v_vendor_user UUID;
BEGIN
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

    ELSIF NEW.status = 'assigned_to_delivery'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_assigned', 'Delivery partner assigned',
        'A delivery partner has been assigned to order ' || v_label || '.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

      -- NEW: tell the agent they have a pickup.
      SELECT user_id INTO v_agent_user
        FROM public.delivery_partners WHERE id = NEW.delivery_partner_id;
      IF v_agent_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, notification_type, title, message, data)
        VALUES (v_agent_user, 'agent_order_assigned', 'New delivery assigned',
          'Order ' || v_label || ' has been assigned to you. Check pickup details.',
          jsonb_build_object('order_id', NEW.id, 'url', '/delivery/active'));
      END IF;

    ELSIF NEW.status = 'picked_up'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_picked_up', 'Order picked up',
        'Order ' || v_label || ' has been picked up by your delivery partner.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

    ELSIF NEW.status = 'out_for_delivery'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_dispatched', 'Order out for delivery',
        'Order ' || v_label || ' is on the way to you.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

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

      -- NEW: tell the vendor too.
      SELECT user_id INTO v_vendor_user FROM public.vendors WHERE id = NEW.vendor_id;
      IF v_vendor_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, notification_type, title, message, data)
        VALUES (v_vendor_user, 'vendor_order_cancelled', 'Order cancelled',
          'Order ' || v_label || ' for your store was cancelled.',
          jsonb_build_object('order_id', NEW.id, 'url', '/vendor/orders'));
      END IF;
    END IF;
  END IF;

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
