-- Create an RPC function for admin order creation that bypasses RLS
CREATE OR REPLACE FUNCTION public.admin_create_order(
  p_order_number TEXT,
  p_customer_id UUID,
  p_vendor_id UUID,
  p_delivery_address JSONB,
  p_delivery_latitude DOUBLE PRECISION DEFAULT NULL,
  p_delivery_longitude DOUBLE PRECISION DEFAULT NULL,
  p_subtotal DECIMAL DEFAULT 0,
  p_delivery_fee DECIMAL DEFAULT 0,
  p_platform_fee DECIMAL DEFAULT 0,
  p_total_amount DECIMAL DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_payment_status TEXT DEFAULT 'pending',
  p_customer_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'confirmed',
  p_order_items JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
BEGIN
  -- Only allow admins
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  -- Insert order
  INSERT INTO public.orders (
    order_number, customer_id, vendor_id, delivery_address,
    delivery_latitude, delivery_longitude,
    subtotal, delivery_fee, platform_fee, total_amount,
    payment_method, payment_status, customer_notes, status
  ) VALUES (
    p_order_number, p_customer_id, p_vendor_id, p_delivery_address,
    p_delivery_latitude, p_delivery_longitude,
    p_subtotal, p_delivery_fee, p_platform_fee, p_total_amount,
    p_payment_method::payment_method, p_payment_status::payment_status,
    p_customer_notes, p_status::order_status
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_snapshot,
      quantity, unit_price, mrp, discount_amount, total_price
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_item->'product_snapshot',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'mrp')::DECIMAL,
      (v_item->>'discount_amount')::DECIMAL,
      (v_item->>'total_price')::DECIMAL
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;
