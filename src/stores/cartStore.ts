import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';

export interface CartItem {
  id: string; // unique key: product_id or product_id:variant_id
  product_id: string;
  variant_id?: string;
  name: string;
  image_url: string;
  unit_value: number;
  unit_type: string;
  selling_price: number;          // effective price (admin override if set, else vendor's). Customer pays this.
  vendor_selling_price?: number;  // vendor's raw price, snapshotted so vendor totals don't include the admin markup
  mrp: number;
  quantity: number;
  max_quantity: number;
  vendor_id: string;
  vendor_name?: string;
  stock_quantity?: number; // Added to track out of stock
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  incrementQuantity: (productId: string) => Promise<void>;
  decrementQuantity: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  fetchCart: () => Promise<void>; // Sync from DB
  getItemQuantity: (productId: string) => number;
  getTotalAmount: () => number;
  getTotalItems: () => number;
  getDeliveryFee: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      fetchCart: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('cart_items')
          .select('quantity, product_id, products(*, vendors(business_name))')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching cart:', error);
          return;
        }

        if (data) {
          const mappedItems: CartItem[] = data.map((item: any) => ({
            id: item.products.id,
            product_id: item.products.id,
            name: item.products.name,
            image_url: item.products.primary_image_url || '/placeholder.svg',
            unit_value: item.products.unit_value || 1,
            unit_type: item.products.unit_type || 'piece',
            selling_price: item.products.admin_selling_price ?? item.products.selling_price,
            vendor_selling_price: item.products.selling_price,
            mrp: item.products.mrp,
            quantity: item.quantity,
            max_quantity: item.products.max_order_quantity || 10,
            vendor_id: item.products.vendor_id,
            vendor_name: item.products.vendors?.business_name || undefined,
            stock_quantity: item.products.stock_quantity,
          }));
          set({ items: mappedItems });
        }
      },

      addItem: async (item) => {
        const cartKey = item.id;
        
        // Optimistic UI Update
        set((state) => {
          const existingItem = state.items.find((i) => i.id === cartKey);
          if (existingItem) {
            return {
              items: state.items.map((i) =>
                i.id === cartKey
                  ? { ...i, quantity: Math.min(i.quantity + 1, i.max_quantity || 10) }
                  : i
              ),
            };
          }
          // Ensure we store product_id safely in local state too
          return { items: [...state.items, { ...item, product_id: item.product_id || item.id, quantity: 1 }] };
        });

        // DB Update
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const currentItem = get().items.find(i => i.id === cartKey);
          if (currentItem) {
            const { error } = await supabase.from('cart_items').upsert(
              {
                user_id: user.id,
                // FIX: Fallback to item.id if product_id is missing to prevent constraint error
                product_id: item.product_id || item.id, 
                quantity: currentItem.quantity
              },
              { onConflict: 'user_id,product_id' }
            );
            if (error) console.error('Error syncing add item:', error);
          }
        }
      },

      removeItem: async (cartKey) => {
        const item = get().items.find((i) => i.id === cartKey);
        set((state) => ({
          items: state.items.filter((i) => i.id !== cartKey),
        }));

        if (item) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { error } = await supabase
              .from('cart_items')
              .delete()
              .eq('user_id', user.id)
              // Ensure we use the exact product_id it was stored with
              .eq('product_id', item.product_id || item.id);
            if (error) console.error('Error syncing remove item:', error);
          }
        }
      },

      updateQuantity: async (cartKey, quantity) => {
        if (quantity <= 0) {
          await get().removeItem(cartKey);
          return;
        }

        const item = get().items.find((i) => i.id === cartKey);
        set((state) => ({
          items: state.items.map((i) =>
            i.id === cartKey
              ? { ...i, quantity: Math.min(quantity, i.max_quantity || 10) }
              : i
          ),
        }));

        if (item) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { error } = await supabase
              .from('cart_items')
              .update({ quantity: quantity })
              .eq('user_id', user.id)
              .eq('product_id', item.product_id || item.id);
            if (error) console.error('Error syncing update quantity:', error);
          }
        }
      },

      incrementQuantity: async (cartKey) => {
        const item = get().items.find((i) => i.id === cartKey);
        // Default max_quantity to 10 if undefined
        const maxQ = item?.max_quantity || 10;
        if (item && item.quantity < maxQ) {
          await get().updateQuantity(cartKey, item.quantity + 1);
        }
      },

      decrementQuantity: async (cartKey) => {
        const item = get().items.find((i) => i.id === cartKey);
        if (item) {
           await get().updateQuantity(cartKey, item.quantity - 1);
        }
      },

      clearCart: async () => {
        set({ items: [] });
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('user_id', user.id);
          if (error) console.error('Error clearing cart:', error);
        }
      },

      getItemQuantity: (cartKey) => {
        return get().items.find((i) => i.id === cartKey)?.quantity || 0;
      },

      getTotalAmount: () => {
        return get().items.reduce(
          (total, item) => total + item.selling_price * item.quantity,
          0,
        );
      },

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },

      getDeliveryFee: () => {
        const total = get().getTotalAmount();
        if (total === 0) return 0; // Don't charge delivery if there are no valid active items
        return total >= 199 ? 0 : 29;
      },
    }),
    {
      name: 'ahmed-mart-cart',
    }
  )
);
