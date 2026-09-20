-- Audit finding #20: useUserRoles.tsx treats anyone present in
-- delivery_partners as a partner, ignoring account_status. The server
-- gate (is_delivery_partner) correctly excludes suspended partners, but
-- the client renders empty dashboard cards instead of explaining what
-- happened. Surface account_status through the RPC so the hook can show
-- a "Your account is suspended" screen instead.

-- Returning a different column shape than the previous definition, so we
-- have to drop first — `CREATE OR REPLACE` can't change the OUT-row
-- columns of an existing function.
DROP FUNCTION IF EXISTS public.find_my_delivery_partner();

CREATE OR REPLACE FUNCTION public.find_my_delivery_partner()
RETURNS TABLE(id uuid, phone varchar, account_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dp.id, dp.phone, COALESCE(dp.account_status::text, 'active') AS account_status
  FROM delivery_partners dp
  WHERE dp.user_id = auth.uid()
  LIMIT 1;
$$;
