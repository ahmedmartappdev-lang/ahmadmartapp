-- Admin-controlled push notification toggles per notification_type.
--
-- Adds:
--   1. notification_settings table (one row per notification_type enum value)
--   2. Seed of 11 rows with friendly labels + descriptions
--   3. RLS: authenticated read, admin write via RPC only
--   4. admin_set_notification_setting RPC (SECURITY DEFINER, is_admin gated)
--   5. Modified notifications_dispatch_push trigger — checks the toggle;
--      if push_enabled=false for the event, skips the pg_net dispatch
--      (in-app notification row still gets created).
--
-- The prior trigger from 20260717000000 is replaced in place (same name).

-- ---------------------------------------------------------------------------
-- 1. notification_settings table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_settings (
  notification_type public.notification_type PRIMARY KEY,
  push_enabled      BOOLEAN NOT NULL DEFAULT true,
  label             TEXT    NOT NULL,
  description       TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read notification settings"    ON public.notification_settings;
DROP POLICY IF EXISTS "Admin manage notification settings"          ON public.notification_settings;

CREATE POLICY "Authenticated read notification settings"
  ON public.notification_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin manage notification settings"
  ON public.notification_settings FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Seed all 11 enum values with sensible labels + descriptions.
--    Idempotent: re-running the migration will not clobber admin changes.
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_settings (notification_type, push_enabled, label, description) VALUES
  ('order_placed',      true, 'Order placed',           'Sent to the customer as soon as their order is placed successfully.'),
  ('order_confirmed',   true, 'Order confirmed',        'Sent when the vendor or admin confirms the order.'),
  ('order_preparing',   true, 'Order being prepared',   'Sent when the vendor starts preparing the order.'),
  ('order_dispatched',  true, 'Order out for delivery', 'Sent when the delivery partner picks up the order.'),
  ('order_delivered',   true, 'Order delivered',        'Sent to the customer when their order is marked delivered.'),
  ('order_cancelled',   true, 'Order cancelled',        'Sent when an order is cancelled by admin or the customer.'),
  ('payment_success',   true, 'Payment successful',     'Sent to the customer after a successful online/UPI payment.'),
  ('payment_failed',    true, 'Payment failed',         'Sent to the customer when a payment attempt fails.'),
  ('credit_low',        true, 'Credit balance low',     'Sent to the customer when their available credit line is nearly used up.'),
  ('promotion',         true, 'Promotions & offers',    'Sent for admin-broadcast marketing pushes (sales, coupons, new stores).'),
  ('general',           true, 'General announcements',  'Catch-all for order edits, admin notes, and other one-off updates.')
ON CONFLICT (notification_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. admin_set_notification_setting RPC — the toggle handler.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_notification_setting(
  p_type    public.notification_type,
  p_enabled BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT is_admin(v_uid) THEN
    RAISE EXCEPTION 'only admins can change notification settings' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.notification_settings
     SET push_enabled = p_enabled,
         updated_at   = NOW(),
         updated_by   = v_uid
   WHERE notification_type = p_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown notification_type: %', p_type;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_notification_setting(public.notification_type, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_notification_setting(public.notification_type, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Replace notifications_dispatch_push to check the toggle before firing.
--    Full body preserved from 20260717000000, only the settings lookup +
--    early return are new. Push failures still degrade gracefully.
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
  v_enabled     BOOLEAN;
BEGIN
  -- Admin-controlled per-type toggle. Missing row (defensive) = enabled.
  SELECT push_enabled INTO v_enabled
    FROM public.notification_settings
   WHERE notification_type = NEW.notification_type;

  IF v_enabled IS FALSE THEN
    RETURN NEW;  -- admin has disabled push for this event; keep the row, skip push
  END IF;

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
