-- =============================================
-- PHASE 1: SAMPLE DATA MIGRATION
-- =============================================

-- 1. Insert Categories
INSERT INTO public.categories (id, name, slug, description, display_order, is_active, image_url) VALUES
  ('11111111-1111-1111-1111-111111111001', 'Fruits & Vegetables', 'fruits-vegetables', 'Fresh fruits and vegetables delivered to your doorstep', 1, true, 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400'),
  ('11111111-1111-1111-1111-111111111002', 'Dairy & Eggs', 'dairy-eggs', 'Fresh milk, cheese, butter, and eggs', 2, true, 'https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400'),
  ('11111111-1111-1111-1111-111111111003', 'Snacks & Beverages', 'snacks-beverages', 'Chips, cookies, juices, and soft drinks', 3, true, 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400'),
  ('11111111-1111-1111-1111-111111111004', 'Bakery', 'bakery', 'Fresh bread, cakes, and pastries', 4, true, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400'),
  ('11111111-1111-1111-1111-111111111005', 'Household', 'household', 'Cleaning supplies and home essentials', 5, true, 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400'),
  ('11111111-1111-1111-1111-111111111006', 'Personal Care', 'personal-care', 'Skincare, haircare, and hygiene products', 6, true, 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400'),
  ('11111111-1111-1111-1111-111111111007', 'Baby Care', 'baby-care', 'Diapers, baby food, and essentials', 7, true, 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400'),
  ('11111111-1111-1111-1111-111111111008', 'Meat & Seafood', 'meat-seafood', 'Fresh chicken, fish, and meat products', 8, true, 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400');

-- 2. Insert Test Vendor linked to existing user
INSERT INTO public.vendors (id, user_id, business_name, status, store_address, rating, is_accepting_orders) VALUES
  ('22222222-2222-2222-2222-222222222001', '90623e07-79c1-49ec-9f83-2776abe3b072', 'Ahmed Mart Store', 'active', '123 Main Street, Mumbai, Maharashtra 400001', 4.5, true);

-- 3. Add vendor role to the user
INSERT INTO public.user_roles (user_id, role) VALUES 
  ('90623e07-79c1-49ec-9f83-2776abe3b072', 'vendor')
ON CONFLICT DO NOTHING;

-- 4. Insert Sample Products
INSERT INTO public.products (id, vendor_id, category_id, name, slug, description, brand, sku, mrp, selling_price, discount_percentage, stock_quantity, unit_value, unit_type, primary_image_url, status, is_featured, is_trending, rating, total_reviews) VALUES
  -- Fruits & Vegetables
  ('33333333-3333-3333-3333-333333333001', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111001', 'Fresh Bananas', 'fresh-bananas', 'Sweet and ripe bananas, perfect for breakfast', 'Local Farm', 'FV-BAN-001', 60.00, 49.00, 18, 100, 1, 'dozen', 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=400', 'active', true, false, 4.3, 156),
  ('33333333-3333-3333-3333-333333333002', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111001', 'Red Apples', 'red-apples', 'Crispy and juicy red apples from Himachal', 'Himachal Fresh', 'FV-APL-001', 180.00, 159.00, 12, 75, 1, 'kg', 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400', 'active', true, true, 4.5, 203),
  ('33333333-3333-3333-3333-333333333003', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111001', 'Fresh Tomatoes', 'fresh-tomatoes', 'Farm fresh tomatoes for cooking', 'Local Farm', 'FV-TOM-001', 40.00, 35.00, 13, 200, 500, 'g', 'https://images.unsplash.com/photo-1546470427-227c7c84e88f?w=400', 'active', false, true, 4.2, 89),
  ('33333333-3333-3333-3333-333333333004', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111001', 'Green Spinach', 'green-spinach', 'Fresh organic spinach leaves', 'Organic Valley', 'FV-SPN-001', 30.00, 25.00, 17, 150, 250, 'g', 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400', 'active', false, false, 4.0, 67),

  -- Dairy & Eggs
  ('33333333-3333-3333-3333-333333333005', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111002', 'Amul Toned Milk', 'amul-toned-milk', 'Fresh toned milk from Amul', 'Amul', 'DA-MLK-001', 28.00, 27.00, 4, 500, 500, 'ml', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400', 'active', true, true, 4.6, 412),
  ('33333333-3333-3333-3333-333333333006', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111002', 'Farm Fresh Eggs', 'farm-fresh-eggs', 'Brown eggs from free-range chickens', 'Happy Hens', 'DA-EGG-001', 90.00, 79.00, 12, 80, 6, 'piece', 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400', 'active', true, false, 4.4, 234),
  ('33333333-3333-3333-3333-333333333007', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111002', 'Amul Butter', 'amul-butter', 'Creamy salted butter', 'Amul', 'DA-BUT-001', 56.00, 54.00, 4, 120, 100, 'g', 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400', 'active', false, true, 4.7, 189),

  -- Snacks & Beverages
  ('33333333-3333-3333-3333-333333333008', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111003', 'Lays Classic Chips', 'lays-classic-chips', 'Classic salted potato chips', 'Lays', 'SN-LAY-001', 20.00, 20.00, 0, 200, 52, 'g', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400', 'active', false, true, 4.3, 567),
  ('33333333-3333-3333-3333-333333333009', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111003', 'Coca Cola', 'coca-cola', 'Refreshing cola drink', 'Coca Cola', 'SN-COL-001', 45.00, 40.00, 11, 300, 750, 'ml', 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400', 'active', true, true, 4.5, 789),
  ('33333333-3333-3333-3333-333333333010', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111003', 'Oreo Cookies', 'oreo-cookies', 'Chocolate sandwich cookies with cream filling', 'Cadbury', 'SN-ORE-001', 35.00, 30.00, 14, 180, 120, 'g', 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400', 'active', true, false, 4.6, 456),

  -- Bakery
  ('33333333-3333-3333-3333-333333333011', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111004', 'Whole Wheat Bread', 'whole-wheat-bread', 'Freshly baked whole wheat bread', 'Harvest Gold', 'BK-BRD-001', 45.00, 42.00, 7, 50, 400, 'g', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400', 'active', true, false, 4.2, 123),
  ('33333333-3333-3333-3333-333333333012', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111004', 'Butter Croissant', 'butter-croissant', 'Flaky butter croissant', 'Theobroma', 'BK-CRO-001', 85.00, 75.00, 12, 30, 1, 'piece', 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400', 'active', false, true, 4.4, 87),

  -- Household
  ('33333333-3333-3333-3333-333333333013', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111005', 'Vim Dishwash Gel', 'vim-dishwash-gel', 'Powerful dishwashing gel with lemon', 'Vim', 'HH-VIM-001', 125.00, 110.00, 12, 100, 500, 'ml', 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400', 'active', false, false, 4.1, 234),
  ('33333333-3333-3333-3333-333333333014', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111005', 'Surf Excel Detergent', 'surf-excel-detergent', 'Powerful stain remover detergent', 'Surf Excel', 'HH-SRF-001', 299.00, 275.00, 8, 80, 1, 'kg', 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400', 'active', true, false, 4.5, 345),

  -- Personal Care
  ('33333333-3333-3333-3333-333333333015', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111006', 'Dove Soap', 'dove-soap', 'Moisturizing beauty bar', 'Dove', 'PC-DOV-001', 55.00, 48.00, 13, 150, 100, 'g', 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=400', 'active', false, true, 4.3, 567),
  ('33333333-3333-3333-3333-333333333016', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111006', 'Colgate Toothpaste', 'colgate-toothpaste', 'Cavity protection toothpaste', 'Colgate', 'PC-CLG-001', 99.00, 89.00, 10, 200, 200, 'g', 'https://images.unsplash.com/photo-1628359355624-855775b5c9c4?w=400', 'active', true, false, 4.6, 678),

  -- Baby Care
  ('33333333-3333-3333-3333-333333333017', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111007', 'Pampers Diapers', 'pampers-diapers', 'Soft and absorbent baby diapers', 'Pampers', 'BC-PMP-001', 799.00, 699.00, 13, 40, 1, 'pack', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400', 'active', true, true, 4.7, 234),
  ('33333333-3333-3333-3333-333333333018', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111007', 'Cerelac Baby Food', 'cerelac-baby-food', 'Nutritious baby cereal', 'Nestle', 'BC-CER-001', 399.00, 365.00, 9, 60, 300, 'g', 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=400', 'active', false, false, 4.5, 123),

  -- Meat & Seafood
  ('33333333-3333-3333-3333-333333333019', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111008', 'Fresh Chicken Breast', 'fresh-chicken-breast', 'Boneless chicken breast, cleaned and cut', 'FreshMeat', 'MS-CHK-001', 350.00, 320.00, 9, 50, 500, 'g', 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400', 'active', true, true, 4.4, 189),
  ('33333333-3333-3333-3333-333333333020', '22222222-2222-2222-2222-222222222001', '11111111-1111-1111-1111-111111111008', 'Fresh Fish Fillet', 'fresh-fish-fillet', 'Boneless fish fillet, ready to cook', 'SeaFresh', 'MS-FSH-001', 450.00, 399.00, 11, 30, 500, 'g', 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400', 'active', false, true, 4.3, 145);