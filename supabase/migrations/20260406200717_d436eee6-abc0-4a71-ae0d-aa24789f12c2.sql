CREATE OR REPLACE FUNCTION public.find_my_delivery_partner()
RETURNS TABLE(id uuid, phone varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dp.id, dp.phone
  FROM delivery_partners dp
  WHERE dp.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_delivery_partner_by_phone(p_phone text)
RETURNS TABLE(id uuid, phone varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dp.id, dp.phone
  FROM delivery_partners dp
  WHERE dp.phone = p_phone
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.link_delivery_partner_user(p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE delivery_partners
  SET user_id = auth.uid(), updated_at = now()
  WHERE id = p_partner_id
    AND (user_id IS NULL OR user_id = auth.uid());
END;
$$;