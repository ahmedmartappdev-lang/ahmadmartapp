-- Fix: Allow admins to insert orders on behalf of customers
-- Drop ALL existing INSERT policies on orders to avoid conflicts
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'orders'
      AND schemaname = 'public'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
  END LOOP;
END $$;

-- Create a single clean INSERT policy
CREATE POLICY "Users or admins can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    OR is_admin(auth.uid())
  );

-- Also fix order_items INSERT for admins
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'order_items'
      AND schemaname = 'public'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Order items can be inserted by order owner or admin"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_id
      AND (orders.customer_id = auth.uid() OR is_admin(auth.uid()))
    )
  );
