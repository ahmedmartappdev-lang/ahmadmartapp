-- Vendor-first catalog refactor (Step 1 — schema + RPC patch).
--
-- The customer browse experience is moving from "products grouped by
-- category" → "vendors grouped by category" (Swiggy/Zomato model). To
-- support that, vendor rows declare ONE root category + N subcategories.
-- Categories get an admin-controlled `offer_text` (free text e.g.
-- "23% OFF" or "FREE DELIVERY") that renders as a chip on the new
-- vertical category list.
--
-- This migration is intentionally additive: existing nothing-reads-it
-- defaults mean the app keeps working before the UI lands. Idempotent.

-- 1. vendors: category_id (single root) + subcategory_ids (multi)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_vendors_category_id ON public.vendors(category_id);
-- GIN index on subcategory_ids lets us filter "vendors whose subs include X" fast
CREATE INDEX IF NOT EXISTS idx_vendors_subcategory_ids ON public.vendors USING GIN (subcategory_ids);

-- 2. categories: offer_text for the chip rendered on the customer
--    vertical list. Free text, optional, max 30 chars enforced by UI.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS offer_text TEXT;

-- 3. admin_create_vendor RPC — accept two new payload keys
--    `category_id` (uuid as text) and `subcategory_ids` (jsonb array of uuids).
--    Both are OPTIONAL — existing callers that don't send them still work
--    (vendor created with NULL category + empty array).
CREATE OR REPLACE FUNCTION public.admin_create_vendor(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_email TEXT := LOWER(TRIM(payload->>'email'));
  v_business_name TEXT := TRIM(payload->>'business_name');
  v_phone TEXT := TRIM(payload->>'phone');
  v_category_id UUID := NULLIF(payload->>'category_id', '')::uuid;
  v_subcategory_ids UUID[] := COALESCE(
    (SELECT ARRAY(SELECT jsonb_array_elements_text(payload->'subcategory_ids')::uuid)),
    '{}'::uuid[]
  );
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can add vendors';
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email is required';
  END IF;
  IF v_business_name IS NULL OR v_business_name = '' THEN
    RAISE EXCEPTION 'business_name is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vendors WHERE LOWER(email) = v_email) THEN
    RAISE EXCEPTION 'a vendor with this email already exists';
  END IF;
  IF v_phone <> '' AND EXISTS (SELECT 1 FROM public.vendors WHERE phone = v_phone) THEN
    RAISE EXCEPTION 'a vendor with this phone number already exists';
  END IF;

  INSERT INTO public.vendors (
    email, business_name, owner_name, phone, alternate_phone,
    store_address, address_line1, address_line2, city, state, pincode,
    gst_number, pan_number, owner_aadhar_number, fssai_number,
    business_license, bank_account_number, ifsc_code, status,
    category_id, subcategory_ids
  ) VALUES (
    v_email, v_business_name,
    NULLIF(TRIM(payload->>'owner_name'), ''),
    NULLIF(v_phone, ''),
    NULLIF(TRIM(payload->>'alternate_phone'), ''),
    NULLIF(TRIM(payload->>'store_address'), ''),
    NULLIF(TRIM(payload->>'address_line1'), ''),
    NULLIF(TRIM(payload->>'address_line2'), ''),
    NULLIF(TRIM(payload->>'city'), ''),
    NULLIF(TRIM(payload->>'state'), ''),
    NULLIF(TRIM(payload->>'pincode'), ''),
    NULLIF(TRIM(payload->>'gst_number'), ''),
    NULLIF(TRIM(payload->>'pan_number'), ''),
    NULLIF(TRIM(payload->>'owner_aadhar_number'), ''),
    NULLIF(TRIM(payload->>'fssai_number'), ''),
    NULLIF(TRIM(payload->>'business_license'), ''),
    NULLIF(TRIM(payload->>'bank_account_number'), ''),
    NULLIF(TRIM(payload->>'ifsc_code'), ''),
    'pending'::vendor_status,
    v_category_id,
    v_subcategory_ids
  ) RETURNING id INTO v_id;

  BEGIN
    PERFORM public.log_admin_action('admin_create_vendor', 'vendor', v_id,
      jsonb_build_object('email', v_email, 'business_name', v_business_name,
                         'category_id', v_category_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;
