-- Allow delivery partners to view orders that are ready_for_pickup (available for claiming)
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

CREATE POLICY "Users can view their own orders" 
ON public.orders 
FOR SELECT 
USING (
  (auth.uid() = customer_id) 
  OR is_admin(auth.uid()) 
  OR (EXISTS (
    SELECT 1 FROM vendors 
    WHERE vendors.id = orders.vendor_id 
    AND vendors.user_id = auth.uid()
  )) 
  OR (EXISTS (
    SELECT 1 FROM delivery_partners 
    WHERE delivery_partners.id = orders.delivery_partner_id 
    AND delivery_partners.user_id = auth.uid()
  ))
  -- Allow delivery partners to see available orders (ready for pickup, not yet assigned)
  OR (
    orders.status = 'ready_for_pickup' 
    AND orders.delivery_partner_id IS NULL 
    AND is_delivery_partner(auth.uid())
  )
);

-- Allow delivery partners to claim orders (update orders that are ready for pickup)
DROP POLICY IF EXISTS "Orders can be updated by relevant parties" ON public.orders;

CREATE POLICY "Orders can be updated by relevant parties" 
ON public.orders 
FOR UPDATE 
USING (
  is_admin(auth.uid()) 
  OR (EXISTS (
    SELECT 1 FROM vendors 
    WHERE vendors.id = orders.vendor_id 
    AND vendors.user_id = auth.uid()
  )) 
  OR (EXISTS (
    SELECT 1 FROM delivery_partners 
    WHERE delivery_partners.id = orders.delivery_partner_id 
    AND delivery_partners.user_id = auth.uid()
  ))
  -- Allow delivery partners to claim unassigned orders
  OR (
    orders.status = 'ready_for_pickup' 
    AND orders.delivery_partner_id IS NULL 
    AND is_delivery_partner(auth.uid())
  )
);