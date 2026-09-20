export type AppRole = 'customer' | 'vendor' | 'delivery_partner' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'blocked';
export type VendorStatus = 'pending' | 'active' | 'inactive' | 'suspended';
export type DeliveryStatus = 'offline' | 'available' | 'busy' | 'on_break';
export type VehicleType = 'bicycle' | 'bike' | 'scooter' | 'car';
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock' | 'discontinued';
export type UnitType = 'kg' | 'g' | 'l' | 'ml' | 'piece' | 'pack' | 'dozen';
export type OrderStatus = 
  | 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup'
  | 'assigned_to_delivery' | 'picked_up' | 'out_for_delivery'
  | 'delivered' | 'cancelled' | 'refunded';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'wallet' | 'credit';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Profile {
  id: string;
  user_id: string;
  phone: string | null;
  full_name: string;
  status: UserStatus;
  profile_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  icon_url: string | null;
  display_order: number;
  is_active: boolean;
}

export interface ProductVariant {
  id: string;
  label: string;        // e.g. "250g", "500ml", "Pack of 6"
  unit_value: number;
  unit_type: UnitType;
  mrp: number;
  selling_price: number;
  admin_selling_price?: number | null;  // override; falls back to product's admin_selling_price
  stock_quantity: number;
}

export interface Product {
  id: string;
  vendor_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  sku: string;
  mrp: number;
  selling_price: number;
  admin_selling_price: number | null;
  discount_percentage: number;
  stock_quantity: number;
  min_order_quantity: number;
  max_order_quantity: number;
  unit_value: number | null;
  unit_type: UnitType;
  primary_image_url: string | null;
  image_urls: string[] | null;
  status: ProductStatus;
  is_featured: boolean;
  is_trending: boolean;
  rating: number;
  total_reviews: number;
  variants?: ProductVariant[] | any;
  category?: Category;
  vendor?: Vendor;
}

export interface Vendor {
  id: string;
  user_id: string;
  business_name: string;
  status: VendorStatus;
  rating: number;
  store_address: string | null;
  is_accepting_orders: boolean;
}

export interface UserAddress {
  id: string;
  user_id: string;
  address_type: string;
  address_line1: string;
  address_line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  vendor_id: string;
  delivery_partner_id: string | null;
  delivery_address: UserAddress;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  discount_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  customer_notes: string | null;
  placed_at: string;
  estimated_delivery_time: string | null;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_snapshot: Product;
  quantity: number;
  unit_price: number;
  mrp: number;
  discount_amount: number;
  total_price: number;
}
