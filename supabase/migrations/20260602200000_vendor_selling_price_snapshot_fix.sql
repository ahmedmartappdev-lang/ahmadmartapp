-- Vendor earning snapshot fix.
--
-- Client reported: vendor's "Your earning" line showed the admin price
-- (e.g. Rs 249.81) instead of vendor's own price (Rs 200) for some
-- orders. Verified on prod: order AM6A1EB4C19EEC has product_snapshot
-- with both selling_price=249.81 AND vendor_selling_price=249.81 — both
-- keys filled with the admin price. Should be selling_price=249.81
-- (admin paid) + vendor_selling_price=200 (vendor's actual price).
--
-- Root cause: customer-side cart-add sites (CategoryPage, AllCategories
-- Page, etc.) omit `vendor_selling_price` from the cart item. At checkout
-- useOrders.tsx falls back to `item.selling_price` (admin price). The
-- RPCs store the snapshot verbatim, so the bad value persists.
--
-- This migration adds server-authoritative override at INSERT: both
-- order-creating RPCs now stamp `vendor_selling_price` from the live
-- `products.selling_price` column, overwriting whatever the client sent.
-- Also backfills historical snapshots from the same source so vendor
-- earnings + the vendor_payment_transactions ledger reconcile.
--
-- Same downstream impact: accrue_vendor_earnings reads
-- snapshot.vendor_selling_price for the accrual amount, so this also
-- corrupted vendors.amount_due for the affected orders. Backfill +
-- ledger recompile fixes that too.
--
-- Idempotent. Safe to re-apply.

-- 1. place_customer_order_with_credit — snapshot vendor price override
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
  v_vendor_price numeric;
  v_stock integer;
  v_line_total numeric;
  v_line_discount numeric;
  v_snapshot jsonb;
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

    IF v_idx = 0 THEN
      v_order_delivery_fee := COALESCE(p_delivery_fee, 0);
      v_order_platform_fee := COALESCE(p_platform_fee, 0);
      v_order_small_order_fee := COALESCE(p_small_order_fee, 0);
    ELSE
      v_order_delivery_fee := 0;
      v_order_platform_fee := 0;
      v_order_small_order_fee := 0;
    END IF;

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

      -- Pull authoritative prices: catalog (admin override) for the
      -- customer-facing unit_price, and vendor's own selling_price for
      -- the snapshot's vendor_selling_price. Force the snapshot key to
      -- the server-authoritative value — overrides anything the client
      -- may have sent (some cart-add sites omit it, others stuff the
      -- admin price into it).
      SELECT COALESCE(NULLIF(admin_selling_price, 0), selling_price), mrp, selling_price
        INTO v_catalog_price, v_catalog_mrp, v_vendor_price
      FROM public.products
      WHERE id = v_product_id;

      v_line_total    := v_catalog_price * v_qty;
      v_line_discount := GREATEST(0, COALESCE(v_catalog_mrp, v_catalog_price) - v_catalog_price) * v_qty;

      v_snapshot := jsonb_set(
        COALESCE(v_item->'product_snapshot', '{}'::jsonb),
        '{vendor_selling_price}',
        to_jsonb(COALESCE(v_vendor_price, v_catalog_price)),
        true
      );

      INSERT INTO order_items (
        order_id, product_id, product_snapshot,
        quantity, unit_price, mrp, discount_amount, total_price
      ) VALUES (
        v_order_id,
        v_product_id,
        v_snapshot,
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

-- 2. admin_create_order — same snapshot override on its order_items loop.
-- (DROP first because we're keeping the signature but Postgres only
-- replaces same-signature; the prior version had the same param list, so
-- CREATE OR REPLACE is enough here.)
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
  v_item_product_id UUID;
  v_item_vendor_price NUMERIC;
  v_snapshot JSONB;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can use this function';
  END IF;

  IF p_payment_method <> 'credit' AND v_effective_credit_used > 0 THEN
    RAISE EXCEPTION 'Partial payments not allowed: % cannot be combined with credit', p_payment_method;
  END IF;

  IF p_payment_method = 'credit' THEN
    v_effective_credit_used := p_total_amount;

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

    v_effective_payment_status := 'completed';
  END IF;

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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
  LOOP
    v_item_product_id := (v_item->>'product_id')::UUID;

    -- Pull authoritative vendor price — overrides whatever the client
    -- sent in the snapshot. Falls back to unit_price if the product
    -- somehow doesn't have selling_price set.
    SELECT selling_price INTO v_item_vendor_price
    FROM public.products WHERE id = v_item_product_id;

    v_snapshot := jsonb_set(
      COALESCE(v_item->'product_snapshot', '{}'::jsonb),
      '{vendor_selling_price}',
      to_jsonb(COALESCE(v_item_vendor_price, (v_item->>'unit_price')::numeric)),
      true
    );

    INSERT INTO public.order_items (
      order_id, product_id, product_snapshot,
      quantity, unit_price, mrp, discount_amount, total_price
    ) VALUES (
      v_order_id,
      v_item_product_id,
      v_snapshot,
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::DECIMAL,
      (v_item->>'mrp')::DECIMAL,
      (v_item->>'discount_amount')::DECIMAL,
      (v_item->>'total_price')::DECIMAL
    );
  END LOOP;

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

-- 3. Backfill historical snapshots: align vendor_selling_price to the
-- current products.selling_price. Conservative: only update rows that
-- actually differ from the authoritative price (avoid pointless writes).
-- For orders whose product was deleted (no products row) we leave the
-- snapshot alone — best-effort.
UPDATE public.order_items oi
   SET product_snapshot = jsonb_set(
         COALESCE(oi.product_snapshot, '{}'::jsonb),
         '{vendor_selling_price}',
         to_jsonb(p.selling_price),
         true
       )
  FROM public.products p
 WHERE p.id = oi.product_id
   AND p.selling_price IS NOT NULL
   AND COALESCE((oi.product_snapshot->>'vendor_selling_price')::numeric, 0) <> p.selling_price;

-- 4. Recompile vendor ledger amounts on top of the corrected snapshots.
-- Same formula used by the no-commission migration; just runs over
-- updated source data.
UPDATE public.vendor_payment_transactions vpt
   SET amount = sub.gross
  FROM (
    SELECT oi.order_id,
           SUM(COALESCE(
                 NULLIF((oi.product_snapshot->>'vendor_selling_price')::NUMERIC, 0),
                 oi.unit_price
               ) * oi.quantity)::numeric AS gross
      FROM public.order_items oi
     GROUP BY oi.order_id
  ) sub
 WHERE vpt.order_id = sub.order_id
   AND vpt.transaction_type = 'debit'
   AND sub.gross IS NOT NULL;

WITH ordered AS (
  SELECT id,
         SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE -amount END)
           OVER (PARTITION BY vendor_id ORDER BY created_at, id) AS running
    FROM public.vendor_payment_transactions
)
UPDATE public.vendor_payment_transactions vpt
   SET balance_after = ordered.running
  FROM ordered
 WHERE ordered.id = vpt.id;

UPDATE public.vendors v
   SET amount_due = COALESCE((
         SELECT SUM(CASE WHEN transaction_type = 'debit' THEN amount ELSE -amount END)
           FROM public.vendor_payment_transactions
          WHERE vendor_id = v.id
       ), 0);
