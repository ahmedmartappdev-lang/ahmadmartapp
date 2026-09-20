import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useCartStore, CartItem } from '@/stores/cartStore';
import { toast } from 'sonner';
import { useDeliveryFeeConfig, computeDeliveryFee } from '@/hooks/useDeliveryFeeConfig';
import type { Address } from './useAddresses';

// ... (keep the OrderInput interface and generateOrderNumber function) ...
interface OrderInput {
  address: Address;
  paymentMethod: 'cash' | 'upi' | 'credit' | 'online';
  customerNotes?: string;
  creditUsed?: number;
}

export interface OnlineOrderInitResult {
  razorpay_order_id: string;
  key_id: string;
  amount: number; // paise
  currency: string;
  order_ids: string[];
  order_numbers: string[];
}

interface OnlineOrderInput {
  address: Address;
  customerNotes?: string;
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AM${timestamp}${random}`;
}

export function useOrders() {
  const { user } = useAuthStore();
  const { items, getDeliveryFee, clearCart } = useCartStore();
  const queryClient = useQueryClient();
  const { data: feeConfig } = useDeliveryFeeConfig();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      // FIX: Query the orders and deeply nest the order_items.
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*),
          vendor:vendors(business_name)
        `)
        .eq('customer_id', user.id)
        .order('placed_at', { ascending: false });
      
      if (error) {
        console.error("Error fetching orders:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  useRealtimeInvalidation({
    table: 'orders',
    filter: `customer_id=eq.${user?.id}`,
    queryKeys: [['orders', user?.id || '']],
    enabled: !!user?.id,
  });

  const createOrder = useMutation({
    mutationFn: async ({ address, paymentMethod, customerNotes, creditUsed = 0 }: OrderInput) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const activeItems = items.filter(item => !(item.stock_quantity !== undefined && item.stock_quantity <= 0));
      if (activeItems.length === 0) throw new Error('Cart has no available items to order.');

      // Group items by vendor
      const vendorGroups: Record<string, CartItem[]> = {};
      activeItems.forEach((item: CartItem) => {
        const vid = item.vendor_id || 'unassigned';
        if (!vendorGroups[vid]) vendorGroups[vid] = [];
        vendorGroups[vid].push(item);
      });

      const globalSubtotal = activeItems.reduce((sum, i) => sum + i.selling_price * i.quantity, 0);
      const globalFees = feeConfig
        ? computeDeliveryFee(feeConfig, globalSubtotal)
        : { deliveryFee: getDeliveryFee(), platformFee: 5, smallOrderFee: 0 };

      const deliveryAddress = {
        address_type: address.address_type,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      };

      // Build vendor groups payload for RPC
      const vendorGroupsPayload = Object.entries(vendorGroups).map(([vendorId, vendorItems]) => {
        const actualVendorId = vendorId === 'unassigned'
          ? Object.keys(vendorGroups).find(v => v !== 'unassigned') || vendorId
          : vendorId;
        return {
          vendor_id: actualVendorId,
          items: vendorItems.map((item: CartItem) => ({
            product_id: item.product_id,
            product_snapshot: {
              id: item.product_id,
              name: item.name,
              image_url: item.image_url,
              unit_value: item.unit_value,
              unit_type: item.unit_type,
              selling_price: item.selling_price,
              // Don't fall back to admin selling_price — that was the bug.
              // RPC overwrites this from products.selling_price authoritatively.
              vendor_selling_price: item.vendor_selling_price ?? null,
              mrp: item.mrp,
              vendor_name: item.vendor_name,
            },
            quantity: item.quantity,
            unit_price: item.selling_price,
            mrp: item.mrp || item.selling_price,
            discount_amount: Math.max(0, (item.mrp || item.selling_price) - item.selling_price) * item.quantity,
            total_price: item.selling_price * item.quantity,
          })),
        };
      });

      // All paths (cash / credit) go through the RPC now so stock deduction,
      // catalog price validation, and credit debit all happen atomically.
      const { data, error } = await supabase.rpc('place_customer_order_with_credit', {
        p_vendor_groups: vendorGroupsPayload as any,
        p_delivery_address: deliveryAddress as any,
        p_delivery_latitude: address.latitude || null,
        p_delivery_longitude: address.longitude || null,
        p_payment_method: paymentMethod,
        p_customer_notes: customerNotes || null,
        p_credit_used: creditUsed,
        p_delivery_fee: globalFees.deliveryFee,
        p_platform_fee: globalFees.platformFee,
        p_small_order_fee: globalFees.smallOrderFee,
      });

      if (error) throw error;

      const ordersCreated = data as any[];
      if (!ordersCreated?.length) throw new Error('Order creation returned empty');
      if (ordersCreated.length === 1) return ordersCreated[0];
      return { ...ordersCreated[0], order_number: ordersCreated.map((o: any) => o.order_number).join(', ') };
    },
    onSuccess: (order) => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-credit-balance', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-credit-history', user?.id] });
      toast.success('Order placed successfully!');
      return order;
    },
    onError: (error: any) => {
      const message = error?.message || error?.details || error?.hint || 'Failed to place order. Please try again.';
      toast.error(message);
      console.error('Create order error:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        error,
      });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async (orderId: string) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Single RPC handles: status flip, stock restore, credit refund + txn log.
      const { data, error } = await supabase.rpc('cancel_customer_order', {
        p_order_id: orderId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-credit-balance', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['customer-credit-history', user?.id] });
      toast.success('Order cancelled successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to cancel order.');
    },
  });

  const createOnlineOrder = useMutation({
    mutationFn: async ({ address, customerNotes }: OnlineOrderInput): Promise<OnlineOrderInitResult> => {
      if (!user?.id) throw new Error('User not authenticated');

      const activeItems = items.filter(item => !(item.stock_quantity !== undefined && item.stock_quantity <= 0));
      if (activeItems.length === 0) throw new Error('Cart has no available items to order.');

      const vendorGroups: Record<string, CartItem[]> = {};
      activeItems.forEach((item: CartItem) => {
        const vid = item.vendor_id || 'unassigned';
        if (!vendorGroups[vid]) vendorGroups[vid] = [];
        vendorGroups[vid].push(item);
      });

      const globalSubtotal = activeItems.reduce((sum, i) => sum + i.selling_price * i.quantity, 0);
      const globalFees = feeConfig
        ? computeDeliveryFee(feeConfig, globalSubtotal)
        : { deliveryFee: getDeliveryFee(), platformFee: 5, smallOrderFee: 0 };

      const deliveryAddress = {
        address_type: address.address_type,
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      };

      const vendorGroupsPayload = Object.entries(vendorGroups).map(([vendorId, vendorItems]) => {
        const actualVendorId = vendorId === 'unassigned'
          ? Object.keys(vendorGroups).find(v => v !== 'unassigned') || vendorId
          : vendorId;
        return {
          vendor_id: actualVendorId,
          items: vendorItems.map((item: CartItem) => ({
            product_id: item.product_id,
            product_snapshot: {
              id: item.product_id,
              name: item.name,
              image_url: item.image_url,
              unit_value: item.unit_value,
              unit_type: item.unit_type,
              selling_price: item.selling_price,
              // Don't fall back to admin selling_price — that was the bug.
              // RPC overwrites this from products.selling_price authoritatively.
              vendor_selling_price: item.vendor_selling_price ?? null,
              mrp: item.mrp,
              vendor_name: item.vendor_name,
            },
            quantity: item.quantity,
            unit_price: item.selling_price,
            mrp: item.mrp || item.selling_price,
            discount_amount: Math.max(0, (item.mrp || item.selling_price) - item.selling_price) * item.quantity,
            total_price: item.selling_price * item.quantity,
          })),
        };
      });

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Your session expired. Please log in again.');

      const SUPABASE_URL = (supabase as any).supabaseUrl || 'https://otksdfphbgneusgjvjzg.supabase.co';
      const SUPABASE_KEY = (supabase as any).supabaseKey;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vendor_groups: vendorGroupsPayload,
          delivery_address: deliveryAddress,
          delivery_latitude: address.latitude || null,
          delivery_longitude: address.longitude || null,
          customer_notes: customerNotes || null,
          delivery_fee: globalFees.deliveryFee,
          platform_fee: globalFees.platformFee,
          small_order_fee: globalFees.smallOrderFee,
        }),
      });

      const responseText = await res.text();
      if (!res.ok) {
        console.error('create-razorpay-order', res.status, responseText);
        throw new Error(`[${res.status}] ${responseText || 'Payment init failed'}`);
      }
      const data = responseText ? JSON.parse(responseText) as OnlineOrderInitResult : null;
      if (!data) throw new Error('Empty response from payment gateway');
      return data;
    },
    onError: (error: any) => {
      const message = error?.message || error?.details || error?.hint || 'Failed to initialise payment.';
      toast.error(message);
      console.error('createOnlineOrder error:', error);
    },
  });

  const verifyOnlinePayment = useMutation({
    mutationFn: async (payload: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Your session expired. Please log in again.');

      const SUPABASE_URL = (supabase as any).supabaseUrl || 'https://otksdfphbgneusgjvjzg.supabase.co';
      const SUPABASE_KEY = (supabase as any).supabaseKey;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        console.error('verify-razorpay-payment', res.status, text);
        throw new Error(`[${res.status}] ${text || 'Verification failed'}`);
      }
      return text ? JSON.parse(text) : null;
    },
    onSuccess: () => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
      toast.success('Payment successful!');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Payment verification failed');
      console.error('verifyOnlinePayment error:', error);
    },
  });

  // Pay-Now-for-COD: end-to-end flow for an order that already exists.
  // Initialises a Razorpay order on the server, opens the modal, verifies
  // the signature, and the existing mark_razorpay_order_paid RPC flips
  // payment_method to 'online' and payment_status to 'completed'.
  // Does NOT clear cart (the user may be browsing while paying for an old order).
  const payExistingOrder = useMutation({
    mutationFn: async (orderId: string) => {
      const { openRazorpay } = await import('@/lib/razorpay');

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Your session expired. Please log in again.');

      const SUPABASE_URL = (supabase as any).supabaseUrl || 'https://otksdfphbgneusgjvjzg.supabase.co';
      const SUPABASE_KEY = (supabase as any).supabaseKey;

      // 1. Init razorpay order on the server
      const initRes = await fetch(`${SUPABASE_URL}/functions/v1/pay-existing-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      const initText = await initRes.text();
      if (!initRes.ok) {
        console.error('pay-existing-order', initRes.status, initText);
        throw new Error(`[${initRes.status}] ${initText || 'Payment init failed'}`);
      }
      const init = initText ? JSON.parse(initText) as OnlineOrderInitResult : null;
      if (!init) throw new Error('Empty response from payment gateway');

      // 2. Open Razorpay modal
      const rzpResp = await openRazorpay({
        key: init.key_id,
        amount: init.amount,
        currency: init.currency,
        order_id: init.razorpay_order_id,
        name: 'Ahmed Mart',
        description: `Pay for order ${init.order_numbers.join(', ')}`,
        notes: { order_ids: init.order_ids.join(',') },
        theme: { color: '#16a34a' },
      });

      // 3. Verify
      const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rzpResp),
      });
      const verifyText = await verifyRes.text();
      if (!verifyRes.ok) {
        console.error('verify-razorpay-payment (pay-now)', verifyRes.status, verifyText);
        throw new Error(`[${verifyRes.status}] ${verifyText || 'Verification failed'}`);
      }

      return verifyText ? JSON.parse(verifyText) : null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders', user?.id] });
      toast.success('Payment successful!');
    },
    onError: (error: any) => {
      // Razorpay rejection / dismissal codes from openRazorpay
      if (error?.message === 'PAYMENT_CANCELLED') {
        toast.error('Payment cancelled. Order remains COD.');
      } else if (error?.message === 'PAYMENT_FAILED') {
        toast.error('Payment failed. Please try again.');
      } else {
        toast.error(error?.message || 'Failed to pay for order');
      }
      console.error('payExistingOrder error:', error);
    },
  });

  return { orders, isLoading, createOrder, cancelOrder, createOnlineOrder, verifyOnlinePayment, payExistingOrder };
}

// Single-order fetch by id (for opening order detail from places like
// Credit History where we only have an order_id reference). RLS already
// scopes to the customer's own orders.
export function useOrderById(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ['order', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*),
          vendor:vendors(business_name)
        `)
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
