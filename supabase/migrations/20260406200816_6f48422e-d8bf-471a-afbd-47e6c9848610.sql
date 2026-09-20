CREATE OR REPLACE FUNCTION public.link_delivery_partner_user(p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_user_phone text;
BEGIN
  -- Get the partner's phone
  SELECT phone INTO v_phone FROM delivery_partners WHERE id = p_partner_id;
  
  -- Get the current user's phone from profiles
  SELECT phone INTO v_user_phone FROM profiles WHERE user_id = auth.uid();
  
  -- Only allow linking if the user's phone matches the partner's phone
  IF v_phone IS NOT NULL AND v_user_phone IS NOT NULL AND 
     (v_phone = v_user_phone OR 
      replace(v_phone, '+91', '') = replace(v_user_phone, '+91', '')) THEN
    UPDATE delivery_partners
    SET user_id = auth.uid(), updated_at = now()
    WHERE id = p_partner_id;
  END IF;
END;
$$;