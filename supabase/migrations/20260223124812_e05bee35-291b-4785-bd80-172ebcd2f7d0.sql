
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  image_url text NOT NULL,
  link_url text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active banners"
  ON public.banners FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage banners"
  ON public.banners FOR ALL
  USING (is_admin(auth.uid()));

CREATE TRIGGER update_banners_updated_at
  BEFORE UPDATE ON public.banners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('banner-images', 'banner-images', true);

CREATE POLICY "Public can view banner images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'banner-images');

CREATE POLICY "Admins can upload banner images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'banner-images' AND
    is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete banner images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'banner-images' AND
    is_admin(auth.uid())
  );
