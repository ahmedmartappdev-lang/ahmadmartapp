-- Fix Google-OAuth admin/vendor login broken by the earlier OTP retrofit.
--
-- Problem chain:
--   1. RLS on admins/vendors only lets a row be SELECTed when auth.uid()
--      matches user_id (or caller is already admin). For a *new* admin
--      whose auth.users row exists but admins.user_id is still NULL, the
--      client-side .from('admins').select(...).eq('email', email)
--      returns 0 rows -> "not registered as admin" -> signOut.
--   2. The live handle_new_user trigger was overwritten and no longer
--      auto-links admins/vendors/delivery_partners by email at signup.
--      Worse, it inserts (id, email) into profiles, omitting the NOT
--      NULL user_id and full_name columns -- broken for any new signup.
--   3. Even a fixed signup-time trigger can't help admins added AFTER
--      the user already signed up. Linkage must happen on every login.
--
-- This migration:
--   * Restores handle_new_user to a working signup-time linker.
--   * Adds claim_role_by_email() RPC that runs on every login and
--     bypasses RLS to link by email server-side.
--   * Backfills the 3 stranded admin rows whose email already matches
--     an auth.users row.

-- ============ A. Restore handle_new_user trigger ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := COALESCE(NEW.email, '');
BEGIN
  -- Profile row keyed on user_id (the FK to auth.users.id).
  -- profiles.user_id has a UNIQUE constraint that powers ON CONFLICT.
  INSERT INTO public.profiles (user_id, email, full_name, phone)
  VALUES (
    NEW.id,
    NULLIF(v_email, ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'User'),
    NEW.phone
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    updated_at = NOW();

  -- Auto-link role rows by email. Email is a verified attribute for
  -- Google OAuth (Google attests to ownership), so linking by email is
  -- safe in a way that phone-based linkage is not. We do NOT auto-link
  -- by phone here -- the OTP flow already handles that path.
  IF v_email <> '' THEN
    UPDATE public.admins
    SET user_id = NEW.id, updated_at = NOW()
    WHERE user_id IS NULL AND LOWER(email) = LOWER(v_email);

    UPDATE public.vendors
    SET user_id = NEW.id, updated_at = NOW()
    WHERE user_id IS NULL AND LOWER(email) = LOWER(v_email);

    UPDATE public.delivery_partners
    SET user_id = NEW.id, updated_at = NOW()
    WHERE user_id IS NULL AND LOWER(email) = LOWER(v_email);
  END IF;

  RETURN NEW;
END;
$$;

-- Make sure the trigger is wired up in case it was disabled earlier.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ B. Login-time role-linker RPC ============
-- Returns:
--   { ok: true,  role, linked_now: bool, id: uuid } when the caller's
--     verified email matches a role row that they own (or just linked).
--   { ok: false, reason: 'no_row' }         no admins/vendors row exists
--   { ok: false, reason: 'taken_by_other' } row exists but is linked to
--                                            a different auth user
--   { ok: false, reason: 'inactive' }        row exists, status not active
CREATE OR REPLACE FUNCTION public.claim_role_by_email(p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_row RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  IF p_role NOT IN ('admin', 'vendor') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_role');
  END IF;

  -- Server-side email lookup -- never trust a client-supplied email.
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  IF v_email IS NULL OR length(trim(v_email)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_email');
  END IF;

  IF p_role = 'admin' THEN
    SELECT id, user_id, status::TEXT AS status_text
      INTO v_row
    FROM public.admins
    WHERE LOWER(email) = LOWER(v_email)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT id, user_id, status::TEXT AS status_text
      INTO v_row
    FROM public.vendors
    WHERE LOWER(email) = LOWER(v_email)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_row');
  END IF;

  IF v_row.user_id IS NOT NULL AND v_row.user_id <> v_uid THEN
    -- Someone else already claimed this role row. Refuse.
    RETURN jsonb_build_object('ok', false, 'reason', 'taken_by_other');
  END IF;

  -- Check status -- 'active' is the canonical "may log in" value across
  -- both admin_status and vendor_status enums.
  IF v_row.status_text <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive', 'status', v_row.status_text);
  END IF;

  IF v_row.user_id IS NULL THEN
    IF p_role = 'admin' THEN
      UPDATE public.admins SET user_id = v_uid, updated_at = NOW() WHERE id = v_row.id;
    ELSE
      UPDATE public.vendors SET user_id = v_uid, updated_at = NOW() WHERE id = v_row.id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'role', p_role, 'id', v_row.id, 'linked_now', true);
  END IF;

  -- Already linked to caller -- no-op.
  RETURN jsonb_build_object('ok', true, 'role', p_role, 'id', v_row.id, 'linked_now', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_role_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_role_by_email(TEXT) TO authenticated;

-- ============ C. One-shot backfill ============
-- Idempotent: only acts on rows where user_id is NULL and a matching
-- auth.users row exists (case-insensitive). Safe to re-run.
UPDATE public.admins a
SET user_id = u.id, updated_at = NOW()
FROM auth.users u
WHERE a.user_id IS NULL
  AND a.email IS NOT NULL
  AND u.email IS NOT NULL
  AND LOWER(a.email) = LOWER(u.email);

UPDATE public.vendors v
SET user_id = u.id, updated_at = NOW()
FROM auth.users u
WHERE v.user_id IS NULL
  AND v.email IS NOT NULL
  AND u.email IS NOT NULL
  AND LOWER(v.email) = LOWER(u.email);

UPDATE public.delivery_partners d
SET user_id = u.id, updated_at = NOW()
FROM auth.users u
WHERE d.user_id IS NULL
  AND d.email IS NOT NULL
  AND u.email IS NOT NULL
  AND LOWER(d.email) = LOWER(u.email);

-- Backfill profiles.email for OAuth users whose profile row was created
-- before the email column existed.
UPDATE public.profiles p
SET email = u.email, updated_at = NOW()
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.email IS NULL OR p.email = '')
  AND u.email IS NOT NULL;
