-- ============================================================
-- FIX: Restore all orders & order_items RLS policies
-- The delivery_assignment_mode migration accidentally dropped
-- the main SELECT/UPDATE policies. This migration drops ALL
-- policies on orders and order_items and recreates them cleanly.
-- ============================================================

-- 1. Drop ALL existing policies on orders
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'orders' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
  END LOOP;
END $$;

-- 2. Drop ALL existing policies on order_items
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'order_items' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', pol.policyname);
  END LOOP;
END $$;

-- ============================================================
-- 3. ORDERS POLICIES (clean rebuild)
-- ============================================================

-- SELECT: customers see own orders, admins see all, vendors see their orders,
-- delivery partners see assigned orders + unassigned ready_for_pickup in auto mode
CREATE POLICY "orders_select"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = customer_id
    OR is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.vendors WHERE id = vendor_id AND user_id = auth.uid())
    OR (
      is_delivery_partner(auth.uid()) AND (
        delivery_partner_id = (SELECT id FROM public.delivery_partners WHERE user_id = auth.uid() LIMIT 1)
        OR (
          status = 'ready_for_pickup'
          AND delivery_partner_id IS NULL
          AND is_auto_delivery_assignment()
        )
      )
    )
  );

-- INSERT: customers create own orders, admins can create on behalf
CREATE POLICY "orders_insert"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    OR is_admin(auth.uid())
  );

-- UPDATE: admins, vendors, delivery partners (assigned or claiming in auto mode)
CREATE POLICY "orders_update"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.vendors WHERE id = vendor_id AND user_id = auth.uid())
    OR (
      is_delivery_partner(auth.uid()) AND (
        delivery_partner_id = (SELECT id FROM public.delivery_partners WHERE user_id = auth.uid() LIMIT 1)
        OR (
          status = 'ready_for_pickup'
          AND delivery_partner_id IS NULL
          AND is_auto_delivery_assignment()
        )
      )
    )
  );

-- ============================================================
-- 4. ORDER_ITEMS POLICIES (clean rebuild)
-- ============================================================

-- SELECT: same visibility as orders
CREATE POLICY "order_items_select"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_id AND (
        orders.customer_id = auth.uid()
        OR is_admin(auth.uid())
        OR EXISTS (SELECT 1 FROM public.vendors WHERE id = orders.vendor_id AND user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.delivery_partners WHERE id = orders.delivery_partner_id AND user_id = auth.uid())
      )
    )
  );

-- INSERT: order owner or admin
CREATE POLICY "order_items_insert"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_id
      AND (orders.customer_id = auth.uid() OR is_admin(auth.uid()))
    )
  );
