import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerLayout } from '@/components/layouts/CustomerLayout';
import { useOrders } from '@/hooks/useOrders';
import { useCustomerCredits } from '@/hooks/useCustomerCredits';
import { useCartStore } from '@/stores/cartStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { OrderDetailsDialog } from '@/components/customer/OrderDetailsDialog';
import { ReviewDialog } from '@/components/customer/ReviewDialog';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<any>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);
  
  // Backend Hooks
  const { orders, isLoading: isOrdersLoading, cancelOrder, payExistingOrder } = useOrders();
  const { user } = useAuthStore();

  // The customer's own store ratings, keyed by order — so a rated order shows
  // the stars they gave instead of the Rate Order button.
  const { data: myRatings } = useQuery({
    queryKey: ['my-order-ratings', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('reviews')
        .select('order_id, rating')
        .eq('customer_id', user!.id)
        .eq('review_type', 'vendor');
      const byOrder = new Map<string, number>();
      for (const r of (data || []) as Array<{ order_id: string; rating: number }>) {
        byOrder.set(r.order_id, r.rating);
      }
      return byOrder;
    },
  });

  // Pay-now also covers failed/pending online orders so the customer can
  // retry payment without losing the order. Previously this was gated to
  // payment_method='cash' only, stranding any failed-online-checkout.
  const isPayNowEligible = (order: any) =>
    order?.payment_status !== 'completed' &&
    order?.status !== 'delivered' &&
    order?.status !== 'cancelled' &&
    order?.status !== 'refunded' &&
    (order?.payment_method === 'cash' || order?.payment_method === 'online');
  const { creditBalance, creditLimit, dueAmount, availableCredit, creditHistory } = useCustomerCredits();
  const addItem = useCartStore((state) => state.addItem);

  // Credit card model: limit, due, available
  const isDue = dueAmount > 0;
  // Calculate total credits received and total debits from history
  const totalCredits = creditHistory.filter((t: any) => t.transaction_type === 'credit' || t.transaction_type === 'refund').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalDebits = creditHistory.filter((t: any) => t.transaction_type === 'debit' || t.transaction_type === 'penalty').reduce((s: number, t: any) => s + Number(t.amount), 0);

  // Filter Logic
  const filteredOrders = orders?.filter(order => {
    if (activeFilter === 'Active') return ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'assigned_to_delivery', 'picked_up', 'out_for_delivery'].includes(order.status);
    if (activeFilter === 'Delivered') return order.status === 'delivered';
    if (activeFilter === 'Cancelled') return order.status === 'cancelled';
    if (activeFilter === 'On Credit') return order.payment_method === 'credit';
    return true;
  }) || [];

  const isPastStatus = (s: string) => ['delivered', 'cancelled', 'refunded'].includes(s);
  // Single Zepto-style sorted list: active first (within active, newest first),
  // then past orders below (also newest first). No section headers — the card
  // styling itself differentiates active vs past visually.
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aPast = isPastStatus(a.status);
    const bPast = isPastStatus(b.status);
    if (aPast !== bPast) return aPast ? 1 : -1;
    const aDate = new Date(a.placed_at || a.created_at).getTime();
    const bDate = new Date(b.placed_at || b.created_at).getTime();
    return bDate - aDate;
  });

  // Reorder Function — re-fetches current product prices so the cart
  // reflects today's prices, not the snapshot from when the order was
  // placed (admin's place_customer_order_with_credit RPC would overwrite
  // to authoritative prices at checkout anyway; this just stops the
  // customer being surprised on the cart page).
  const handleReorder = async (order: any) => {
    if (!order.order_items || order.order_items.length === 0) return;

    const productIds = Array.from(new Set(
      (order.order_items as any[])
        .map((it) => it.product_id || it.product?.id || it.product_snapshot?.id)
        .filter(Boolean)
    ));

    let currentById = new Map<string, any>();
    if (productIds.length > 0) {
      const { data } = await supabase
        .from('products')
        .select('id, name, primary_image_url, unit_value, unit_type, selling_price, admin_selling_price, mrp, status, vendor_id, vendors(business_name)')
        .in('id', productIds as any);
      currentById = new Map((data || []).map((p: any) => [p.id, p]));
    }

    let addedCount = 0;
    let skippedCount = 0;
    order.order_items.forEach((item: any) => {
      const pid = item.product_id || item.product?.id || item.product_snapshot?.id;
      const fresh = pid ? currentById.get(pid) : null;
      const p = fresh || item.product || item.product_snapshot;
      if (!p) return;
      if (fresh && (fresh.status === 'out_of_stock' || fresh.status === 'inactive')) {
        skippedCount++;
        return;
      }
      const effectivePrice = fresh
        ? (fresh.admin_selling_price ?? fresh.selling_price)
        : (p.selling_price ?? 0);
      addItem({
        id: p.id,
        product_id: p.id,
        name: p.name,
        image_url: (fresh ? fresh.primary_image_url : (p.image_url || p.primary_image_url)) || '/placeholder.svg',
        unit_value: p.unit_value || 1,
        unit_type: p.unit_type || 'piece',
        selling_price: effectivePrice,
        vendor_selling_price: fresh ? Number(fresh.selling_price) || 0 : undefined,
        mrp: p.mrp || effectivePrice,
        max_quantity: 10,
        vendor_id: order.vendor_id,
        vendor_name: fresh?.vendors?.business_name || order.vendor?.business_name || p.vendor_name || undefined,
      });
      addedCount++;
    });

    toast({
      title: addedCount > 0 ? 'Items added to cart' : 'Nothing to reorder',
      description: skippedCount > 0
        ? `${addedCount} added · ${skippedCount} item${skippedCount > 1 ? 's' : ''} unavailable now`
        : 'Previous order items have been added to your cart.',
      duration: 2500,
    });
    navigate('/cart');
  };

  const getStatusDisplay = (status: string) => {
    switch(status) {
      case 'pending': return { label: 'Order Placed', color: 'text-secondary', progress: 'w-1/4' };
      case 'confirmed': return { label: 'Confirmed', color: 'text-secondary', progress: 'w-1/3' };
      case 'preparing': return { label: 'Preparing', color: 'text-secondary', progress: 'w-1/2' };
      case 'ready_for_pickup': return { label: 'Ready', color: 'text-primary', progress: 'w-2/3' };
      case 'assigned_to_delivery': return { label: 'Assigned', color: 'text-primary', progress: 'w-2/3' };
      case 'picked_up': return { label: 'Picked Up', color: 'text-primary', progress: 'w-3/4' };
      case 'out_for_delivery': return { label: 'On The Way', color: 'text-primary', progress: 'w-5/6' };
      case 'delivered': return { label: 'Delivered', color: 'text-green-800 bg-green-100' };
      case 'cancelled': return { label: 'Cancelled', color: 'text-slate-700 bg-slate-100' };
      default: return { label: status, color: 'text-slate-700 bg-slate-100', progress: 'w-0' };
    }
  };

  return (
    <CustomerLayout>
      <div className="bg-surface md:bg-background min-h-screen font-sans text-content">

        {/* FilterTabs */}
        <nav className="sticky top-0 z-40 bg-background/80 backdrop-blur-md py-3 border-b border-gray-100 overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-2 min-w-max">
            {['All', 'Active', 'Delivered', 'Cancelled', 'On Credit'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-5 h-9 rounded-full text-sm font-medium transition-colors border ${
                  activeFilter === tab
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-transparent text-foreground border-gray-200 hover:border-primary/40'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </nav>

        <main className="p-4 space-y-6 max-w-3xl mx-auto">
          
          {isOrdersLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-48 w-full rounded-card" />)}
            </div>
          ) : (
            <>
              {/* Credit Summary moved above the orders so it doesn't break the
                  continuous Zepto-style scroll between active and past cards. */}
              {(creditHistory.length > 0 || activeFilter === 'On Credit') && (
                <section>
                  <div className="bg-gradient-to-br from-dark to-primary rounded-card p-5 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-lg font-bold">Ahmed Mart Credit</h3>
                          <p className="text-[10px] opacity-70 tracking-widest uppercase">
                            {isDue ? 'Due Amount' : 'Credit Balance'}
                          </p>
                        </div>
                        <div className={`${isDue ? 'bg-red-400/30' : 'bg-white/20'} px-2 py-1 rounded text-[10px] font-bold`}>
                          {isDue ? 'DUE' : 'CREDIT'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div>
                          <p className="text-[10px] opacity-70 uppercase mb-0.5">Credit Limit</p>
                          <p className="text-base font-bold">₹{creditLimit.toFixed(0)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] opacity-70 uppercase mb-0.5">Due Amount</p>
                          <p className={`text-base font-bold ${isDue ? 'text-red-300' : ''}`}>₹{dueAmount.toFixed(0)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] opacity-70 uppercase mb-0.5">Available</p>
                          <p className="text-base font-bold text-green-300">₹{availableCredit.toFixed(0)}</p>
                        </div>
                      </div>

                      {creditLimit > 0 && (
                        <div className="w-full bg-white/20 h-1.5 rounded-full mb-4">
                          <div className="bg-white h-1.5 rounded-full transition-all" style={{ width: `${Math.min((dueAmount / creditLimit) * 100, 100)}%` }}></div>
                        </div>
                      )}

                      <div className="flex justify-between items-center">
                        <p className="text-[10px] opacity-80">{creditHistory.length} transaction{creditHistory.length !== 1 ? 's' : ''}</p>
                        <button
                          onClick={() => {
                            const doc = new jsPDF();
                            doc.setFontSize(18);
                            doc.text('Ahmed Mart - Credit Statement', 14, 22);
                            doc.setFontSize(10);
                            doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, h:mm a')}`, 14, 30);
                            doc.text(`Credit Limit: Rs. ${creditLimit.toFixed(2)} | Due: Rs. ${dueAmount.toFixed(2)} | Available: Rs. ${availableCredit.toFixed(2)}`, 14, 36);

                            autoTable(doc, {
                              startY: 44,
                              head: [['Date', 'Type', 'Description', 'Amount', 'Balance After']],
                              body: creditHistory.map((t: any) => [
                                format(new Date(t.created_at), 'dd/MM/yyyy'),
                                t.transaction_type.toUpperCase(),
                                t.description || '-',
                                `${t.transaction_type === 'debit' || t.transaction_type === 'penalty' ? '-' : '+'}Rs. ${Number(t.amount).toFixed(2)}`,
                                `Rs. ${Number(t.balance_after).toFixed(2)}`,
                              ]),
                              styles: { fontSize: 8 },
                              headStyles: { fillColor: [34, 80, 60] },
                            });

                            doc.save(`ahmed-mart-statement-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
                          }}
                          className="bg-white text-primary px-4 py-1.5 rounded-full text-xs font-bold shadow-sm"
                        >
                          View Statement
                        </button>
                      </div>
                    </div>
                    <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-white/5 rounded-full"></div>
                  </div>
                </section>
              )}

              {/* Unified order list — active orders pinned to top by sortedOrders,
                  past orders below. Card styling differentiates them inline; no
                  section headers or credit-card break between them. */}
              {sortedOrders.filter(o => !isPastStatus(o.status)).length > 0 && (
                <section className="space-y-3">
                  {sortedOrders.filter(o => !isPastStatus(o.status)).map(order => {
                    const statusInfo = getStatusDisplay(order.status);
                    return (
                      <div key={order.id} className="bg-card rounded-card border-2 border-primary shadow-glow p-4">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-xs font-semibold text-slate-600 uppercase">Order #{order.order_number?.slice(0,8) || order.id.slice(0,8)}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-block w-2 h-2 rounded-full bg-secondary pulse-dot"></span>
                              <span className="text-base font-extrabold text-slate-900 uppercase tracking-wide">{statusInfo.label}</span>
                            </div>
                          </div>
                          <span className="text-xs text-slate-600">Placed {format(new Date(order.placed_at || order.created_at), 'p')}</span>
                        </div>

                        {/* Progress Tracker */}
                        <div className="relative flex justify-between items-center mb-6 px-2">
                          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 -z-0"></div>
                          <div className={`absolute top-1/2 left-0 ${statusInfo.progress} h-0.5 bg-primary -translate-y-1/2 -z-0 transition-all duration-500`}></div>
                          
                          <div className="z-10 bg-primary text-primary-foreground rounded-full p-1 border-2 border-background">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                          </div>
                          <div className={`z-10 ${['preparing', 'ready_for_pickup', 'assigned_to_delivery', 'picked_up', 'out_for_delivery'].includes(order.status) ? 'bg-primary text-primary-foreground ring-4 ring-primary/10' : 'bg-muted text-muted-foreground'} rounded-full p-1 border-2 border-background`}>
                            {['preparing', 'ready_for_pickup', 'assigned_to_delivery', 'picked_up', 'out_for_delivery'].includes(order.status) ? (
                              <svg className="h-3 w-3 pulse-dot" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>
                            ) : <div className="h-3 w-3"></div>}
                          </div>
                          <div className={`z-10 ${order.status === 'out_for_delivery' ? 'bg-primary text-primary-foreground ring-4 ring-primary/10' : 'bg-muted text-muted-foreground'} rounded-full p-1 border-2 border-background`}>
                            {order.status === 'out_for_delivery' ? (
                               <svg className="h-3 w-3 pulse-dot" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>
                            ) : <div className="h-3 w-3"></div>}
                          </div>
                          <div className="z-10 bg-muted text-muted-foreground rounded-full p-1 border-2 border-background">
                            <div className="h-3 w-3"></div>
                          </div>
                        </div>
                        
                        <p className="text-center font-bold text-dark text-base mb-4">
                          {order.status === 'pending' ? 'Waiting for confirmation' : 
                           order.status === 'preparing' ? 'Your order is being prepared' : 
                           order.status === 'out_for_delivery' ? 'Driver is on the way' :
                           'Order is being processed'}
                        </p>

                        {/* OTP Display for out_for_delivery */}
                        {order.status === 'out_for_delivery' && order.delivery_otp && (
                          <div className="bg-primary/5 border border-dashed border-primary/30 rounded-xl p-4 mb-4 text-center">
                            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Delivery OTP</p>
                            <div className="flex justify-center gap-2 my-2">
                              {String(order.delivery_otp).split('').map((digit: string, i: number) => (
                                <div key={i} className="w-10 h-12 flex items-center justify-center border-2 border-dashed border-primary/40 rounded-lg bg-card text-xl font-bold text-foreground">
                                  {digit}
                                </div>
                              ))}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">Share this code with your delivery partner</p>
                          </div>
                        )}

                        {/* Order Items Scroll */}
                        <div className="flex gap-3 overflow-x-auto no-scrollbar mb-4">
                          {order.order_items?.slice(0, 4).map((item: any) => {
                            // Fetch image correctly from nested relations or fallback to snapshot
                            const imgUrl = item.product?.primary_image_url || item.product_snapshot?.image_url || "/placeholder.svg";
                            return (
                              <img key={item.id} alt={item.product_snapshot?.name || 'Item'} className="w-14 h-14 rounded-lg flex-shrink-0 bg-card border border-border object-contain p-1" src={imgUrl} />
                            );
                          })}
                          {order.order_items?.length > 4 && (
                            <div className="w-14 h-14 rounded-lg flex-shrink-0 bg-surface flex items-center justify-center text-xs font-bold text-primary">
                              +{order.order_items.length - 4}
                            </div>
                          )}
                        </div>

                        {/* Action Links */}
                        <div className="flex justify-between items-center border-t border-border pt-4 px-1 gap-3 flex-wrap">
                          <button onClick={() => { setSelectedOrder(order); setDrawerOpen(true); }} className="text-primary font-bold text-sm">View Full Order</button>
                          <div className="flex items-center gap-3">
                            {isPayNowEligible(order) && (
                              <button
                                onClick={() => payExistingOrder.mutate(order.id)}
                                disabled={payExistingOrder.isPending}
                                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-bold disabled:opacity-50"
                              >
                                {payExistingOrder.isPending ? 'Processing…' : `Pay Now ₹${Math.round(Number(order.total_amount))}`}
                              </button>
                            )}
                            {order.status === 'pending' && (
                              <button
                                onClick={() => { setOrderToCancel(order.id); setCancelDialogOpen(true); }}
                                className="text-destructive font-medium text-sm"
                              >
                                Cancel Order
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {/* Past orders — continued from the unified list above, no header */}
              {sortedOrders.filter(o => isPastStatus(o.status)).length > 0 && (
                <section className="space-y-3">
                  {sortedOrders.filter(o => isPastStatus(o.status)).map(order => {
                    const statusInfo = getStatusDisplay(order.status);
                    return (
                      <div key={order.id} className={`bg-white rounded-card p-4 shadow-sm border border-gray-100 ${order.status === 'cancelled' ? 'opacity-80' : ''}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-dark uppercase">#{order.order_number?.slice(0,8) || order.id.slice(0,8)}</span>
                              <span className={`${statusInfo.color} text-[10px] px-2 py-0.5 rounded font-bold uppercase`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(order.placed_at || order.created_at), 'do MMMM yyyy')}</p>
                          </div>
                          <p className="text-sm font-bold text-dark">₹{order.total_amount}</p>
                        </div>
                        
                        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                          {order.order_items?.slice(0, 4).map((item: any) => {
                             const imgUrl = item.product?.primary_image_url || item.product_snapshot?.image_url || "/placeholder.svg";
                             return (
                              <img key={item.id} alt={item.product_snapshot?.name || 'Item'} className={`w-10 h-10 rounded border border-gray-50 object-contain p-0.5 ${order.status === 'cancelled' ? 'grayscale' : ''}`} src={imgUrl} />
                            );
                          })}
                          {order.order_items?.length > 4 && (
                            <div className="w-10 h-10 rounded bg-gray-50 flex items-center justify-center text-[10px] text-muted-foreground">+{order.order_items.length - 4}</div>
                          )}
                        </div>

                        <div className={`grid ${
                          order.status === 'cancelled'
                            ? 'grid-cols-1'
                            : order.status === 'delivered'
                              ? 'grid-cols-3'
                              : 'grid-cols-2'
                        } gap-3`}>
                          {order.status !== 'cancelled' && (
                            <button onClick={() => handleReorder(order)} className="h-11 px-3 bg-primary text-primary-foreground rounded-2xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">
                              Reorder
                            </button>
                          )}
                          {order.status === 'delivered' && (
                            myRatings?.has(order.id) ? (
                              <div className="h-11 px-2 bg-yellow-50 border border-yellow-200 rounded-2xl flex items-center justify-center gap-0.5" title="Your rating">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <Star
                                    key={s}
                                    className={`w-4 h-4 ${
                                      s <= (myRatings.get(order.id) || 0)
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'text-gray-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            ) : (
                              <button
                                onClick={() => { setReviewOrder(order); setReviewOpen(true); }}
                                className="h-11 px-3 bg-yellow-400 text-yellow-950 rounded-2xl text-sm font-semibold hover:bg-yellow-300 transition-colors shadow-sm"
                              >
                                Rate Order
                              </button>
                            )
                          )}
                          <button onClick={() => { setSelectedOrder(order); setDrawerOpen(true); }} className={`h-11 px-3 ${order.status === 'cancelled' ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground shadow-sm'} rounded-2xl text-sm font-semibold`}>
                            View Details
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {filteredOrders.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                   <p>No orders found for this category.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Order Details Modal — shared component */}
      <OrderDetailsDialog
        order={selectedOrder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onRate={(o) => { setReviewOrder(o); setReviewOpen(true); }}
      />

      {/* Review Dialog */}
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        order={reviewOrder}
      />

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (orderToCancel) {
                  cancelOrder.mutate(orderToCancel);
                }
                setCancelDialogOpen(false);
                setOrderToCancel(null);
              }}
            >
              Yes, Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CustomerLayout>
  );
};

export default OrdersPage;
