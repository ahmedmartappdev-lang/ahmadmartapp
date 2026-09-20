-- ============================================================
-- Migration: Delivery Assignment Mode (Auto vs Manual)
-- ============================================================

-- 1. Create app_settings table (key-value store for app config)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 2. Enable RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies: all authenticated users can read, only admins can write
CREATE POLICY "Authenticated users can read app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert app_settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update app_settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can delete app_settings"
  ON public.app_settings FOR DELETE
  TO authenticated
  USING (is_admin(auth.uid()));

-- 4. Seed the default setting
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'delivery_assignment_mode',
  'auto',
  'Controls whether delivery partners can self-assign orders (auto) or only admin can assign (manual)'
)
ON CONFLICT (key) DO NOTHING;

-- 5. Create helper function to check if auto delivery assignment is enabled
CREATE OR REPLACE FUNCTION public.is_auto_delivery_assignment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value = 'auto' FROM public.app_settings WHERE key = 'delivery_assignment_mode'),
    true  -- default to auto if setting is missing
  )
$$;

-- 6. Update orders RLS SELECT policy for delivery partners
-- Drop existing delivery partner select policy and recreate with assignment mode check
-- Note: The exact policy name may vary. This drops and recreates the relevant policy.
-- If the policy name differs in your DB, adjust accordingly.

DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Find and drop delivery-partner-related SELECT policies on orders
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'orders'
      AND schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual::text LIKE '%delivery_partner%'
      AND qual::text NOT LIKE '%is_auto_delivery_assignment%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
  END LOOP;
END $$;

-- Recreate delivery partner SELECT policy with auto-assignment check
CREATE POLICY "Delivery partners can view their assigned orders or available orders in auto mode"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    is_delivery_partner(auth.uid()) AND (
      -- Always allow viewing own assigned orders
      delivery_partner_id = (
        SELECT id FROM public.delivery_partners WHERE user_id = auth.uid() LIMIT 1
      )
      OR
      -- Only allow viewing unassigned ready_for_pickup orders in auto mode
      (
        status = 'ready_for_pickup'
        AND delivery_partner_id IS NULL
        AND is_auto_delivery_assignment()
      )
    )
  );

-- 7. Update orders RLS UPDATE policy for delivery partners
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Find and drop delivery-partner-related UPDATE policies on orders
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'orders'
      AND schemaname = 'public'
      AND cmd = 'UPDATE'
      AND qual::text LIKE '%delivery_partner%'
      AND qual::text NOT LIKE '%is_auto_delivery_assignment%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
  END LOOP;
END $$;

-- Recreate delivery partner UPDATE policy with auto-assignment check
CREATE POLICY "Delivery partners can update their assigned orders or claim in auto mode"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    is_delivery_partner(auth.uid()) AND (
      -- Allow updating own assigned orders (status transitions)
      delivery_partner_id = (
        SELECT id FROM public.delivery_partners WHERE user_id = auth.uid() LIMIT 1
      )
      OR
      -- Only allow claiming unassigned orders in auto mode
      (
        status = 'ready_for_pickup'
        AND delivery_partner_id IS NULL
        AND is_auto_delivery_assignment()
      )
    )
  )
  WITH CHECK (
    is_delivery_partner(auth.uid())
  );
