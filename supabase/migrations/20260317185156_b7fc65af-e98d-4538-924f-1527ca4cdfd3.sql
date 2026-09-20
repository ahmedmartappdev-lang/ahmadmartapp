
-- Add credit_limit column to profiles
ALTER TABLE public.profiles ADD COLUMN credit_limit numeric DEFAULT 0;

-- Update the place_customer_order_with_credit function to use credit card model
CREATE OR REPLACE FUNCTION public.place_customer_order_with_credit(
  p_vendor_groups jsonb,
  p_delivery_address jsonb,
  p_delivery_latitude numeric DEFAULT NULL,
  p_delivery_longitude numeric DEFAULT NULL,
  p_payment_method text DEFAULT 'credit',
  p_customer_notes text DEFAULT NULL,
  p_credit_used numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_platform_fee numeric DEFAULT 0,
  p_small_order_fee numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_current_balance numeric;
  v_credit_limit numeric;
  v_available_credit numeric;
  v_remaining_credit numeric;
  v_order_id uuid;
  v_order_number text;
  v_group jsonb;
  v_item jsonb;
  v_subtotal numeric;
  v_total_amount numeric;
  v_order_credit numeric;
  v_gst numeric;
  v_order_delivery_fee numeric;
  v_order_platform_fee numeric;
  v_order_small_order_fee numeric;
  v_payment_status payment_status;
  v_result jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_vendor_id uuid;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Lock and validate credit (credit card model: available = limit - due)
  IF p_credit_used > 0 THEN
    SELECT credit_balance, credit_limit INTO v_current_balance, v_credit_limit
    FROM profiles
    WHERE user_id = v_customer_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    v_available_credit := COALESCE(v_credit_limit, 0) - COALESCE(v_current_balance, 0);

    IF p_credit_used > v_available_credit THEN
      RAISE EXCEPTION 'Insufficient credit. Available: %', v_available_credit;
    END IF;
  END IF;

  v_remaining_credit := p_credit_used;

  -- Loop through vendor groups
  FOR v_group IN SELECT * FROM jsonb_array_elements(p_vendor_groups)
  LOOP
    v_vendor_id := (v_group->>'vendor_id')::uuid;
    
    v_subtotal := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_subtotal := v_subtotal + ((v_item->>'unit_price')::numeric * (v_item->>'quantity')::int);
    END LOOP;

    IF v_idx = 0 THEN
      v_order_delivery_fee := p_delivery_fee;
      v_order_platform_fee := p_platform_fee;
      v_order_small_order_fee := p_small_order_fee;
    ELSE
      v_order_delivery_fee := 0;
      v_order_platform_fee := 0;
      v_order_small_order_fee := 0;
    END IF;

    v_gst := v_order_platform_fee * 0.18;
    v_total_amount := v_subtotal + v_order_delivery_fee + v_order_platform_fee + v_order_small_order_fee + v_gst;

    v_order_credit := LEAST(v_remaining_credit, v_total_amount);
    v_remaining_credit := v_remaining_credit - v_order_credit;

    IF p_payment_method = 'credit' AND v_order_credit >= v_total_amount THEN
      v_payment_status := 'completed';
    ELSE
      v_payment_status := 'pending';
    END IF;

    v_order_number := 'AM' || upper(to_hex(extract(epoch from now())::bigint)) || upper(substr(md5(random()::text), 1, 4));

    INSERT INTO orders (
      order_number, customer_id, vendor_id,
      delivery_address, delivery_latitude, delivery_longitude,
      subtotal, delivery_fee, platform_fee, total_amount,
      payment_method, payment_status, credit_used, customer_notes, status
    ) VALUES (
      v_order_number, v_customer_id, v_vendor_id,
      p_delivery_address, p_delivery_latitude, p_delivery_longitude,
      v_subtotal, v_order_delivery_fee, v_order_platform_fee, v_total_amount,
      p_payment_method::payment_method, v_payment_status,
      CASE WHEN v_order_credit > 0 THEN v_order_credit ELSE NULL END,
      p_customer_notes, 'pending'::order_status
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      INSERT INTO order_items (
        order_id, product_id, product_snapshot,
        quantity, unit_price, mrp, discount_amount, total_price
      ) VALUES (
        v_order_id,
        (v_item->>'product_id')::uuid,
        v_item->'product_snapshot',
        (v_item->>'quantity')::int,
        (v_item->>'unit_price')::numeric,
        (v_item->>'mrp')::numeric,
        (v_item->>'discount_amount')::numeric,
        (v_item->>'total_price')::numeric
      );
    END LOOP;

    v_result := v_result || jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
    v_idx := v_idx + 1;
  END LOOP;

  -- CREDIT CARD MODEL: Increase due amount (credit_balance) instead of decreasing
  IF p_credit_used > 0 THEN
    UPDATE profiles
    SET credit_balance = credit_balance + p_credit_used
    WHERE user_id = v_customer_id;

    SELECT credit_balance INTO v_current_balance
    FROM profiles
    WHERE user_id = v_customer_id;

    INSERT INTO customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id
    ) VALUES (
      v_customer_id,
      p_credit_used,
      v_current_balance,
      'debit',
      'Used for order #' || (v_result->0->>'order_number'),
      (v_result->0->>'id')::uuid
    );
  END IF;

  RETURN v_result;
END;
$$;
