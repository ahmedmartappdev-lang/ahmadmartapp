
-- Time slots table
CREATE TABLE public.time_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active time slots" ON public.time_slots
  FOR SELECT USING (is_active = true OR is_admin(auth.uid()));

CREATE POLICY "Admins can manage time slots" ON public.time_slots
  FOR ALL USING (is_admin(auth.uid()));

CREATE TRIGGER update_time_slots_updated_at
  BEFORE UPDATE ON public.time_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Product time slots junction
CREATE TABLE public.product_time_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  time_slot_id UUID NOT NULL REFERENCES public.time_slots(id) ON DELETE CASCADE,
  UNIQUE(product_id, time_slot_id)
);

ALTER TABLE public.product_time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view product time slots" ON public.product_time_slots
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage product time slots" ON public.product_time_slots
  FOR ALL USING (is_admin(auth.uid()));

-- Credit cash collections
CREATE TABLE public.credit_cash_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL,
  delivery_partner_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  order_id UUID REFERENCES public.orders(id),
  notes TEXT
);

ALTER TABLE public.credit_cash_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery partners can insert own collections" ON public.credit_cash_collections
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM delivery_partners WHERE id = credit_cash_collections.delivery_partner_id AND user_id = auth.uid())
  );

CREATE POLICY "Delivery partners can view own collections" ON public.credit_cash_collections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM delivery_partners WHERE id = credit_cash_collections.delivery_partner_id AND user_id = auth.uid())
  );

CREATE POLICY "Admins can view all collections" ON public.credit_cash_collections
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update collections" ON public.credit_cash_collections
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Customers can view own collections" ON public.credit_cash_collections
  FOR SELECT USING (customer_id = auth.uid());
