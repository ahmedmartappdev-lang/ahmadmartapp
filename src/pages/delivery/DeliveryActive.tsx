import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Phone, CheckCircle, Truck, Package, Navigation, Banknote, Store, IndianRupee } from 'lucide-react';
import { DashboardLayout, deliveryNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { PaymentStatusBadge } from '@/components/shared/PaymentStatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { useDeliveryAssignmentMode } from '@/hooks/useAppSettings';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';

const DeliveryActive: React.FC = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isManualMode, isReady: modeReady } = useDeliveryAssignmentMode();
  const [otpDialogOrder, setOtpDialogOrder] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [paymentMode, setPaymentMode] = useState<string>('cash');

  const { data: partner } = useQuery({
    queryKey: ['delivery-partner-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('delivery_partners')
        .select('id')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['delivery-active-orders-full', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          order_items:order_items(*),
          vendor:vendors!orders_vendor_id_fkey(business_name)
        `)
        .eq('delivery_partner_id', partner.id)
        .in('status', ['assigned_to_delivery', 'picked_up', 'out_for_delivery'])
        .order('placed_at', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  useRealtimeInvalidation({
    table: 'orders',
    filter: `delivery_partner_id=eq.${partner?.id}`,
    queryKeys: [['delivery-active-orders-full', partner?.id || '']],
    enabled: !!partner?.id,
  });

  // Customer credit lookup for the order currently in the OTP dialog —
  // lets us show headroom and block the Credit option if the customer
  // has no available balance (mirrors AdminEditOrder behavior).
  const dialogOrderObj = otpDialogOrder
    ? (orders as any[] | undefined)?.find((o) => o.id === otpDialogOrder)
    : null;
  const otpCustomerId: string | undefined = dialogOrderObj?.customer_id;
  const otpOrderTotal: number = Number(dialogOrderObj?.total_amount || 0);
  const otpExistingCredit: number = Number(dialogOrderObj?.credit_used || 0);
  const { data: otpCustomerCredit } = useQuery({
    queryKey: ['delivery-otp-customer-credit', otpCustomerId],
    queryFn: async () => {
      if (!otpCustomerId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('credit_balance, credit_limit')
        .eq('user_id', otpCustomerId)
        .maybeSingle();
      return data;
    },
    enabled: !!otpCustomerId,
  });
  const otpCreditLimit = Number(otpCustomerCredit?.credit_limit || 0);
  const otpCreditBalance = Number(otpCustomerCredit?.credit_balance || 0);
  const otpAvailableCredit = Math.max(0, otpCreditLimit - otpCreditBalance);
  // The order may already have pre-allocated credit (admin-created credit
  // order). Only the remainder will be charged at delivery.
  const otpCreditNeeded = Math.max(0, otpOrderTotal - otpExistingCredit);
  const otpCreditInsufficient = paymentMode === 'credit' && otpCreditNeeded > otpAvailableCredit;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: status as any })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-active-orders-full'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-cash-collected'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-partner-profile'] });
      toast({ title: 'Order status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const verifyOtpAndDeliver = useMutation({
    mutationFn: async ({ orderId, otp }: { orderId: string; otp: string }) => {
      // Server-side RPC: validates OTP + partner ownership, and for credit
      // payment enforces the customer's credit limit + debits the balance.
      // Before this, a plain UPDATE here could mark the order paid via
      // "credit" with zero accounting → money compromised.
      const { data, error } = await (supabase.rpc as any)('delivery_complete_order_with_credit', {
        p_order_id: orderId,
        p_otp: otp,
        p_payment_method: paymentMode,
      });
      if (error) {
        const msg = (error as any)?.message || '';
        if (msg.toLowerCase().includes('invalid otp')) throw new Error('Invalid OTP');
        throw error;
      }
      if (data && (data as any).ok === false) {
        throw new Error((data as any).error || 'Failed to complete delivery');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-active-orders-full'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-cash-collected'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-approved-bills'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-verified-collections-dash'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-approved-cash-returns'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-partner-profile'] });
      toast({ title: 'Order delivered successfully!' });
      setOtpDialogOrder(null);
      setOtpInput('');
      setPaymentMode('cash');
    },
    onError: (error) => {
      toast({ 
        title: error.message === 'Invalid OTP' ? 'Invalid OTP' : 'Failed to deliver order', 
        description: error.message === 'Invalid OTP' ? 'Please check the OTP and try again' : undefined,
        variant: 'destructive' 
      });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      assigned_to_delivery: 'bg-purple-100 text-purple-800',
      picked_up: 'bg-yellow-100 text-yellow-800',
      out_for_delivery: 'bg-blue-100 text-blue-800',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  const getNextStatus = (currentStatus: string) => {
    const flow: Record<string, string> = {
      assigned_to_delivery: 'picked_up',
      picked_up: 'out_for_delivery',
    };
    return flow[currentStatus];
  };

  const getNextStatusLabel = (currentStatus: string) => {
    const labels: Record<string, string> = {
      assigned_to_delivery: 'Mark as Picked Up',
      picked_up: 'Start Delivery',
      out_for_delivery: 'Complete Delivery',
    };
    return labels[currentStatus] || 'Update';
  };

  const handleStatusUpdate = (orderId: string, currentStatus: string) => {
    if (currentStatus === 'out_for_delivery') {
      setOtpDialogOrder(orderId);
    } else {
      const nextStatus = getNextStatus(currentStatus);
      if (nextStatus) {
        updateStatusMutation.mutate({ orderId, status: nextStatus });
      }
    }
  };

  return (
    <DashboardLayout
      title="Active Orders"
      navItems={deliveryNavItems}
      roleColor="bg-blue-500 text-white"
      roleName="Delivery Partner"
    >
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : orders?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No active orders assigned to you</p>
            {isManualMode ? (
              <p className="text-sm text-muted-foreground mt-2">
                Wait for admin to assign orders to you
              </p>
            ) : (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => window.location.href = '/delivery/available'}
              >
                View Available Orders
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders?.map((order) => {
            const deliveryAddress = order.delivery_address as {
              address_line1?: string;
              address_line2?: string;
              city?: string;
              pincode?: string;
              landmark?: string;
            } | null;

            const orderItems = (order.order_items || []) as unknown as Array<{
              id: string;
              quantity: number;
              product_snapshot: { name: string };
            }>;

            return (
              <Card key={order.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{order.order_number}</CardTitle>
                    <Badge className={getStatusColor(order.status)} variant="secondary">
                      {(order.status ?? '').replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Payment status — first thing the delivery person sees */}
                  <PaymentStatusBadge order={order as any} variant="prominent" />

                  {/* Store Name */}
                  {(order as any).vendor?.business_name && (
                    <div className="flex items-center gap-2 bg-primary/5 rounded-lg px-3 py-2">
                      <Store className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Store: {(order as any).vendor.business_name}</span>
                    </div>
                  )}

                  {/* Order Items Summary */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Order Items</span>
                    </div>
                    <div className="space-y-1">
                      {orderItems.slice(0, 3).map((item) => (
                        <p key={item.id} className="text-sm text-muted-foreground">
                          {item.quantity}x {(item.product_snapshot as any)?.name || 'Item'}
                        </p>
                      ))}
                      {orderItems.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{orderItems.length - 3} more items
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Delivery Address */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">DELIVER TO</p>
                      <p className="font-medium">
                        {deliveryAddress?.address_line1 || 'Address not available'}
                      </p>
                      {deliveryAddress?.address_line2 && (
                        <p className="text-sm text-muted-foreground">
                          {deliveryAddress.address_line2}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {deliveryAddress?.city} - {deliveryAddress?.pincode}
                      </p>
                      {deliveryAddress?.landmark && (
                        <p className="text-sm text-muted-foreground">
                          Near: {deliveryAddress.landmark}
                        </p>
                      )}
                    </div>
                    {order.delivery_latitude && order.delivery_longitude && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          window.open(
                            `https://www.google.com/maps/dir/?api=1&destination=${order.delivery_latitude},${order.delivery_longitude}`,
                            '_blank'
                          );
                        }}
                      >
                        <Navigation className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Customer Notes */}
                  {order.customer_notes && (
                    <div className="bg-accent/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">CUSTOMER NOTE</p>
                      <p className="text-sm">{order.customer_notes}</p>
                    </div>
                  )}

                  {/* Order Summary */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                      <p className="text-sm text-muted-foreground">Order Amount</p>
                      <p className="text-xl font-bold">₹{Number(order.total_amount).toLocaleString()}</p>
                      <PaymentStatusBadge order={order as any} variant="compact" className="mt-1" />
                    </div>
                    <Button 
                      onClick={() => handleStatusUpdate(order.id, order.status)}
                      disabled={updateStatusMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {getNextStatusLabel(order.status)}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* OTP Verification Dialog */}
      <Dialog open={!!otpDialogOrder} onOpenChange={() => setOtpDialogOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Delivery OTP</DialogTitle>
            <DialogDescription>
              Ask the customer for the 4-digit OTP to complete the delivery
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {(() => {
              const dialogOrder = otpDialogOrder
                ? (orders as any[] | undefined)?.find((o) => o.id === otpDialogOrder)
                : null;
              const isAlreadyPaid = dialogOrder?.payment_status === 'completed';
              return isAlreadyPaid ? (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                  <span>✓ Already paid via {String(dialogOrder?.payment_method || '').toUpperCase()} — no cash to collect</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  {dialogOrderObj?.payment_method && (
                    <p className="text-[11px] text-muted-foreground">
                      Customer chose <span className="font-medium uppercase">{String(dialogOrderObj.payment_method)}</span> at checkout
                      {dialogOrderObj.payment_status === 'failed' ? ' (payment failed)' : ''}
                    </p>
                  )}
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                  {paymentMode === 'credit' && otpCustomerId && (
                    <div className={`text-xs rounded-md px-3 py-2 ${
                      otpCreditInsufficient
                        ? 'bg-destructive/10 text-destructive border border-destructive/30'
                        : 'bg-primary/5 text-primary border border-primary/20'
                    }`}>
                      {otpCreditInsufficient ? (
                        <>Customer credit insufficient — needs ₹{otpCreditNeeded.toFixed(2)}, available ₹{otpAvailableCredit.toFixed(2)}. Choose Cash or UPI.</>
                      ) : (
                        <>Available credit ₹{otpAvailableCredit.toFixed(2)} · this delivery will use ₹{otpCreditNeeded.toFixed(2)}</>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Delivery OTP</Label>
              <Input
                placeholder="Enter 4-digit OTP"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="text-center text-2xl tracking-widest"
                maxLength={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOtpDialogOrder(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (otpDialogOrder && otpInput.length === 4) {
                  verifyOtpAndDeliver.mutate({ orderId: otpDialogOrder, otp: otpInput });
                }
              }}
              disabled={otpInput.length !== 4 || verifyOtpAndDeliver.isPending || otpCreditInsufficient}
            >
              {verifyOtpAndDeliver.isPending ? 'Verifying...' : 'Confirm Delivery'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  );
};

export default DeliveryActive;
