
-- Create bill_status enum
CREATE TYPE public.bill_status AS ENUM ('pending', 'approved', 'rejected');

-- Create delivery_bills table
CREATE TABLE public.delivery_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id uuid NOT NULL REFERENCES public.delivery_partners(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  bill_image_url text NOT NULL,
  amount numeric NOT NULL,
  description text,
  status public.bill_status NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_bills ENABLE ROW LEVEL SECURITY;

-- Delivery partners can insert their own bills
CREATE POLICY "Delivery partners can insert their own bills"
ON public.delivery_bills FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.delivery_partners
    WHERE id = delivery_partner_id AND user_id = auth.uid()
  )
);

-- Delivery partners can view their own bills
CREATE POLICY "Delivery partners can view their own bills"
ON public.delivery_bills FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.delivery_partners
    WHERE id = delivery_partner_id AND user_id = auth.uid()
  )
);

-- Admins can view all bills
CREATE POLICY "Admins can view all bills"
ON public.delivery_bills FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- Admins can update bills (approve/reject)
CREATE POLICY "Admins can update bills"
ON public.delivery_bills FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

-- Create bill-images storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('bill-images', 'bill-images', true);

-- Storage policies for bill-images
CREATE POLICY "Anyone can view bill images"
ON storage.objects FOR SELECT
USING (bucket_id = 'bill-images');

CREATE POLICY "Authenticated users can upload bill images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'bill-images');

CREATE POLICY "Users can delete their own bill images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'bill-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admin can UPDATE order_items
CREATE POLICY "Admins can update order items"
ON public.order_items FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

-- Admin can DELETE order_items
CREATE POLICY "Admins can delete order items"
ON public.order_items FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));
