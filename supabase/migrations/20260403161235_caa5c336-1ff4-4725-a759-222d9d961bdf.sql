
CREATE TABLE public.credit_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_applications ENABLE ROW LEVEL SECURITY;

-- Customers can insert their own applications
CREATE POLICY "Customers can apply for credit"
ON public.credit_applications FOR INSERT
TO authenticated
WITH CHECK (customer_id = auth.uid());

-- Customers can view their own applications
CREATE POLICY "Customers can view own applications"
ON public.credit_applications FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
ON public.credit_applications FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admins can update applications (approve/reject)
CREATE POLICY "Admins can update applications"
ON public.credit_applications FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));
