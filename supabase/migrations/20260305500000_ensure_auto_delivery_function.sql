-- Ensure the is_auto_delivery_assignment function exists and works correctly
CREATE OR REPLACE FUNCTION public.is_auto_delivery_assignment()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value = 'auto' FROM public.app_settings WHERE key = 'delivery_assignment_mode'),
    true
  )
$$;

-- Ensure the setting row exists
INSERT INTO public.app_settings (key, value, description)
VALUES (
  'delivery_assignment_mode',
  'manual',
  'Controls whether delivery partners can self-assign orders (auto) or only admin can assign (manual)'
)
ON CONFLICT (key) DO NOTHING;
