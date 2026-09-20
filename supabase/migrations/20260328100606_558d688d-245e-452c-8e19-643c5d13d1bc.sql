-- Create otp_codes table for storing OTPs
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_otp_codes_phone_otp ON public.otp_codes (phone, otp, verified);
CREATE INDEX idx_otp_codes_expires_at ON public.otp_codes (expires_at);

-- No RLS needed - accessed only via service role from edge functions
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Update handle_new_user trigger to also link by phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.phone
  );
  
  -- Auto-link to admins table if email or phone matches
  UPDATE public.admins
  SET user_id = NEW.id, updated_at = now()
  WHERE user_id IS NULL AND (
    (email IS NOT NULL AND email = NEW.email) OR
    (phone IS NOT NULL AND phone = NEW.phone)
  );
  
  -- Auto-link to vendors table if email or phone matches
  UPDATE public.vendors
  SET user_id = NEW.id, updated_at = now()
  WHERE user_id IS NULL AND (
    (email IS NOT NULL AND email = NEW.email) OR
    (phone IS NOT NULL AND phone = NEW.phone)
  );
  
  -- Auto-link to delivery_partners table if email or phone matches
  UPDATE public.delivery_partners
  SET user_id = NEW.id, updated_at = now()
  WHERE user_id IS NULL AND (
    (email IS NOT NULL AND email = NEW.email) OR
    (phone IS NOT NULL AND phone = NEW.phone)
  );
  
  RETURN NEW;
END;
$$;