-- Audit findings (2026-05-18) — critical server-side fixes
-- Bundled into one migration so they roll out atomically:
--
--   #3  cancel_customer_order: allow cancel for credit orders (locally reversible).
--   #5  accrue_vendor_earnings: use vendor_selling_price snapshot instead of
--       admin-marked subtotal, so vendor gets paid for what they actually sold.
--   #7  otp_codes.attempts + lockout after 5 wrong guesses.
--   #8  admin_create_delivery_partner: actually persist bank_account_number
--       and ifsc_code.
--   #9  products.admin_selling_price CHECK constraint: > 0 and <= mrp+5%.
--   #31 admin_set_credit_limit / admin_record_credit_payment / admin_record_vendor_payment
--       atomic RPCs (one transaction; no orphan ledger rows).

-- =====================================================================
-- #3  cancel_customer_order — allow credit cancel
-- =====================================================================
-- Background: credit orders are created with payment_status='completed'
-- because credit is debited immediately. The previous guard rejected any
-- completed-payment cancel, including credit. We can safely reverse a
-- credit-paid order locally (refund credit_balance, log a credit txn).
-- Online/COD-pay-now still need the gateway refund path.
CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID := auth.uid();
  v_order RECORD;
  v_new_balance NUMERIC;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND customer_id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found or not yours';
  END IF;

  IF v_order.status NOT IN ('pending'::order_status, 'confirmed'::order_status) THEN
    RAISE EXCEPTION 'order cannot be cancelled in status %', v_order.status;
  END IF;

  -- Credit orders: payment_status='completed' but reversal is purely
  -- in-DB; that's safe to cancel locally.
  IF v_order.payment_status = 'completed'
     AND v_order.payment_method::TEXT <> 'credit' THEN
    RAISE EXCEPTION 'paid orders must be refunded via the payment gateway, not cancelled locally';
  END IF;

  UPDATE public.orders
  SET
    status = 'cancelled'::order_status,
    cancelled_at = NOW(),
    cancellation_reason = 'Cancelled by customer',
    updated_at = NOW()
  WHERE id = p_order_id;

  PERFORM public.restore_order_stock(ARRAY[p_order_id]);

  IF COALESCE(v_order.credit_used, 0) > 0 THEN
    UPDATE profiles
    SET credit_balance = GREATEST(0, COALESCE(credit_balance, 0) - v_order.credit_used)
    WHERE user_id = v_customer_id
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO customer_credit_transactions (
      customer_id, amount, balance_after, transaction_type, description, order_id
    ) VALUES (
      v_customer_id, v_order.credit_used, v_new_balance,
      'credit',
      'Refund: order ' || v_order.order_number || ' cancelled',
      p_order_id
    );
  END IF;

  -- Mark credit order's payment_status back to 'refunded' so it doesn't
  -- look "paid" in lists.
  IF v_order.payment_method::TEXT = 'credit' THEN
    UPDATE public.orders SET payment_status = 'refunded'::payment_status
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_customer_order(UUID) TO authenticated;

-- =====================================================================
-- #5  accrue_vendor_earnings — use vendor_selling_price from snapshot
-- =====================================================================
-- Before: vendor share = subtotal × (1 − commission), where subtotal is
-- at admin-marked-up price. So the admin's markup leaked into the vendor
-- payout. After: sum (vendor_selling_price × quantity) per order_items
-- and apply commission to THAT. For legacy rows missing the snapshot
-- field, fall back to unit_price (preserves old behavior).
CREATE OR REPLACE FUNCTION public.accrue_vendor_earnings(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id      UUID;
  v_status         TEXT;
  v_already        TIMESTAMPTZ;
  v_commission     NUMERIC;
  v_vendor_gross   NUMERIC;
  v_vendor_share   NUMERIC;
  v_new_due        NUMERIC;
  v_order_number   TEXT;
BEGIN
  SELECT vendor_id, status::TEXT, vendor_earnings_accrued_at, order_number
    INTO v_vendor_id, v_status, v_already, v_order_number
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found: %', p_order_id;
  END IF;

  IF v_already IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF v_status <> 'delivered' THEN
    RAISE EXCEPTION 'cannot accrue earnings for non-delivered order (status=%)', v_status;
  END IF;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'order % has no vendor_id', p_order_id;
  END IF;

  SELECT COALESCE(commission_rate, 15)
    INTO v_commission
  FROM public.vendors
  WHERE id = v_vendor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor not found: %', v_vendor_id;
  END IF;

  -- Vendor's true gross = sum(vendor_selling_price × quantity).
  -- snapshot.vendor_selling_price added 2026-05-18. Fall back to
  -- unit_price for legacy orders.
  SELECT COALESCE(SUM(
           COALESCE(
             NULLIF((product_snapshot->>'vendor_selling_price')::NUMERIC, 0),
             unit_price
           ) * quantity
         ), 0)
    INTO v_vendor_gross
  FROM public.order_items
  WHERE order_id = p_order_id;

  v_vendor_share := ROUND(v_vendor_gross * (1 - v_commission / 100.0), 2);
  IF v_vendor_share <= 0 THEN
    UPDATE public.orders SET vendor_earnings_accrued_at = NOW() WHERE id = p_order_id;
    RETURN 0;
  END IF;

  UPDATE public.vendors
  SET amount_due = COALESCE(amount_due, 0) + v_vendor_share
  WHERE id = v_vendor_id
  RETURNING amount_due INTO v_new_due;

  INSERT INTO public.vendor_payment_transactions (
    vendor_id, amount, transaction_type, balance_after,
    description, order_id
  ) VALUES (
    v_vendor_id, v_vendor_share, 'debit', v_new_due,
    'Earnings: order ' || COALESCE(v_order_number, p_order_id::TEXT)
      || ' (commission ' || v_commission || '%)',
    p_order_id
  );

  UPDATE public.orders
  SET vendor_earnings_accrued_at = NOW()
  WHERE id = p_order_id;

  RETURN v_vendor_share;
END;
$$;

REVOKE ALL ON FUNCTION public.accrue_vendor_earnings(UUID) FROM PUBLIC;

-- =====================================================================
-- #7  otp_codes attempt counter + lockout
-- =====================================================================
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Helper: register a failed attempt; return whether the row is now
-- locked. Locks for 15 minutes after 5 wrong tries.
CREATE OR REPLACE FUNCTION public.register_otp_failure(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row otp_codes%ROWTYPE;
  v_locked BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_row
  FROM public.otp_codes
  WHERE phone = p_phone
    AND verified = FALSE
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('locked', false, 'attempts', 0);
  END IF;

  UPDATE public.otp_codes
  SET attempts = COALESCE(attempts, 0) + 1,
      locked_until = CASE
        WHEN COALESCE(attempts, 0) + 1 >= 5
        THEN NOW() + INTERVAL '15 minutes'
        ELSE locked_until
      END
  WHERE id = v_row.id
  RETURNING (COALESCE(locked_until, '-infinity'::TIMESTAMPTZ) > NOW())
    INTO v_locked;

  RETURN jsonb_build_object(
    'locked', v_locked,
    'attempts', COALESCE(v_row.attempts, 0) + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_otp_failure(TEXT) FROM PUBLIC;

-- =====================================================================
-- #8  admin_create_delivery_partner — persist bank_account_number, ifsc_code
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_create_delivery_partner(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email TEXT := LOWER(TRIM(payload->>'email'));
  v_full_name TEXT := TRIM(payload->>'full_name');
  v_phone TEXT := TRIM(payload->>'phone');
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can add delivery partners';
  END IF;
  IF v_full_name IS NULL OR v_full_name = '' THEN
    RAISE EXCEPTION 'full_name is required';
  END IF;
  IF (v_email IS NULL OR v_email = '') AND (v_phone IS NULL OR v_phone = '') THEN
    RAISE EXCEPTION 'either email or phone is required';
  END IF;
  IF v_email <> '' AND EXISTS (SELECT 1 FROM public.delivery_partners WHERE LOWER(email) = v_email) THEN
    RAISE EXCEPTION 'a delivery partner with this email already exists';
  END IF;

  INSERT INTO public.delivery_partners (
    email, full_name, phone, alternate_phone,
    address_line1, address_line2, city, state, pincode,
    vehicle_type, vehicle_number, license_number, aadhar_number, pan_number,
    emergency_contact_name, emergency_contact_phone,
    aadhar_front_url, aadhar_back_url, license_front_url, license_back_url,
    profile_image_url, bank_account_number, ifsc_code,
    status, is_verified
  ) VALUES (
    NULLIF(v_email, ''),
    v_full_name,
    NULLIF(v_phone, ''),
    NULLIF(TRIM(payload->>'alternate_phone'), ''),
    NULLIF(TRIM(payload->>'address_line1'), ''),
    NULLIF(TRIM(payload->>'address_line2'), ''),
    NULLIF(TRIM(payload->>'city'), ''),
    NULLIF(TRIM(payload->>'state'), ''),
    NULLIF(TRIM(payload->>'pincode'), ''),
    COALESCE(NULLIF(TRIM(payload->>'vehicle_type'), ''), 'bike')::vehicle_type,
    NULLIF(TRIM(payload->>'vehicle_number'), ''),
    NULLIF(TRIM(payload->>'license_number'), ''),
    NULLIF(TRIM(payload->>'aadhar_number'), ''),
    NULLIF(TRIM(payload->>'pan_number'), ''),
    NULLIF(TRIM(payload->>'emergency_contact_name'), ''),
    NULLIF(TRIM(payload->>'emergency_contact_phone'), ''),
    NULLIF(TRIM(payload->>'aadhar_front_url'), ''),
    NULLIF(TRIM(payload->>'aadhar_back_url'), ''),
    NULLIF(TRIM(payload->>'license_front_url'), ''),
    NULLIF(TRIM(payload->>'license_back_url'), ''),
    NULLIF(TRIM(payload->>'profile_image_url'), ''),
    NULLIF(TRIM(payload->>'bank_account_number'), ''),
    NULLIF(TRIM(payload->>'ifsc_code'), ''),
    'offline'::delivery_status,
    false
  )
  RETURNING id INTO v_id;

  BEGIN
    PERFORM public.log_admin_action(
      'admin_create_delivery_partner', 'delivery_partner', v_id,
      jsonb_build_object('email', v_email, 'full_name', v_full_name, 'phone', v_phone)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_delivery_partner(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_delivery_partner(JSONB) TO authenticated;

-- =====================================================================
-- #9  products.admin_selling_price guard
-- =====================================================================
-- Permits NULL (no override) or a positive number. Caps at 5× mrp to
-- block obvious typo-fat-fingers without being so strict that legitimate
-- promo pricing is rejected.
--
-- NOT VALID so existing rows that already violate the constraint aren't
-- rejected at migration time; only future INSERT/UPDATE values are
-- checked. Run `ALTER TABLE products VALIDATE CONSTRAINT
-- chk_admin_selling_price_sane;` after backfilling/cleaning the legacy
-- rows.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS chk_admin_selling_price_sane;
ALTER TABLE public.products
  ADD CONSTRAINT chk_admin_selling_price_sane
  CHECK (
    admin_selling_price IS NULL
    OR (
      admin_selling_price > 0
      AND (mrp IS NULL OR admin_selling_price <= mrp * 5)
    )
  )
  NOT VALID;

-- =====================================================================
-- #31 atomic admin credit/payment RPCs
-- =====================================================================
-- profile update + ledger insert in one statement so no orphan rows on
-- partial failure.

-- A. Set credit limit (no balance txn, just metadata; see audit #6 — we
-- explicitly DO NOT write a customer_credit_transactions row here).
CREATE OR REPLACE FUNCTION public.admin_set_credit_limit(
  p_customer_id UUID,
  p_new_limit   NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_limit NUMERIC;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can change credit limits';
  END IF;
  IF p_new_limit IS NULL OR p_new_limit < 0 THEN
    RAISE EXCEPTION 'invalid credit limit';
  END IF;

  SELECT COALESCE(credit_limit, 0) INTO v_old_limit
  FROM public.profiles WHERE user_id = p_customer_id FOR UPDATE;

  UPDATE public.profiles
  SET credit_limit = p_new_limit
  WHERE user_id = p_customer_id;

  BEGIN
    PERFORM public.log_admin_action(
      'admin_set_credit_limit', 'profile', p_customer_id,
      jsonb_build_object('old_limit', v_old_limit, 'new_limit', p_new_limit)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_credit_limit(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_credit_limit(UUID, NUMERIC) TO authenticated;

-- B. Record a credit payment by the customer (decreases balance, logs txn).
CREATE OR REPLACE FUNCTION public.admin_record_credit_payment(
  p_customer_id  UUID,
  p_amount       NUMERIC,
  p_description  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can record credit payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  UPDATE public.profiles
  SET credit_balance = GREATEST(0, COALESCE(credit_balance, 0) - p_amount)
  WHERE user_id = p_customer_id
  RETURNING credit_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'customer profile not found';
  END IF;

  INSERT INTO public.customer_credit_transactions (
    customer_id, amount, balance_after, transaction_type, description
  ) VALUES (
    p_customer_id, p_amount, v_new_balance, 'credit',
    COALESCE(p_description, 'Credit payment received')
  );

  BEGIN
    PERFORM public.log_admin_action(
      'admin_record_credit_payment', 'profile', p_customer_id,
      jsonb_build_object('amount', p_amount)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_credit_payment(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_credit_payment(UUID, NUMERIC, TEXT) TO authenticated;

-- C. Record a payout to vendor (decreases vendor.amount_due, logs txn).
CREATE OR REPLACE FUNCTION public.admin_record_vendor_payment(
  p_vendor_id   UUID,
  p_amount      NUMERIC,
  p_description TEXT,
  p_transaction_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_due NUMERIC;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can record vendor payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  UPDATE public.vendors
  SET amount_due = GREATEST(0, COALESCE(amount_due, 0) - p_amount)
  WHERE id = p_vendor_id
  RETURNING amount_due INTO v_new_due;

  IF v_new_due IS NULL THEN
    RAISE EXCEPTION 'vendor not found';
  END IF;

  INSERT INTO public.vendor_payment_transactions (
    vendor_id, amount, transaction_type, balance_after,
    description, transaction_id
  ) VALUES (
    p_vendor_id, p_amount, 'credit', v_new_due,
    COALESCE(p_description, 'Vendor payout'),
    p_transaction_id
  );

  BEGIN
    PERFORM public.log_admin_action(
      'admin_record_vendor_payment', 'vendor', p_vendor_id,
      jsonb_build_object('amount', p_amount, 'transaction_id', p_transaction_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'new_amount_due', v_new_due);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_vendor_payment(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_vendor_payment(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
