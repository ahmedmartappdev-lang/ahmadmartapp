-- ============================================================
-- RPC: claim_delivery_order
-- Delivery partners call this instead of direct UPDATE.
-- It checks manual/auto mode INSIDE the DB so the frontend
-- cannot bypass it, regardless of RLS or admin status.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_delivery_order(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id UUID;
  v_order RECORD;
BEGIN
  -- 1. Check auto mode is enabled
  IF NOT is_auto_delivery_assignment() THEN
    RAISE EXCEPTION 'Manual assignment mode is active. Only admin can assign orders.';
  END IF;

  -- 2. Get the delivery partner id for this user
  SELECT id INTO v_partner_id
  FROM delivery_partners
  WHERE user_id = auth.uid();

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'You are not a registered delivery partner.';
  END IF;

  -- 3. Verify the order exists, is ready_for_pickup, and unassigned
  SELECT id, status, delivery_partner_id
  INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;  -- Lock the row to prevent race conditions

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.status != 'ready_for_pickup' THEN
    RAISE EXCEPTION 'Order is not ready for pickup.';
  END IF;

  IF v_order.delivery_partner_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order has already been assigned to another partner.';
  END IF;

  -- 4. Assign the order
  UPDATE orders
  SET delivery_partner_id = v_partner_id,
      status = 'assigned_to_delivery'
  WHERE id = p_order_id;
END;
$$;
