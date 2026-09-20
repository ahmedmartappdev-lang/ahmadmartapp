
-- Allow admins to create orders on behalf of customers
CREATE POLICY "Admins can create orders for customers"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

-- Allow admins to insert order items
CREATE POLICY "Admins can insert order items"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));
