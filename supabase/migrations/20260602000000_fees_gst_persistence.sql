-- Fees & GST: persist correctly + Zepto-style basis + admin-configurable.
--
-- Why: client reported delivery_fee + GST "not being applied" on created
-- orders. Verified: delivery_fee + platform_fee were saved fine, but
-- tax_amount stayed 0 forever (the GST was silently baked into
-- total_amount only). small_order_fee column didn't exist at all, so the
-- value the frontend computed was dropped on insert. GST formula was
-- hardcoded to 0.18 * platform_fee (~Rs 0.90/order) — not Zepto-style.
--
-- This migration:
--   1. Adds orders.small_order_fee NUMERIC NOT NULL DEFAULT 0.
--   2. Merges {"gstPercent": 18} into app_settings.delivery_fee_config
--      so the rate is admin-configurable. Default 18%.
--   3. Recreates place_customer_order_with_credit to:
--        - compute v_gst = round((delivery+platform+small)*pct/100, 2)
--          (Zepto / Blinkit model — tax on service charges only)
--        - INSERT the small_order_fee + tax_amount columns
--   4. Backfills tax_amount on existing orders by recovering the
--      historically-baked-in GST: total - subtotal - delivery - platform
--      + discount, clamped >= 0. This makes past orders reconcile in the
--      bill summary instead of showing GST as 0 forever.
--
-- Idempotent. Safe to re-apply.

-- 1. New column
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS small_order_fee NUMERIC NOT NULL DEFAULT 0;

-- 2. Merge gstPercent default into settings (only if key absent).
-- app_settings.value is stored as TEXT containing JSON; cast to jsonb
-- to merge, then back to text on write.
UPDATE public.app_settings
   SET value = ((value::jsonb) || jsonb_build_object('gstPercent', 18))::text
 WHERE key = 'delivery_fee_config'
   AND NOT ((value::jsonb) ? 'gstPercent');

-- 3. Patched RPC
CREATE OR REPLACE FUNCTION public.place_customer_order_with_credit(
  p_vendor_groups jsonb,
  p_delivery_address jsonb,
  p_delivery_latitude numeric DEFAULT NULL::numeric,
  p_delivery_longitude numeric DEFAULT NULL::numeric,
  p_payment_method text DEFAULT 'credit'::text,
  p_customer_notes text DEFAULT NULL::text,
  p_credit_used numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_platform_fee numeric DEFAULT 0,
  p_small_order_fee numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_gst_pct numeric;
  v_order_delivery_fee numeric;
  v_order_platform_fee numeric;
  v_order_small_order_fee numeric;
  v_payment_status payment_status;
  v_result jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_vendor_id uuid;
  v_product_id uuid;
  v_qty int;
  v_catalog_price numeric;
  v_catalog_mrp numeric;
  v_stock integer;
  v_line_total numeric;
  v_line_discount numeric;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  IF p_delivery_latitude IS NULL OR p_delivery_longitude IS NULL THEN
    RAISE EXCEPTION 'Delivery location missing — please pick the address from the map';
  END IF;
  IF NOT public.is_location_serviceable(p_delivery_latitude, p_delivery_longitude) THEN
    RAISE EXCEPTION 'This address is outside our delivery zone';
  END IF;

  IF p_payment_method <> 'credit' AND COALESCE(p_credit_used, 0) > 0 THEN
    RAISE EXCEPTION 'Partial payments not allowed: % cannot be combined with credit', p_payment_method;
  END IF;

  IF p_credit_used > 0 THEN
    SELECT credit_balance, credit_limit INTO v_current_balance, v_credit_limit
    FROM profiles WHERE user_id = v_customer_id FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    v_available_credit := COALESCE(v_credit_limit, 0) - COALESCE(v_current_balance, 0);
    IF p_credit_used > v_available_credit THEN
      RAISE EXCEPTION 'Insufficient credit. Available: %', v_available_credit;
    END IF;
  END IF;

  -- Read configurable GST % from app_settings; fall back to 18 if absent.
  -- value is TEXT — cast to jsonb to dereference.
  SELECT COALESCE(((value::jsonb)->>'gstPercent')::numeric, 18)
    INTO v_gst_pct
    FROM public.app_settings
   WHERE key = 'delivery_fee_config';
  v_gst_pct := COALESCE(v_gst_pct, 18);

  v_remaining_credit := p_credit_used;

  FOR v_group IN SELECT * FROM jsonb_array_elements(p_vendor_groups)
  LOOP
    v_vendor_id := (v_group->>'vendor_id')::uuid;
    v_subtotal := 0;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty        := (v_item->>'quantity')::int;

      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'invalid quantity for product %', v_product_id;
      END IF;

      SELECT COALESCE(NULLIF(admin_selling_price, 0), selling_price), mrp, stock_quantity
        INTO v_catalog_price, v_catalog_mrp, v_stock
      FROM public.products
      WHERE id = v_product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'product not found: %', v_product_id;
      END IF;

      IF v_stock < v_qty THEN
        RAISE EXCEPTION 'insufficient stock for product %: available=% requested=%',
          v_product_id, v_stock, v_qty;
      END IF;

      UPDATE public.products
      SET stock_quantity = stock_quantity - v_qty
      WHERE id = v_product_id;

      v_subtotal := v_subtotal + (v_catalog_price * v_qty);
    END LOOP;

    -- Service fees apply only to the first vendor group (no double-billing).
    IF v_idx = 0 THEN
      v_order_delivery_fee := COALESCE(p_delivery_fee, 0);
      v_order_platform_fee := COALESCE(p_platform_fee, 0);
      v_order_small_order_fee := COALESCE(p_small_order_fee, 0);
    ELSE
      v_order_delivery_fee := 0;
      v_order_platform_fee := 0;
      v_order_small_order_fee := 0;
    END IF;

    -- Zepto / Blinkit / Swiggy Instamart model: GST applies to service
    -- charges only (delivery + platform + small order fee). The product
    -- subtotal is MRP-inclusive on the vendor side.
    v_gst := ROUND(((v_order_delivery_fee + v_order_platform_fee + v_order_small_order_fee) * v_gst_pct / 100)::numeric, 2);

    v_total_amount := v_subtotal + v_order_delivery_fee + v_order_platform_fee + v_order_small_order_fee + v_gst;

    v_order_credit := LEAST(v_remaining_credit, v_total_amount);
    v_remaining_credit := v_remaining_credit - v_order_credit;

    IF p_payment_method = 'credit' AND v_order_credit + 0.01 < v_total_amount THEN
      RAISE EXCEPTION 'Partial credit payments not allowed. Order total %, credit available for this leg %',
        v_total_amount, v_order_credit;
    END IF;

    IF p_payment_method = 'credit' AND v_order_credit >= v_total_amount THEN
      v_payment_status := 'completed';
    ELSE
      v_payment_status := 'pending';
    END IF;

    v_order_number := 'AM' || upper(to_hex(extract(epoch from now())::bigint)) || upper(substr(md5(random()::text), 1, 4));

    INSERT INTO orders (
      order_number, customer_id, vendor_id,
      delivery_address, delivery_latitude, delivery_longitude,
      subtotal, delivery_fee, platform_fee, small_order_fee, tax_amount, total_amount,
      payment_method, payment_status, credit_used, customer_notes, status
    ) VALUES (
      v_order_number, v_customer_id, v_vendor_id,
      p_delivery_address, p_delivery_latitude, p_delivery_longitude,
      v_subtotal, v_order_delivery_fee, v_order_platform_fee, v_order_small_order_fee, v_gst, v_total_amount,
      p_payment_method::payment_method, v_payment_status,
      CASE WHEN v_order_credit > 0 THEN v_order_credit ELSE NULL END,
      p_customer_notes, 'pending'::order_status
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_group->'items')
    LOOP
      v_product_id := (v_item->>'product_id')::uuid;
      v_qty        := (v_item->>'quantity')::int;

      SELECT COALESCE(NULLIF(admin_selling_price, 0), selling_price), mrp
        INTO v_catalog_price, v_catalog_mrp
      FROM public.products
      WHERE id = v_product_id;

      v_line_total    := v_catalog_price * v_qty;
      v_line_discount := GREATEST(0, COALESCE(v_catalog_mrp, v_catalog_price) - v_catalog_price) * v_qty;

      INSERT INTO order_items (
        order_id, product_id, product_snapshot,
        quantity, unit_price, mrp, discount_amount, total_price
      ) VALUES (
        v_order_id,
        v_product_id,
        v_item->'product_snapshot',
        v_qty,
        v_catalog_price,
        COALESCE(v_catalog_mrp, v_catalog_price),
        v_line_discount,
        v_line_total
      );
    END LOOP;

    v_result := v_result || jsonb_build_object('id', v_order_id, 'order_number', v_order_number);
    v_idx := v_idx + 1;
  END LOOP;

  IF p_credit_used > 0 THEN
    UPDATE profiles
    SET credit_balance = credit_balance + p_credit_used
    WHERE user_id = v_customer_id;

    SELECT credit_balance INTO v_current_balance
    FROM profiles WHERE user_id = v_customer_id;

    INSERT INTO customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id
    ) VALUES (
      v_customer_id, p_credit_used, v_current_balance,
      'debit',
      'Used for order #' || (v_result->0->>'order_number'),
      (v_result->0->>'id')::uuid
    );
  END IF;

  RETURN v_result;
END;
$function$;

-- 4. Backfill tax_amount on existing orders so past orders reconcile in
-- the bill summary. Recovers the historically-baked-in GST that lived
-- inside total_amount only. Conservative: only touches rows where
-- tax_amount=0 AND the math reveals a residual >0.
UPDATE public.orders
   SET tax_amount = GREATEST(
         0,
         total_amount
           - COALESCE(subtotal, 0)
           - COALESCE(delivery_fee, 0)
           - COALESCE(platform_fee, 0)
           - COALESCE(small_order_fee, 0)
           + COALESCE(discount_amount, 0)
       )
 WHERE tax_amount IS NULL OR tax_amount = 0;
