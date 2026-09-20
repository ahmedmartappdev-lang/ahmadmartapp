-- Split the grouped "dispatched" push into three per-stage messages.
--
-- Before: assigned_to_delivery / picked_up / out_for_delivery all fired a
-- single order_dispatched push ("on the way") on the FIRST transition into
-- the group — so customers heard "out for delivery" the moment an agent
-- was merely assigned, and later stage changes sent nothing.
--
-- After: each stage sends its own message:
--   assigned_to_delivery → order_assigned   "Delivery partner assigned"
--   picked_up            → order_picked_up  "Order picked up"
--   out_for_delivery     → order_dispatched "Order out for delivery"
--
-- Requires 20260805000000_add_delivery_stage_notification_types (enum).

-- ---------------------------------------------------------------------------
-- 1. Toggle rows for the two new event types (default ON) + fix the stale
--    order_dispatched description.
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_settings (notification_type, push_enabled, label, description) VALUES
  ('order_assigned',  true, 'Delivery partner assigned', 'Sent to the customer when a delivery partner is assigned to their order.'),
  ('order_picked_up', true, 'Order picked up',           'Sent to the customer when the delivery partner picks up their order.')
ON CONFLICT (notification_type) DO NOTHING;

UPDATE public.notification_settings
   SET description = 'Sent to the customer when the order is out for delivery.'
 WHERE notification_type = 'order_dispatched';

-- ---------------------------------------------------------------------------
-- 2. Trigger function rewrite. Full body preserved from
--    20260717020000_wire_all_push_events.sql except the grouped dispatch
--    branch, now three independent branches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_notify_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT := public._notif_order_label(NEW.order_number, NEW.id);
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

    ELSIF NEW.status = 'assigned_to_delivery'::order_status THEN
      INSERT INTO public.notifications (user_id, notification_type, title, message, data)
      VALUES (NEW.customer_id, 'order_assigned', 'Delivery partner assigned',
        'A delivery partner has been assigned to order ' || v_label || '.',
        jsonb_build_object('order_id', NEW.id, 'url', '/orders'));

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
