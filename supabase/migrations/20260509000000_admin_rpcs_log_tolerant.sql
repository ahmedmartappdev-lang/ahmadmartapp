-- Make the 3 admin entity-creation RPCs tolerant of log_admin_action()
-- not existing yet (audit log migration may not have been applied).
-- Wraps the PERFORM in an EXCEPTION block so the INSERT commits
-- even if logging fails.

CREATE OR REPLACE FUNCTION public.admin_create_vendor(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email TEXT := LOWER(TRIM(payload->>'email'));
  v_business_name TEXT := TRIM(payload->>'business_name');
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

  INSERT INTO public.vendors (
    email, business_name, owner_name, phone, alternate_phone,
    store_address, address_line1, address_line2, city, state, pincode,
    gst_number, pan_number, owner_aadhar_number, fssai_number,
    business_license, bank_account_number, ifsc_code, status
  ) VALUES (
    v_email,
    v_business_name,
    NULLIF(TRIM(payload->>'owner_name'), ''),
    NULLIF(TRIM(payload->>'phone'), ''),
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
    'pending'::vendor_status
  )
  RETURNING id INTO v_id;

  BEGIN
    PERFORM public.log_admin_action(
      'admin_create_vendor', 'vendor', v_id,
      jsonb_build_object('email', v_email, 'business_name', v_business_name)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_admin(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_email TEXT := LOWER(TRIM(payload->>'email'));
  v_full_name TEXT := TRIM(payload->>'full_name');
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'only admins can add team members';
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email is required';
  END IF;
  IF v_full_name IS NULL OR v_full_name = '' THEN
    RAISE EXCEPTION 'full_name is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admins WHERE LOWER(email) = v_email) THEN
    RAISE EXCEPTION 'an admin with this email already exists';
  END IF;

  INSERT INTO public.admins (
    email, full_name, phone, department, designation, is_super_admin, status
  ) VALUES (
    v_email,
    v_full_name,
    NULLIF(TRIM(payload->>'phone'), ''),
    NULLIF(TRIM(payload->>'department'), ''),
    NULLIF(TRIM(payload->>'designation'), ''),
    COALESCE((payload->>'is_super_admin')::boolean, false),
    'active'::user_status
  )
  RETURNING id INTO v_id;

  BEGIN
    PERFORM public.log_admin_action(
      'admin_create_admin', 'admin', v_id,
      jsonb_build_object('email', v_email, 'full_name', v_full_name)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

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
    profile_image_url, status, is_verified
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
