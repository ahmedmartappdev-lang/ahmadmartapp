
-- Service areas table for defining where delivery is available
CREATE TABLE public.service_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name varchar NOT NULL,
  center_latitude numeric NOT NULL,
  center_longitude numeric NOT NULL,
  radius_km numeric NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;

-- Anyone can read active service areas (needed for client-side validation)
CREATE POLICY "Anyone can view active service areas"
ON public.service_areas
FOR SELECT
USING (is_active = true OR is_admin(auth.uid()));

-- Only admins can manage service areas
CREATE POLICY "Only admins can manage service areas"
ON public.service_areas
FOR ALL
USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_service_areas_updated_at
BEFORE UPDATE ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
