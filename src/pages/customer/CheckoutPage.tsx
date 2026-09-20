import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Plus,
  Banknote,
  Smartphone,
  Check,
  ShoppingBag,
  Loader2,
  PartyPopper,
  Wallet,
  Building2,
  Home,
  Shield,
  Tag,
  Bell,
  DoorOpen,
  Phone,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  CreditCard,
  Info,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AddressForm } from '@/components/customer/AddressForm';
import { BottomNavigation } from '@/components/customer/BottomNavigation';
import { useAddresses, Address, AddressInput } from '@/hooks/useAddresses';
import { useOrders } from '@/hooks/useOrders';
import { useCartStore } from '@/stores/cartStore';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCustomerCredits } from '@/hooks/useCustomerCredits';
import { useDeliveryFeeConfig, computeDeliveryFee } from '@/hooks/useDeliveryFeeConfig';
import { useServiceAreas } from '@/hooks/useServiceAreas';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { openRazorpay, loadRazorpayScript } from '@/lib/razorpay';


type PaymentMethod = 'cash' | 'online' | 'credit';

const DELIVERY_INSTRUCTIONS = [
  { id: 'ring', label: 'Ring the bell', icon: Bell },
  { id: 'door', label: 'Leave at door', icon: DoorOpen },
  { id: 'call', label: 'Call me', icon: Phone },
  { id: 'guard', label: 'Guard room', icon: ShieldCheck },
];

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { user } = useAuthStore();
  const { items, getTotalAmount, getDeliveryFee, getTotalItems } = useCartStore();
  const { addresses, defaultAddress, isLoading: addressesLoading, addAddress, updateAddress } = useAddresses();
  const { availableCredit, creditLimit, dueAmount } = useCustomerCredits();
  const creditBalance = availableCredit;
  const { createOrder, createOnlineOrder, verifyOnlinePayment } = useOrders();
  const { data: feeConfig } = useDeliveryFeeConfig();
  const { isLocationServiceable } = useServiceAreas();

  // Fetch user profile name
  const { data: profile } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch app name from settings
  const { data: appNameSetting } = useQuery({
    queryKey: ['app-settings', 'app_name'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings' as any)
        .select('value')
        .eq('key', 'app_name')
        .maybeSingle();
      return (data as any)?.value || 'Ahmad Mart';
    },
    staleTime: 300000,
  });

  const appName = appNameSetting || 'Ahmad Mart';

  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedInstructions, setSelectedInstructions] = useState<string[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string;
    items: typeof items;
    address: Address;
    paymentMethod: PaymentMethod;
    total: number;
    subtotal: number;
    deliveryFee: number;
    platformFee: number;
    smallOrderFee: number;
    gst: number;
    creditUsed: number;
  } | null>(null);
  const [showAddressList, setShowAddressList] = useState(false);

  useEffect(() => {
    if (defaultAddress && !selectedAddress) {
      setSelectedAddress(defaultAddress);
    } else if (addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(addresses[0]);
    }
  }, [defaultAddress, selectedAddress, addresses]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth');
    } else if (items.length === 0 && !orderSuccess && !isPlacingOrder) {
      navigate('/cart');
    }
  }, [isAuthenticated, items.length, navigate, orderSuccess, isPlacingOrder]);

  // Preload Razorpay script so the modal opens instantly on Place Order
  useEffect(() => {
    loadRazorpayScript().catch(() => { /* swallow — we will retry on click */ });
  }, []);

  const subtotal = getTotalAmount();
  const fees = feeConfig
    ? computeDeliveryFee(feeConfig, subtotal)
    : { deliveryFee: getDeliveryFee(), platformFee: 5, surgeApplied: false, surgeLabel: '', smallOrderFee: 0 };
  const deliveryFee = fees.deliveryFee;
  const platformFee = fees.platformFee;
  const smallOrderFee = fees.smallOrderFee;
  // GST applies to service charges only (Zepto / Blinkit model). Product
  // subtotal stays untaxed — vendor MRP is GST-inclusive.
  const gstPercent = feeConfig?.gstPercent ?? 18;
  const gst = Number(((deliveryFee + platformFee + smallOrderFee) * gstPercent / 100).toFixed(2));
  const total = subtotal + deliveryFee + platformFee + smallOrderFee + gst;

  // Auto-select credit when it fully covers the bill, fall back to cash
  // when it doesn't. Pre-fix this useEffect was declared above the `total`
  // line (TDZ in dev) and had a dep list of [creditBalance] only — so it
  // never re-ran when the cart changed and `paymentMethod` stayed pinned
  // to 'credit' even after the order grew past the customer's balance,
  // failing on submit with "Insufficient credit".
  useEffect(() => {
    if (creditBalance >= total) {
      setPaymentMethod('credit');
    } else if (paymentMethod === 'credit') {
      setPaymentMethod('cash');
    }
    // paymentMethod intentionally omitted to avoid a self-trigger loop
    // when the user manually picks credit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditBalance, total]);
  const totalSavings = items.reduce((acc, item) => acc + ((item.mrp - item.selling_price) * item.quantity), 0);

  const addressHasCoords =
    selectedAddress?.latitude != null && selectedAddress?.longitude != null;
  const addressServiceable =
    !!selectedAddress &&
    addressHasCoords &&
    isLocationServiceable(selectedAddress.latitude as number, selectedAddress.longitude as number);

  const creditCoversAll = creditBalance >= total;
  const amountToPay = total; // Always full bill — no partial credit.
  const creditShortfall = Math.max(0, total - creditBalance);

  const toggleInstruction = (id: string) => {
    setSelectedInstructions(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const customerNotesFromInstructions = selectedInstructions
    .map(id => DELIVERY_INSTRUCTIONS.find(i => i.id === id)?.label)
    .filter(Boolean)
    .join(', ');

  const handleAddAddress = async (data: AddressInput) => {
    await addAddress.mutateAsync(data);
    setShowAddressForm(false);
  };

  const handleUpdateAddress = async (data: AddressInput) => {
    if (editingAddress) {
      await updateAddress.mutateAsync({ id: editingAddress.id, ...data });
      setEditingAddress(null);
      setShowAddressForm(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddress) {
      toast.error('Please select a delivery address');
      setShowAddressList(true);
      return;
    }
    if (!addressHasCoords) {
      toast.error('This address is missing a map location. Please add a new address from the map.');
      setShowAddressList(true);
      return;
    }
    if (!addressServiceable) {
      toast.error('This address is outside our delivery zone. Please pick another address.');
      setShowAddressList(true);
      return;
    }
    setIsPlacingOrder(true);
    try {
      // Full-bill, single-method only. If credit picked, it must cover total.
      if (paymentMethod === 'credit' && !creditCoversAll) {
        toast.error('Insufficient credit. Pick Cash or Online.');
        setPaymentMethod('cash');
        setIsPlacingOrder(false);
        return;
      }
      const creditUsed = paymentMethod === 'credit' ? total : 0;
      // Snapshot data before cart clears
      const snapshot = {
        items: [...items],
        address: selectedAddress!,
        paymentMethod,
        total,
        subtotal,
        deliveryFee,
        platformFee,
        smallOrderFee,
        gst,
        creditUsed,
      };

      // Online (Razorpay) flow: no credit mixing, gateway-first
      if (paymentMethod === 'online') {
        const init = await createOnlineOrder.mutateAsync({
          address: selectedAddress,
          customerNotes: customerNotesFromInstructions || undefined,
        });

        try {
          const rzpResp = await openRazorpay({
            key: init.key_id,
            amount: init.amount,
            currency: init.currency,
            order_id: init.razorpay_order_id,
            name: appName,
            description: `Order ${init.order_numbers.join(', ')}`,
            prefill: {
              name: profile?.full_name || undefined,
              contact: (user as any)?.phone || undefined,
              email: (user as any)?.email || undefined,
            },
            notes: { order_ids: init.order_ids.join(',') },
            theme: { color: '#16a34a' },
          });

          await verifyOnlinePayment.mutateAsync(rzpResp);
          setOrderSuccess({
            orderNumber: init.order_numbers.join(', '),
            ...snapshot,
          });
        } catch (modalErr: any) {
          // Cancel the pending order on the server so vendors never see it
          // and so the zombie row is marked failed immediately.
          try {
            await supabase.rpc('cancel_pending_razorpay_order', {
              p_razorpay_order_id: init.razorpay_order_id,
            });
          } catch (cancelErr) {
            console.warn('cancel_pending_razorpay_order failed:', cancelErr);
          }

          if (modalErr?.message === 'PAYMENT_CANCELLED') {
            toast.error('Payment cancelled. Your order was not placed.');
          } else if (modalErr?.message === 'PAYMENT_FAILED') {
            toast.error('Payment failed. Please try again or choose another method.');
          } else {
            toast.error(modalErr?.message || 'Payment could not be completed.');
          }
          // Don't throw — keep user on page to retry
        }
        return;
      }

      // Cash / Credit flow — unchanged
      const order = await createOrder.mutateAsync({
        address: selectedAddress,
        paymentMethod,
        customerNotes: customerNotesFromInstructions || undefined,
        creditUsed,
      });
      setOrderSuccess({ orderNumber: order.order_number, ...snapshot });
    } catch (error) {
      console.error('Order failed:', error);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // ─── Order Success Screen ───
  if (orderSuccess) {
    const ORDER_STEPS = ['Order Placed', 'Preparing', 'On the Way', 'Delivered'];
    const currentStep = 0;
    const paymentLabels: Record<PaymentMethod, string> = {
      credit: `${appName} Credit`,
      cash: 'Cash on Delivery',
      online: 'Online Payment',
    };
    const addr = orderSuccess.address;
    const fullAddress = [addr.address_line1, addr.address_line2, addr.landmark, addr.city, addr.state].filter(Boolean).join(', ') + ` - ${addr.pincode}`;

    return (
      <div className="min-h-screen bg-[#fafafa]">
        {/* Header — borderless on confirmation, the receipt provides structure below */}
        <header className="bg-[#fafafa]">
          <div className="max-w-lg mx-auto px-4 py-3 md:py-4 flex items-center gap-3">
            <button onClick={() => navigate('/')} className="-ml-2 p-2 rounded-full hover:bg-black/5 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base md:text-lg font-semibold tracking-tight">Order confirmation</h1>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pt-4 pb-10 md:pb-12 space-y-6">

          {/* Hero — quiet success moment */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center text-center pt-4 pb-2"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl scale-150"></div>
              <div className="relative w-14 h-14 bg-primary rounded-full flex items-center justify-center">
                <Check className="w-7 h-7 text-primary-foreground" strokeWidth={2.5} />
              </div>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground mt-5">Order placed</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-[320px]">
              Your order is on its way to being prepared.
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-4 font-mono tracking-wider">
              #{orderSuccess.orderNumber}
            </p>
          </motion.div>

          {/* The receipt — single seamless card, sections divided by hair lines */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          >
            {/* Status row */}
            <div className="px-5 pt-5 pb-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Order status</p>
                <span className="text-[11px] text-primary font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  25–30 mins
                </span>
              </div>
              <div className="flex items-start gap-0">
                {ORDER_STEPS.map((step, i) => (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                        i <= currentStep
                          ? "bg-primary text-primary-foreground"
                          : "bg-gray-100 text-gray-400"
                      )}>
                        {i <= currentStep
                          ? <Check className="w-3 h-3" strokeWidth={3} />
                          : <span className="text-[10px] font-semibold">{i + 1}</span>
                        }
                      </div>
                      <span className={cn(
                        "text-[10px] mt-2 text-center leading-tight px-1",
                        i <= currentStep ? "font-semibold text-foreground" : "text-muted-foreground"
                      )}>
                        {step}
                      </span>
                    </div>
                    {i < ORDER_STEPS.length - 1 && (
                      <div className={cn(
                        "h-px flex-1 mt-3 rounded-full",
                        i < currentStep ? "bg-primary" : "bg-gray-100"
                      )} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Items */}
            <div className="px-5 py-5 border-t border-gray-100">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Order summary</p>
              <ul className="divide-y divide-gray-100 -mt-1">
                {orderSuccess.items.map((item) => (
                  <li key={item.id} className="py-2.5 first:pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate">
                          {item.name}{item.unit_value && item.unit_type ? ` (${item.unit_value}${item.unit_type})` : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {item.vendor_name ? <>Sold by <span className="font-medium">{item.vendor_name}</span> · </> : null}×{item.quantity}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums shrink-0">₹{(item.selling_price * item.quantity).toFixed(2)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Total row */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-baseline justify-between">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-2xl font-bold tracking-tight tabular-nums">₹{orderSuccess.total.toFixed(2)}</span>
            </div>

            {/* Delivery + Payment grid */}
            <div className="border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              <div className="px-5 py-5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Delivery address</p>
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-gray-200 px-1.5 py-0.5 rounded">
                      {addr.address_type}
                    </span>
                    <p className="text-[12.5px] text-muted-foreground mt-2 leading-relaxed">{fullAddress}</p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-5">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Payment method</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                    {orderSuccess.paymentMethod === 'credit' ? <CreditCard className="w-4 h-4 text-primary" /> :
                     orderSuccess.paymentMethod === 'online' ? <Smartphone className="w-4 h-4 text-primary" /> :
                     <Banknote className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate">{paymentLabels[orderSuccess.paymentMethod]}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">₹{orderSuccess.total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Back to Home */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="pt-1"
          >
            <Button
              onClick={() => navigate('/')}
              className="w-full h-12 text-sm font-semibold rounded-full shadow-sm"
            >
              Back to home
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-foreground font-sans">

      {/* ─── Sticky Header ─── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-3 md:py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="-ml-2 p-2 rounded-full hover:bg-gray-50 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base md:text-lg font-semibold tracking-tight flex-1">Checkout</h1>
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="w-3.5 h-3.5" />
            <span>100% secure</span>
          </div>
        </div>
      </header>

      {/* ─── Progress Stepper ─── */}
      <div className="bg-white border-b border-gray-50">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-center gap-2.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Check className="w-2.5 h-2.5" strokeWidth={3} />
              </span>
              <span className="font-medium text-primary">Cart</span>
            </div>
            <div className="w-6 h-px bg-primary/30" />
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">2</span>
              <span className="font-semibold text-primary">Checkout</span>
            </div>
            <div className="w-6 h-px bg-gray-200" />
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-100 text-muted-foreground flex items-center justify-center text-[9px] font-bold">3</span>
              <span className="text-muted-foreground">Order placed</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-4 pb-44 lg:pb-6">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ── LEFT COLUMN ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* ── Delivery Address Card ── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="p-4">
                {selectedAddress ? (
                  <>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Deliver to</p>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{profile?.full_name || 'User'}</span>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-gray-200 px-1.5 py-0.5 rounded">
                            {selectedAddress.address_type}
                          </span>
                        </div>
                        <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                          {selectedAddress.address_line1}
                          {selectedAddress.address_line2 && `, ${selectedAddress.address_line2}`}
                          {selectedAddress.landmark && `, ${selectedAddress.landmark}`}
                          {`, ${selectedAddress.city}`} - {selectedAddress.pincode}
                        </p>
                      </div>
                      <button
                        className="shrink-0 text-xs font-semibold text-primary h-9 px-4 rounded-full border border-primary/30 hover:bg-primary/5 transition-colors"
                        onClick={() => setShowAddressList(!showAddressList)}
                      >
                        Change
                      </button>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-[11px]">
                      <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-primary font-semibold">Standard delivery</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">Arriving in 15–20 mins</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-3">No address selected</p>
                    <Button size="sm" onClick={() => setShowAddressForm(true)}>
                      <Plus className="w-4 h-4 mr-1" /> Add Address
                    </Button>
                  </div>
                )}

                {/* Address List Dropdown */}
                <AnimatePresence>
                  {showAddressList && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-3"
                    >
                      <Separator className="mb-3" />
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saved Addresses</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-primary"
                          onClick={() => { setEditingAddress(null); setShowAddressForm(true); }}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add New
                        </Button>
                      </div>
                      {addressesLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : addresses.length === 0 ? (
                        <p className="text-center py-4 text-xs text-muted-foreground">No saved addresses.</p>
                      ) : (
                        <div className="space-y-2 max-h-[240px] overflow-y-auto">
                          {addresses.map(addr => (
                            <div
                              key={addr.id}
                              className={cn(
                                "p-3 rounded-xl border text-sm cursor-pointer flex items-center justify-between transition-colors",
                                selectedAddress?.id === addr.id ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-muted/40"
                              )}
                              onClick={() => { setSelectedAddress(addr); setShowAddressList(false); }}
                            >
                              <div className="flex items-center gap-2.5 overflow-hidden">
                                {addr.address_type === 'home' ? <Home className="w-4 h-4 text-muted-foreground shrink-0" /> : <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />}
                                <div className="truncate">
                                  <span className="font-semibold capitalize">{addr.address_type}</span>
                                  <span className="text-muted-foreground ml-2">{addr.address_line1}, {addr.city}</span>
                                </div>
                              </div>
                              {selectedAddress?.id === addr.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Out-of-zone banner ── */}
            {selectedAddress && !addressServiceable && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-destructive">
                    {addressHasCoords
                      ? 'Address outside our delivery zone'
                      : 'Address missing map location'}
                  </p>
                  <p className="text-destructive/90 text-xs mt-0.5">
                    {addressHasCoords
                      ? 'We don\'t deliver here yet. Please pick a different saved address or add a new one inside our delivery area.'
                      : 'This address has no map coordinates. Please add a new address by selecting it on the map.'}
                  </p>
                </div>
              </div>
            )}

            {/* ── Delivery Instructions Chips ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Delivery instructions</p>
              <div className="flex flex-wrap gap-2">
                {DELIVERY_INSTRUCTIONS.map(inst => {
                  const Icon = inst.icon;
                  const isSelected = selectedInstructions.includes(inst.id);
                  return (
                    <button
                      key={inst.id}
                      onClick={() => toggleInstruction(inst.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3.5 h-9 rounded-full border text-xs font-medium transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-gray-200 bg-white text-muted-foreground hover:border-gray-300"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {inst.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Order Summary ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Your order</p>
                <button
                  onClick={() => navigate('/cart')}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Edit
                </button>
              </div>
              <ul className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto hide-scrollbar -my-3">
                {items.map(item => (
                  <li key={item.product_id} className="flex items-center gap-3 py-3">
                    <div className="w-12 h-12 rounded-xl bg-[#f9f9f9] overflow-hidden shrink-0">
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.vendor_name ? <>Sold by <span className="font-medium">{item.vendor_name}</span> · </> : null}
                        {item.unit_value && item.unit_type ? `${item.unit_value}${item.unit_type}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-muted-foreground">×{item.quantity}</p>
                      <p className="text-[13px] font-semibold tabular-nums">₹{(item.selling_price * item.quantity).toFixed(2)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Bill Breakdown ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">Bill summary</p>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Item total</dt>
                  <dd className="tabular-nums">₹{subtotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Delivery fee
                    {fees.surgeApplied && (
                      <span className="ml-1.5 text-[10px] text-destructive font-medium">({fees.surgeLabel})</span>
                    )}
                  </dt>
                  <dd className={`tabular-nums ${deliveryFee === 0 ? 'text-primary font-semibold' : ''}`}>
                    {deliveryFee === 0 ? 'Free' : `₹${deliveryFee}`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Platform fee</dt>
                  <dd className="tabular-nums">₹{platformFee}</dd>
                </div>
                {smallOrderFee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Small order fee</dt>
                    <dd className="tabular-nums">₹{smallOrderFee}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground" title="GST on delivery, platform and service charges. Goods are MRP-inclusive.">GST on charges ({gstPercent}%)</dt>
                  <dd className="tabular-nums">₹{gst.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-gray-100">
                <span className="text-sm font-semibold">Bill total</span>
                <span className="text-xl font-bold tracking-tight tabular-nums">₹{total.toFixed(2)}</span>
              </div>
            </div>

            {/* ── Payment Method ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">Payment method</p>
              <div className="space-y-3">

                {/* Credit Card (only if balance > 0) */}
                {creditBalance > 0 && (
                  <div
                    className={cn(
                      "rounded-2xl overflow-hidden transition-all border-2",
                      creditCoversAll ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                      paymentMethod === 'credit' && creditCoversAll ? "border-primary shadow-sm" : "border-transparent"
                    )}
                    onClick={() => { if (creditCoversAll) setPaymentMethod('credit'); }}
                  >
                    <div className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium opacity-80">{appName}</span>
                        <CreditCard className="w-5 h-5 opacity-80" />
                      </div>
                      <p className="text-lg font-bold">Available Credit</p>
                      <p className="text-2xl font-bold mt-1">₹{creditBalance.toLocaleString()}</p>
                    </div>
                    {!creditCoversAll && (
                      <div className="bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground font-medium">
                        ₹{creditShortfall.toFixed(2)} short — pay via Cash or Online instead
                      </div>
                    )}
                    {paymentMethod === 'credit' && creditCoversAll && (
                      <div className="bg-primary/10 px-4 py-2.5 text-xs text-primary font-medium">
                        Pays the full ₹{total.toFixed(2)} from your {appName} Credit
                      </div>
                    )}
                  </div>
                )}

                {/* Online (Razorpay) */}
                <div
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-colors",
                    paymentMethod === 'online' ? "border-primary bg-primary/5" : "border-gray-100 hover:border-gray-200"
                  )}
                  onClick={() => setPaymentMethod('online')}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/5">
                    <Smartphone className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold">Online payment</h4>
                    <p className="text-[11px] text-muted-foreground truncate">UPI · Cards · Netbanking · Wallets</p>
                  </div>
                  {paymentMethod === 'online' && <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={3} />}
                </div>

                {/* Cash on Delivery */}
                <div
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-colors",
                    paymentMethod === 'cash' ? "border-primary bg-primary/5" : "border-gray-100 hover:border-gray-200"
                  )}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/5">
                    <Banknote className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold">Cash on delivery</h4>
                    <p className="text-[11px] text-muted-foreground truncate">Pay when your order arrives</p>
                  </div>
                  {paymentMethod === 'cash' && <Check className="w-4 h-4 text-primary shrink-0" strokeWidth={3} />}
                </div>
              </div>
            </div>

            {/* ── Savings Badge ── */}
            {totalSavings > 0 && (
              <div className="flex items-center gap-2 px-1">
                <Tag className="w-4 h-4 text-primary shrink-0" />
                <span className="text-[13px] text-primary font-semibold">
                  You're saving ₹{totalSavings.toFixed(2)} on this order
                </span>
              </div>
            )}

            {/* ── Policy Sections ── */}
            <div className="space-y-2.5">
              <div className="flex gap-3 px-1">
                <AlertCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold mb-0.5 text-foreground">Cancellation policy</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Orders cannot be cancelled once packed for delivery. Please check items carefully.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 px-1">
                <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold mb-0.5 text-foreground">Safety information</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Our delivery partners follow strict hygiene protocols including masking and sanitization.
                  </p>
                </div>
              </div>
            </div>

            {/* Desktop Place Order */}
            <div className="hidden lg:block pt-2">
              <Button
                onClick={handlePlaceOrder}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 rounded-full text-sm shadow-sm"
                disabled={isPlacingOrder || !selectedAddress || !addressServiceable}
              >
                {isPlacingOrder ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                ) : (
                  'Place Order'
                )}
              </Button>
            </div>
          </div>

          {/* ── RIGHT COLUMN (Desktop only) ── */}
          <div className="hidden lg:block w-[380px] shrink-0">
            <div className="lg:sticky lg:top-[70px] space-y-4">

              {/* Quick Summary */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">Order summary</p>
                <ul className="divide-y divide-gray-100 max-h-[280px] overflow-y-auto hide-scrollbar -my-2.5">
                  {items.map(item => (
                    <li key={item.product_id} className="flex items-center gap-3 py-2.5">
                      <div className="w-11 h-11 rounded-xl bg-[#f9f9f9] overflow-hidden shrink-0">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {item.vendor_name ? <>Sold by <span className="font-medium">{item.vendor_name}</span> · </> : null}
                          ×{item.quantity}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums shrink-0">₹{(item.selling_price * item.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-5 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Item total</dt>
                    <dd className="tabular-nums">₹{subtotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Delivery fee</dt>
                    <dd className={`tabular-nums ${deliveryFee === 0 ? 'text-primary font-semibold' : ''}`}>
                      {deliveryFee === 0 ? 'Free' : `₹${deliveryFee}`}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Platform fee</dt>
                    <dd className="tabular-nums">₹{platformFee}</dd>
                  </div>
                  {smallOrderFee > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Small order fee</dt>
                      <dd className="tabular-nums">₹{smallOrderFee}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground" title="GST on delivery, platform and service charges. Goods are MRP-inclusive.">GST on charges ({gstPercent}%)</dt>
                    <dd className="tabular-nums">₹{gst.toFixed(2)}</dd>
                  </div>
                </dl>
                <div className="flex justify-between items-baseline mt-5 pt-4 border-t border-gray-100">
                  <span className="text-sm font-semibold">Total</span>
                  <span className="text-2xl font-bold tracking-tight tabular-nums">₹{total.toFixed(2)}</span>
                </div>
                {totalSavings > 0 && (
                  <p className="text-[12px] text-primary font-medium mt-2">You're saving ₹{totalSavings.toFixed(2)} on this order</p>
                )}
              </div>

              {/* Trust strip */}
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span>Safe &amp; secure</span>
                </div>
                <span className="text-gray-300">·</span>
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                  <span>Fresh quality</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Mobile Sticky Bottom Bar ─── */}
      <div className="lg:hidden fixed bottom-[60px] left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.02),0_-8px_24px_rgba(0,0,0,0.06)] z-40">
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold leading-none mb-1">To pay</p>
            <p className="text-xl font-bold tracking-tight tabular-nums leading-none">₹{total.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              via {paymentMethod === 'credit'
                ? `${appName} Credit`
                : paymentMethod === 'online'
                  ? 'Online payment'
                  : 'Cash on delivery'}
            </p>
          </div>
          <Button
            onClick={handlePlaceOrder}
            className="flex-1 max-w-[210px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 rounded-full text-sm shadow-sm"
            disabled={isPlacingOrder || !selectedAddress || !addressServiceable}
          >
            {isPlacingOrder ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Placing...</>
            ) : (
              'Place order'
            )}
          </Button>
        </div>
      </div>

      {/* Bottom Navigation (mobile) */}
      <BottomNavigation />

      <AddressForm
        open={showAddressForm}
        onOpenChange={(open) => {
          setShowAddressForm(open);
          if (!open) setEditingAddress(null);
        }}
        onSubmit={editingAddress ? handleUpdateAddress : handleAddAddress}
        initialData={editingAddress}
        isLoading={addAddress.isPending || updateAddress.isPending}
      />
    </div>
  );
};

export default CheckoutPage;
