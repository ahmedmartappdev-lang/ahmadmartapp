-- Two regressions from recent commits:
--
-- 1. Customer review feature (commit 28ad149) added review_type='vendor'
--    but the CHECK constraint on reviews.review_type still only allowed
--    'product' | 'delivery' | 'overall'. Every vendor review fails, and
--    because ReviewDialog inserts vendor + delivery in one batch, the
--    delivery review dies with it. Fix: drop + recreate constraint to
--    include 'vendor'.
--
-- 2. Fees/GST commit (9b61f0f) updated AdminCreateOrder.tsx to send
--    p_small_order_fee to admin_create_order, but never updated the RPC
--    signature. PostgREST matches overloads by exact param set, so the
--    extra unknown param made the call resolve to nothing → "Could not
--    find the function". Admin order creation has been 100% broken since
--    that commit. Fix: add p_small_order_fee + p_tax_amount as optional
--    params and INSERT both columns (which the orders table already has
--    from the prior fees/GST migration).
--
-- Idempotent. Pure additive — existing callers of admin_create_order
-- still work because both new params have defaults.

-- 1. Reviews CHECK constraint
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_review_type_check;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_review_type_check
  CHECK (review_type = ANY (ARRAY['product'::text, 'delivery'::text, 'overall'::text, 'vendor'::text]));

-- 2. admin_create_order — add p_small_order_fee + p_tax_amount, INSERT them.
-- DROP first because the signature is changing (Postgres treats overloads by
-- exact parameter set — CREATE OR REPLACE would create a second copy and
-- leave PostgREST ambiguous between the two).
DROP FUNCTION IF EXISTS public.admin_create_order(
  text, uuid, uuid, jsonb, double precision, double precision,
  numeric, numeric, numeric, numeric, text, text, text, text, jsonb, numeric
);

CREATE OR REPLACE FUNCTION public.admin_create_order(
  p_order_number text,
  p_customer_id uuid,
  p_vendor_id uuid,
  p_delivery_address jsonb,
  p_delivery_latitude double precision DEFAULT NULL::double precision,
  p_delivery_longitude double precision DEFAULT NULL::double precision,
  p_subtotal numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_platform_fee numeric DEFAULT 0,
  p_total_amount numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash'::text,
  p_payment_status text DEFAULT 'pending'::text,
  p_customer_notes text DEFAULT NULL::text,
  p_status text DEFAULT 'confirmed'::text,
  p_order_items jsonb DEFAULT '[]'::jsonb,
  p_credit_used numeric DEFAULT 0,
  p_small_order_fee numeric DEFAULT 0,
  p_tax_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_credit_balance NUMERIC;
  v_credit_limit NUMERIC;
  v_available NUMERIC;
  v_new_balance NUMERIC;
  v_effective_credit_used NUMERIC := COALESCE(p_credit_used, 0);
  v_effective_payment_status TEXT := p_payment_status;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  -- Single-method rule: no partial credit
  IF p_payment_method <> 'credit' AND v_effective_credit_used > 0 THEN
    RAISE EXCEPTION 'Partial payments not allowed: % cannot be combined with credit', p_payment_method;
  END IF;

  IF p_payment_method = 'credit' THEN
    -- For credit orders, credit_used must equal the full bill
    v_effective_credit_used := p_total_amount;

    -- Lock profile, validate available credit
    SELECT credit_balance, credit_limit
      INTO v_credit_balance, v_credit_limit
    FROM public.profiles
    WHERE user_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer profile not found';
    END IF;

    v_available := COALESCE(v_credit_limit, 0) - COALESCE(v_credit_balance, 0);

    IF p_total_amount > v_available THEN
      RAISE EXCEPTION 'This order (Rs.%) exceeds the customer''s available credit (Rs.%). Reduce items or pick another payment method.',
        p_total_amount, v_available;
    END IF;

    -- Credit-paid orders are paid at order time
    v_effective_payment_status := 'completed';
  END IF;

  -- Insert order (now includes small_order_fee + tax_amount)
  INSERT INTO public.orders (
    order_number, customer_id, vendor_id, delivery_address,
    delivery_latitude, delivery_longitude,
    subtotal, delivery_fee, platform_fee, small_order_fee, tax_amount, total_amount,
    payment_method, payment_status, credit_used, customer_notes, status
  ) VALUES (
    p_order_number, p_customer_id, p_vendor_id, p_delivery_address,
    p_delivery_latitude, p_delivery_longitude,
    p_subtotal, p_delivery_fee, p_platform_fee,
    COALESCE(p_small_order_fee, 0), COALESCE(p_tax_amount, 0), p_total_amount,
    p_payment_method::payment_method, v_effective_payment_status::payment_status,
    CASE WHEN v_effective_credit_used > 0 THEN v_effective_credit_used ELSE NULL END,
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

  -- If credit was used, debit profile + log txn
  IF v_effective_credit_used > 0 THEN
    UPDATE public.profiles
    SET credit_balance = COALESCE(credit_balance, 0) + v_effective_credit_used,
        updated_at = NOW()
    WHERE user_id = p_customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO public.customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id, created_by
    ) VALUES (
      p_customer_id,
      v_effective_credit_used,
      v_new_balance,
      'debit',
      'Used for order #' || p_order_number || ' (admin-placed)',
      v_order_id,
      auth.uid()
    );
  END IF;

  RETURN v_order_id;
END;
$function$;
