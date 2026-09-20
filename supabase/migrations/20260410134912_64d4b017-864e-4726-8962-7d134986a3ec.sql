CREATE POLICY "Admins can update order items"
ON public.order_items FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete order items"
ON public.order_items FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));