-- =============================================
-- PART 1: Create Admins Table
-- =============================================
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(15),
  department VARCHAR(100),
  designation VARCHAR(100),
  is_super_admin BOOLEAN DEFAULT false,
  status public.user_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- PART 2: Add columns to delivery_partners (if not already done)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_partners' AND column_name = 'email') THEN
    ALTER TABLE public.delivery_partners
      ADD COLUMN email VARCHAR(255) UNIQUE,
      ADD COLUMN full_name VARCHAR(255),
      ADD COLUMN phone VARCHAR(15),
      ADD COLUMN alternate_phone VARCHAR(15),
      ADD COLUMN address_line1 VARCHAR(255),
      ADD COLUMN address_line2 VARCHAR(255),
      ADD COLUMN city VARCHAR(100),
      ADD COLUMN state VARCHAR(100),
      ADD COLUMN pincode VARCHAR(10),
      ADD COLUMN date_of_birth DATE,
      ADD COLUMN aadhar_number VARCHAR(12),
      ADD COLUMN pan_number VARCHAR(10),
      ADD COLUMN emergency_contact_name VARCHAR(255),
      ADD COLUMN emergency_contact_phone VARCHAR(15),
      ADD COLUMN profile_image_url TEXT,
      ADD COLUMN aadhar_front_url TEXT,
      ADD COLUMN aadhar_back_url TEXT,
      ADD COLUMN license_front_url TEXT,
      ADD COLUMN license_back_url TEXT;
  END IF;
END $$;

-- =============================================
-- PART 3: Add columns to vendors (if not already done)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'email') THEN
    ALTER TABLE public.vendors
      ADD COLUMN email VARCHAR(255) UNIQUE,
      ADD COLUMN owner_name VARCHAR(255),
      ADD COLUMN phone VARCHAR(15),
      ADD COLUMN alternate_phone VARCHAR(15),
      ADD COLUMN address_line1 VARCHAR(255),
      ADD COLUMN address_line2 VARCHAR(255),
      ADD COLUMN city VARCHAR(100),
      ADD COLUMN state VARCHAR(100),
      ADD COLUMN pincode VARCHAR(10),
      ADD COLUMN owner_aadhar_number VARCHAR(12),
      ADD COLUMN owner_photo_url TEXT,
      ADD COLUMN store_photo_url TEXT,
      ADD COLUMN fssai_number VARCHAR(50),
      ADD COLUMN fssai_certificate_url TEXT;
  END IF;
END $$;

-- =============================================
-- PART 4: Drop all dependent policies first
-- =============================================
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own addresses" ON public.user_addresses;
DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
DROP POLICY IF EXISTS "Only admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can view active vendors" ON public.vendors;
DROP POLICY IF EXISTS "Vendors can update their own profile" ON public.vendors;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Vendors can manage their own products" ON public.products;
DROP POLICY IF EXISTS "Delivery partners can view their own profile" ON public.delivery_partners;
DROP POLICY IF EXISTS "Delivery partners can update their own profile" ON public.delivery_partners;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Orders can be updated by relevant parties" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own order items" ON public.order_items;
DROP POLICY IF EXISTS "Only admins can manage discounts" ON public.discounts;
DROP POLICY IF EXISTS "Anyone can view active discounts" ON public.discounts;

-- =============================================
-- PART 5: Drop and recreate is_admin function
-- =============================================
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;

-- New is_admin function checks admins table
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = _user_id
      AND status = 'active'
  )
$$;

-- Create is_vendor function
CREATE OR REPLACE FUNCTION public.is_vendor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendors
    WHERE user_id = _user_id
      AND status = 'active'
  )
$$;

-- Create is_delivery_partner function
CREATE OR REPLACE FUNCTION public.is_delivery_partner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.delivery_partners
    WHERE user_id = _user_id
  )
$$;

-- =============================================
-- PART 6: Recreate all dropped policies with new is_admin
-- =============================================

-- Profiles policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- User roles policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Only admins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());

-- User addresses policies
CREATE POLICY "Users can view their own addresses"
ON public.user_addresses FOR SELECT
USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Categories policies
CREATE POLICY "Anyone can view active categories"
ON public.categories FOR SELECT
USING (is_active = true OR is_admin(auth.uid()));

CREATE POLICY "Only admins can manage categories"
ON public.categories FOR ALL
USING (is_admin(auth.uid()));

-- Vendors policies
CREATE POLICY "View vendor records"
ON public.vendors FOR SELECT
USING (status = 'active' OR auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Update vendor records"
ON public.vendors FOR UPDATE
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Admins can insert vendors"
ON public.vendors FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete vendors"
ON public.vendors FOR DELETE
USING (is_admin(auth.uid()));

-- Products policies
CREATE POLICY "Anyone can view active products"
ON public.products FOR SELECT
USING (
  status = 'active' OR is_admin(auth.uid()) OR
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = products.vendor_id AND vendors.user_id = auth.uid())
);

CREATE POLICY "Vendors can manage their own products"
ON public.products FOR ALL
USING (
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = products.vendor_id AND vendors.user_id = auth.uid())
  OR is_admin(auth.uid())
);

-- Delivery partners policies
CREATE POLICY "View delivery partner records"
ON public.delivery_partners FOR SELECT
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Update delivery partner records"
ON public.delivery_partners FOR UPDATE
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Admins can insert delivery partners"
ON public.delivery_partners FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete delivery partners"
ON public.delivery_partners FOR DELETE
USING (is_admin(auth.uid()));

-- Orders policies
CREATE POLICY "Users can view their own orders"
ON public.orders FOR SELECT
USING (
  auth.uid() = customer_id OR is_admin(auth.uid()) OR
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM delivery_partners WHERE delivery_partners.id = orders.delivery_partner_id AND delivery_partners.user_id = auth.uid())
);

CREATE POLICY "Orders can be updated by relevant parties"
ON public.orders FOR UPDATE
USING (
  is_admin(auth.uid()) OR
  EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.user_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM delivery_partners WHERE delivery_partners.id = orders.delivery_partner_id AND delivery_partners.user_id = auth.uid())
);

-- Order items policies
CREATE POLICY "Users can view their own order items"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id AND (
      orders.customer_id = auth.uid() OR is_admin(auth.uid()) OR
      EXISTS (SELECT 1 FROM vendors WHERE vendors.id = orders.vendor_id AND vendors.user_id = auth.uid()) OR
      EXISTS (SELECT 1 FROM delivery_partners WHERE delivery_partners.id = orders.delivery_partner_id AND delivery_partners.user_id = auth.uid())
    )
  )
);

-- Discounts policies
CREATE POLICY "Anyone can view active discounts"
ON public.discounts FOR SELECT
USING (is_active = true AND now() >= valid_from AND now() <= valid_until);

CREATE POLICY "Only admins can manage discounts"
ON public.discounts FOR ALL
USING (is_admin(auth.uid()));

-- =============================================
-- PART 7: Enable RLS and create policies for admins table
-- =============================================
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all admin records"
ON public.admins FOR SELECT
USING (is_admin(auth.uid()) OR auth.uid() = user_id);

CREATE POLICY "Only admins can insert admin records"
ON public.admins FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Only admins can update admin records"
ON public.admins FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Only super admins can delete admin records"
ON public.admins FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid() AND is_super_admin = true)
);

-- =============================================
-- PART 8: Update handle_new_user trigger function
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.phone
  );
  
  -- Auto-link to admins table if email matches
  UPDATE public.admins
  SET user_id = NEW.id, updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- Auto-link to vendors table if email matches
  UPDATE public.vendors
  SET user_id = NEW.id, updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  -- Auto-link to delivery_partners table if email matches
  UPDATE public.delivery_partners
  SET user_id = NEW.id, updated_at = now()
  WHERE email = NEW.email AND user_id IS NULL;
  
  RETURN NEW;
END;
$$;

-- =============================================
-- PART 9: Add updated_at trigger for admins
-- =============================================
DROP TRIGGER IF EXISTS update_admins_updated_at ON public.admins;
CREATE TRIGGER update_admins_updated_at
  BEFORE UPDATE ON public.admins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();