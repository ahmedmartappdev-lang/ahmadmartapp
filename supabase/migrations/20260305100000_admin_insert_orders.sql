-- Allow admins to create orders on behalf of customers
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;

CREATE POLICY "Users or admins can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = customer_id
    OR is_admin(auth.uid())
  );
