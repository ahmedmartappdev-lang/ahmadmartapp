import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface OrderDetailsDialogProps {
  order: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  onRate?: (order: any) => void;
}

export const OrderDetailsDialog: React.FC<OrderDetailsDialogProps> = ({
  order,
  open,
  onOpenChange,
  loading = false,
  onRate,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] p-0 gap-0">
        <DialogHeader className="flex flex-row items-center justify-between px-5 py-4 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="text-lg font-bold">
            {order?.order_number ? `Order #${order.order_number.slice(0, 8)}` : 'Order details'}
          </DialogTitle>
        </DialogHeader>

        {loading && !order && (
          <div className="px-5 pb-6 pt-4 space-y-4">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        )}

        {!loading && !order && (
          <div className="px-5 pb-8 pt-6 text-center">
            <p className="text-sm text-muted-foreground">Order not available.</p>
          </div>
        )}

        {order && (
          <ScrollArea className="max-h-[70vh]">
            <div className="px-5 pb-6 pt-4 space-y-4">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className="text-sm font-bold capitalize">{String(order.status || '').replace(/_/g, ' ')}</span>
              </div>

              {/* OTP Display in Modal */}
              {order.status === 'out_for_delivery' && order.delivery_otp && (
                <div className="bg-primary/5 border border-dashed border-primary/30 rounded-xl p-4 text-center">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Delivery OTP</p>
                  <div className="flex justify-center gap-2 my-2">
                    {String(order.delivery_otp).split('').map((digit: string, i: number) => (
                      <div key={i} className="w-10 h-12 flex items-center justify-center border-2 border-dashed border-primary/40 rounded-lg bg-white text-xl font-bold text-foreground">
                        {digit}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Share this code with your delivery partner</p>
                </div>
              )}

              {/* Order Items */}
              <div>
                <h3 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
                  {order.order_items?.length || 0} Item{(order.order_items?.length || 0) > 1 ? 's' : ''}
                </h3>
                <div className="space-y-3">
                  {order.order_items?.map((item: any) => {
                    const imgUrl = item.product_snapshot?.image_url || item.product_snapshot?.primary_image_url || '/placeholder.svg';
                    const vendorName = order.vendor?.business_name || item.product_snapshot?.vendor_name;
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                        <img src={imgUrl} alt={item.product_snapshot?.name} className="w-14 h-14 rounded-lg object-contain bg-white border p-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.product_snapshot?.name}</p>
                          {vendorName && (
                            <p className="text-[11px] text-muted-foreground">Sold by <span className="font-medium">{vendorName}</span></p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {item.product_snapshot?.unit_value} {item.product_snapshot?.unit_type} × {item.quantity}
                          </p>
                        </div>
                        <p className="text-sm font-bold shrink-0">₹{(Number(item.total_price) || 0).toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cancellation reason — shown only when order is cancelled and
                  someone (admin/customer/vendor) recorded a reason. Pulls from
                  orders.cancellation_reason. */}
              {order.status === 'cancelled' && order.cancellation_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 mb-1">
                    Reason for cancellation
                  </p>
                  <p className="text-red-900 leading-snug">{order.cancellation_reason}</p>
                  {order.cancelled_at && (
                    <p className="text-[11px] text-red-700/80 mt-1.5">
                      Cancelled on {new Date(order.cancelled_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
                      })}
                    </p>
                  )}
                </div>
              )}

              {/* Bill Summary */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{Number(order.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span>{Number(order.delivery_fee || 0) === 0 ? 'FREE' : `₹${Number(order.delivery_fee).toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span>₹{Number(order.platform_fee || 0).toFixed(2)}</span>
                </div>
                {Number((order as any).small_order_fee || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Small Order Fee</span>
                    <span>₹{Number((order as any).small_order_fee).toFixed(2)}</span>
                  </div>
                )}
                {/* GST is stored in orders.tax_amount on the row. Previous
                    code looked at `order.gst` (no such column), so the line
                    was always hidden. Read tax_amount with .gst fallback for
                    any legacy in-memory copies. */}
                {Number((order as any).tax_amount || (order as any).gst || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST on charges</span>
                    <span>₹{Number((order as any).tax_amount || (order as any).gst || 0).toFixed(2)}</span>
                  </div>
                )}
                {Number((order as any).discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Discount</span>
                    <span>− ₹{Number((order as any).discount_amount).toFixed(2)}</span>
                  </div>
                )}
                {Number((order as any).credit_used || 0) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Paid via Credit</span>
                    <span>₹{Number((order as any).credit_used).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t pt-2">
                  <span>Total</span>
                  <span>₹{Number(order.total_amount || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
                <span className="text-sm text-muted-foreground">Payment</span>
                <span className="text-sm font-bold uppercase">{order.payment_method}</span>
              </div>

              {/* Rate this order */}
              {order.status === 'delivered' && onRate && (
                <button
                  onClick={() => { onOpenChange(false); onRate(order); }}
                  className="w-full h-11 px-4 bg-yellow-400 text-yellow-950 rounded-2xl text-sm font-semibold hover:bg-yellow-300 transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <span>★</span> Rate this Order
                </button>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetailsDialog;
