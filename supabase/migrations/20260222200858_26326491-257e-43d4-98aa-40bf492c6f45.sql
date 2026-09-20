
-- Allow admins to create profiles for new customers
CREATE POLICY "Admins can create profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()));

-- Allow admins to create addresses for customers
CREATE POLICY "Admins can create addresses for customers"
ON public.user_addresses FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()));
