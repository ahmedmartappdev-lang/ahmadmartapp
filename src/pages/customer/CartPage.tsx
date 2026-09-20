import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Minus, ShieldCheck, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useTrendingProducts } from '@/hooks/useProducts';
import { useAuthStore } from '@/stores/authStore';
import { useAddresses } from '@/hooks/useAddresses';
import { useDeliveryFeeConfig, computeDeliveryFee } from '@/hooks/useDeliveryFeeConfig';
import { Button } from '@/components/ui/button';
import { BottomNavigation } from '@/components/customer/BottomNavigation';
import { toast } from 'sonner';

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { items, incrementQuantity, decrementQuantity, getTotalAmount, getDeliveryFee, addItem } = useCartStore();
  const { data: upsellProducts } = useTrendingProducts();
  const { addresses, defaultAddress: userDefaultAddress } = useAddresses();
  const { data: feeConfig } = useDeliveryFeeConfig();

  // Stock-based unavailability is gone — products are only "out" if admin sets status.
  // Cart items are always counted in totals; if admin deactivates a product later,
  // they vanish from search/categories but stay in cart until customer clears.
  const activeItemCount = items.length;
  const itemTotal = getTotalAmount();
  // Use the same shared fee formula as CheckoutPage so the bill doesn't
  // change between the two screens (admin's saved delivery_fee_config
  // and the static cartStore fee disagreed before).
  const fees = feeConfig
    ? computeDeliveryFee(feeConfig, itemTotal)
    : { deliveryFee: getDeliveryFee(), platformFee: 5, smallOrderFee: 0, surgeApplied: false, surgeLabel: '' };
  const deliveryFee = itemTotal > 0 ? fees.deliveryFee : 0;
  const handlingFee = itemTotal > 0 ? fees.platformFee : 0;
  const smallOrderFee = itemTotal > 0 ? fees.smallOrderFee : 0;
  const gst = itemTotal > 0 ? handlingFee * 0.18 : 0;
  const grandTotal = itemTotal + deliveryFee + handlingFee + smallOrderFee + gst;

  // MRP total uses max(mrp, selling_price) so the "Items" line never
  // shows less than the actual itemTotal even if admin set a selling
  // price above MRP (no constraint blocks that — see audit #9).
  const mrpTotal = items.reduce(
    (acc, item) => acc + Math.max(item.mrp, item.selling_price) * item.quantity,
    0,
  );
  const totalSavings = Math.max(0, mrpTotal - itemTotal);

  // Prefer the user's marked-default address; fall back to first in list.
  const defaultAddress = userDefaultAddress || addresses?.[0];
  const addressLine = defaultAddress
    ? [defaultAddress.address_line1, defaultAddress.city].filter(Boolean).join(', ')
    : null;

  const handleUpsellAdd = (product: any) => {
    if (product.status === 'out_of_stock') {
      toast.error('This product is currently unavailable');
      return;
    }
    addItem({
      id: product.id,
      product_id: product.id,
      name: product.name,
      image_url: product.primary_image_url || '/placeholder.svg',
      unit_value: product.unit_value || 1,
      unit_type: product.unit_type,
      selling_price: product.admin_selling_price ?? product.selling_price,
      vendor_selling_price: Number(product.selling_price) || undefined,
      mrp: product.mrp,
      max_quantity: product.max_order_quantity || 10,
      vendor_id: product.vendor_id,
      vendor_name: product.vendor?.business_name || undefined,
      stock_quantity: product.stock_quantity,
    });
    toast.success('Added');
  };

  const handleCheckout = () => {
    if (!user) {
      toast.error('Please login to continue');
      navigate('/auth');
      return;
    }
    if (itemTotal === 0) {
      toast.error('Your cart has no available items.');
      return;
    }
    navigate('/checkout');
  };

  // ─── Empty state ───
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="hidden md:flex bg-white px-6 py-5 sticky top-0 z-50 items-center">
          <button onClick={() => navigate(-1)} className="mr-4 -ml-1 p-1 rounded-full hover:bg-gray-50">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Cart</h1>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-28 md:pb-6">
          <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mb-6">
            <ShoppingBag className="w-9 h-9 text-gray-300" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-1.5 tracking-tight">Your cart is empty</h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-[280px] leading-relaxed">
            Add a few essentials and we'll have them on the way in minutes.
          </p>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-12 px-10 rounded-full text-sm shadow-sm"
            onClick={() => navigate('/')}
          >
            Start shopping
          </Button>
        </div>
        <BottomNavigation />
      </div>
    );
  }

  // ─── Filled cart ───
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header — same on mobile and desktop, light */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-50">
        <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate(-1)} className="-ml-2 p-2 rounded-full hover:bg-gray-50">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base md:text-lg font-semibold tracking-tight">Cart</h1>
              <p className="text-[11px] text-muted-foreground">{activeItemCount} item{activeItemCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-4 md:px-6 pt-4 pb-[220px] lg:pb-10 flex flex-col lg:flex-row gap-8 lg:gap-12">

        {/* LEFT — Items + extras */}
        <div className="flex-1 min-w-0 space-y-8">

          {/* Delivery line — inline, no card */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-gray-50">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-0.5">Deliver to</p>
              <p className="text-sm font-medium truncate">{addressLine || 'No address selected'}</p>
            </div>
            <button
              className="text-xs font-semibold text-primary h-9 px-4 rounded-full hover:bg-primary/5 transition-colors shrink-0"
              onClick={() => navigate('/addresses')}
            >
              {addresses && addresses.length > 0 ? 'Change' : 'Add'}
            </button>
          </div>

          {/* Items — flat divider list, no outer card */}
          <ul className="divide-y divide-gray-100">
            {items.map((item) => {
              // OOS = stock_quantity tracked on the cart item and <= 0.
              // Lets the customer see what won't actually come through
              // checkout before they hit Place Order.
              const isOOS = typeof item.stock_quantity === 'number' && item.stock_quantity <= 0;
              return (
                <li key={item.id} className={`flex items-start gap-4 py-5 ${isOOS ? 'opacity-50' : ''}`}>
                  <div className="relative shrink-0">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-[68px] h-[68px] md:w-[80px] md:h-[80px] object-contain rounded-xl bg-[#f9f9f9]"
                    />
                    {isOOS && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
                        <span className="text-[9px] font-bold uppercase text-destructive tracking-wider">OOS</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{item.name}</p>
                    {item.vendor_name && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        Sold by <span className="font-medium">{item.vendor_name}</span>
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {item.unit_value ? `${item.unit_value} ${item.unit_type}` : '1 unit'}
                    </p>
                    {!isOOS && (
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-[15px] font-semibold tracking-tight">₹{item.selling_price}</span>
                        {item.mrp > item.selling_price && (
                          <span className="text-[11px] text-muted-foreground line-through">₹{item.mrp}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center border border-gray-200 rounded-full h-9 overflow-hidden">
                      <button
                        className="w-8 h-full flex items-center justify-center text-foreground hover:bg-gray-50 transition-colors disabled:opacity-30"
                        onClick={() => decrementQuantity(item.id)}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-semibold text-[13px]">{item.quantity}</span>
                      <button
                        className="w-8 h-full flex items-center justify-center text-foreground hover:bg-gray-50 transition-colors disabled:opacity-30"
                        onClick={() => incrementQuantity(item.id)}
                        disabled={isOOS}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">
                      {isOOS ? '—' : `₹${(item.selling_price * item.quantity).toFixed(2)}`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Bill summary — mobile + tablet (desktop has it in the right column) */}
          <div className="lg:hidden pt-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">Bill summary</p>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Items ({activeItemCount})</dt>
                <dd className="tabular-nums">₹{mrpTotal.toFixed(2)}</dd>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between text-primary">
                  <dt>Discount</dt>
                  <dd className="tabular-nums">− ₹{totalSavings.toFixed(2)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery fee</dt>
                <dd className={`tabular-nums ${deliveryFee === 0 ? 'text-primary font-semibold' : ''}`}>
                  {deliveryFee === 0 ? 'Free' : `₹${deliveryFee}`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Packaging fee</dt>
                <dd className="tabular-nums">₹{handlingFee.toFixed(2)}</dd>
              </div>
              {smallOrderFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Small order fee</dt>
                  <dd className="tabular-nums">₹{smallOrderFee.toFixed(2)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">GST &amp; charges</dt>
                <dd className="tabular-nums">₹{gst.toFixed(2)}</dd>
              </div>
            </dl>
            <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-xl font-bold tracking-tight tabular-nums">₹{grandTotal.toFixed(2)}</span>
            </div>
            {totalSavings > 0 && (
              <p className="text-[12px] text-primary font-medium mt-2">You're saving ₹{totalSavings.toFixed(2)} on this order</p>
            )}
          </div>

          {/* Desktop checkout CTA inside left column */}
          <div className="hidden lg:flex justify-end pt-2">
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm h-12 px-10 rounded-full shadow-sm"
              onClick={handleCheckout}
              disabled={itemTotal === 0}
            >
              Continue to checkout
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>

          {/* Upsell — ghost section, no card frame */}
          {upsellProducts && upsellProducts.length > 0 && (
            <section className="pt-4">
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">More for you</h3>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 no-scrollbar">
                {upsellProducts.slice(0, 8).map((product) => {
                  const isOOS = product.status === 'out_of_stock';
                  const price = product.admin_selling_price ?? product.selling_price;
                  return (
                    <div key={product.id} className={`min-w-[120px] w-[120px] shrink-0 ${isOOS ? 'opacity-50' : ''}`}>
                      <div className="relative">
                        <img
                          src={product.primary_image_url || '/placeholder.svg'}
                          alt={product.name}
                          className="w-full h-[110px] object-contain bg-[#f9f9f9] rounded-xl"
                        />
                        {!isOOS && (
                          <button
                            onClick={() => handleUpsellAdd(product)}
                            className="absolute -bottom-3 right-2 w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors shadow-sm"
                            aria-label="Add"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        )}
                      </div>
                      <p className="text-[12px] font-medium leading-snug mt-3 line-clamp-2 min-h-[2.6em]">{product.name}</p>
                      <p className="text-[12px] font-semibold mt-0.5">
                        {isOOS ? <span className="text-destructive uppercase text-[10px]">Out of stock</span> : `₹${price}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT — Sticky bill, desktop only */}
        <aside className="hidden lg:block w-[340px] shrink-0">
          <div className="sticky top-[80px] space-y-5">
            <div>
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-4">Bill summary</h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Items ({activeItemCount})</dt>
                  <dd className="tabular-nums">₹{(itemTotal + totalSavings).toFixed(2)}</dd>
                </div>
                {totalSavings > 0 && (
                  <div className="flex justify-between text-primary">
                    <dt>Discount</dt>
                    <dd className="tabular-nums">− ₹{totalSavings.toFixed(2)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className={`tabular-nums ${deliveryFee === 0 ? 'text-primary font-semibold' : ''}`}>
                    {deliveryFee === 0 ? 'Free' : `₹${deliveryFee}`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Handling</dt>
                  <dd className="tabular-nums">₹{handlingFee.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST</dt>
                  <dd className="tabular-nums">₹{gst.toFixed(2)}</dd>
                </div>
              </dl>
              <div className="flex justify-between items-baseline mt-5 pt-4 border-t border-gray-100">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-2xl font-bold tracking-tight tabular-nums">₹{grandTotal.toFixed(2)}</span>
              </div>
              {totalSavings > 0 && (
                <p className="text-[12px] text-primary font-medium mt-2">You're saving ₹{totalSavings.toFixed(2)} on this order</p>
              )}
            </div>

            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
              <span>Safe payments · Easy returns · 100% authentic</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile sticky checkout */}
      <div className="lg:hidden fixed bottom-[60px] left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.02),0_-8px_24px_rgba(0,0,0,0.06)] z-[55]">
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold leading-none mb-1">To pay</p>
            <p className="text-xl font-bold tracking-tight tabular-nums leading-none">₹{grandTotal.toFixed(2)}</p>
            {totalSavings > 0 && (
              <p className="text-[10px] text-primary font-medium mt-1">Saving ₹{totalSavings.toFixed(2)}</p>
            )}
          </div>
          <Button
            className="flex-1 max-w-[210px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm h-12 rounded-full shadow-sm"
            onClick={handleCheckout}
            disabled={itemTotal === 0}
          >
            Checkout
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default CartPage;
