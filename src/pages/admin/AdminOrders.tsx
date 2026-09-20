import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Eye, MoreVertical, UserPlus, Package, MapPin, Plus, Pencil, Store, User, AlertTriangle, XCircle } from 'lucide-react';
import AdminCreateOrder from '@/components/admin/AdminCreateOrder';
import { PaymentStatusBadge } from '@/components/shared/PaymentStatusBadge';
import AdminEditOrder from '@/components/admin/AdminEditOrder';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useDeliveryAssignmentMode } from '@/hooks/useAppSettings';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { format } from 'date-fns';

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_snapshot: {
    name: string;
    image_url?: string;
    vendor_name?: string;
  };
}

// Once the parcel is out for delivery (or the order is terminal) editing is
// no longer allowed. AdminEditOrder re-checks this against the live DB row at
// save time too, in case the status changed while the dialog was open.
const NON_EDITABLE_STATUSES = ['out_for_delivery', 'delivered', 'cancelled', 'refunded'];

const AdminOrders: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [assignDialogOrder, setAssignDialogOrder] = useState<any | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<any | null>(null);
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isManualMode } = useDeliveryAssignmentMode();

  const { data: orders, isLoading, isError, error: queryError } = useQuery({
    queryKey: ['admin-orders', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (*),
          delivery_partner:delivery_partners (id, full_name, phone),
          vendor:vendors (business_name)
        `)
        .order('placed_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }

      const { data, error } = await query.limit(50);
      if (error) {
        console.error('Order fetch error:', error);
        throw error;
      }

      const orders = data || [];
      const customerIds = [...new Set(orders.map((order) => order.customer_id).filter(Boolean))];

      if (customerIds.length === 0) {
        return orders;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone')
        .in('user_id', customerIds);

      if (profilesError) {
        console.error('Customer profile fetch error:', profilesError);
        throw profilesError;
      }

      const profilesByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

      return orders.map((order) => ({
        ...order,
        customer: profilesByUserId.get(order.customer_id) || null,
      }));
    },
  });

  useRealtimeInvalidation({
    table: 'orders',
    queryKeys: [['admin-orders']],
  });

  const { data: availablePartners } = useQuery({
    queryKey: ['available-delivery-partners'],
    queryFn: async () => {
      // Only partners actually working right now. `offline` means they
      // haven't toggled "available" on their app — assigning to them
      // means the order will sit until they come online.
      const { data } = await supabase
        .from('delivery_partners')
        .select('id, full_name, phone, status, account_status')
        .eq('status', 'available')
        .neq('account_status', 'suspended');
      return data || [];
    },
  });

  const assignPartnerMutation = useMutation({
    mutationFn: async ({ orderId, partnerId }: { orderId: string; partnerId: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({
          delivery_partner_id: partnerId,
          status: 'assigned_to_delivery' as any,
        })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      toast({ title: 'Delivery partner assigned successfully' });
      setAssignDialogOrder(null);
      setSelectedPartnerId('');
    },
    onError: () => {
      toast({ title: 'Failed to assign delivery partner', variant: 'destructive' });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { data, error } = await (supabase.rpc as any)('admin_cancel_order', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (error) {
        const parts = [error.message, (error as any).details, (error as any).hint].filter(Boolean);
        throw new Error(parts.join(' · ') || 'Failed to cancel order');
      }
      if (!data?.ok) throw new Error('Failed to cancel order');
      return data as { refund_method: 'credit_refund' | 'manual_gateway' | 'none'; refund_amount: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      const msg =
        data.refund_method === 'credit_refund'
          ? `Order cancelled. ₹${data.refund_amount} credit refunded to customer.`
          : data.refund_method === 'manual_gateway'
            ? `Order cancelled. ₹${data.refund_amount} will be refunded within 3–5 business days.`
            : 'Order cancelled.';
      toast({ title: msg });
      setCancelOrder(null);
      setCancelReason('');
    },
    onError: (err: any) => {
      toast({ title: 'Failed to cancel order', description: err.message, variant: 'destructive' });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'text-amber-700',
      confirmed: 'text-blue-700',
      preparing: 'text-indigo-700',
      ready_for_pickup: 'text-violet-700',
      assigned_to_delivery: 'text-violet-700',
      picked_up: 'text-cyan-700',
      out_for_delivery: 'text-orange-700',
      delivered: 'text-emerald-700',
      cancelled: 'text-red-700',
      refunded: 'text-slate-500',
    };
    return colors[status] || 'text-slate-600';
  };

  const getPaymentStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'text-amber-700',
      completed: 'text-emerald-700',
      failed: 'text-red-700',
      refunded: 'text-slate-500',
    };
    return colors[status] || 'text-slate-600';
  };

  const filteredOrders = orders?.filter((order) =>
    (order.order_number || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout
      title="Orders Management"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      {isManualMode && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">Manual assignment mode is active</p>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Delivery partners cannot self-assign orders. Use the Assign button to assign orders manually.
            </p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <CardTitle className="text-slate-900">All Orders</CardTitle>
              <Button size="sm" className="rounded-md" onClick={() => setCreateOrderOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> Create Order
              </Button>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border-slate-300 pl-9 sm:w-[200px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full rounded-md border-slate-300 sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="ready_for_pickup">Ready for Pickup</SelectItem>
                  <SelectItem value="assigned_to_delivery">Assigned</SelectItem>
                  <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : isError ? (
            <div className="m-6 rounded-lg border border-red-200 bg-red-50 py-8 text-center font-medium text-red-500">
              Error loading orders: {(queryError as Error)?.message || 'Database relationship error.'}
            </div>
          ) : filteredOrders?.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No orders found</div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {filteredOrders?.map((order) => {
                  const deliveryPartner = order.delivery_partner as any;
                  const customer = order.customer as any;

                  return (
                    <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{order.order_number}</p>
                          <p className="text-xs text-slate-500">{format(new Date(order.placed_at), 'dd MMM, hh:mm a')}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-md text-slate-600 hover:bg-white hover:text-slate-900"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {!deliveryPartner && !['delivered', 'cancelled', 'refunded'].includes(order.status) && (
                              <DropdownMenuItem onClick={() => setAssignDialogOrder(order)}>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Assign Delivery Partner
                              </DropdownMenuItem>
                            )}
                            {!NON_EDITABLE_STATUSES.includes(order.status)
                              && (order.payment_status !== 'completed' || order.payment_method === 'credit') && (
                              <DropdownMenuItem onClick={() => setEditOrder(order)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit Order
                              </DropdownMenuItem>
                            )}
                            {!['delivered', 'cancelled', 'refunded'].includes(order.status) && (
                              <DropdownMenuItem className="text-destructive" onClick={() => setCancelOrder(order)}>
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Order
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-slate-500">Customer</span>
                          <div className="text-right">
                            <p className="font-medium text-slate-900">{customer?.full_name || 'Unknown'}</p>
                            {customer?.phone && <p className="text-xs text-slate-500">{customer.phone}</p>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Status</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold capitalize ${getStatusColor(order.status)}`}>
                              {(order.status ?? '').replace(/_/g, ' ')}
                            </span>
                            {order.delivery_otp && (
                              <Badge className="bg-amber-100 font-mono text-xs text-amber-800" variant="secondary">
                                OTP: {order.delivery_otp}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Payment</span>
                          <PaymentStatusBadge order={order as any} variant="compact" />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Amount</span>
                          <span className="font-semibold text-slate-900">₹{Number(order.total_amount).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Partner</span>
                          {deliveryPartner?.full_name ? (
                            <span className="text-right font-medium text-slate-700">{deliveryPartner.full_name}</span>
                          ) : (isManualMode
                            ? ['confirmed', 'preparing', 'ready_for_pickup']
                            : ['ready_for_pickup']
                          ).includes(order.status) ? (
                            <Button
                              variant={isManualMode ? 'default' : 'outline'}
                              size="sm"
                              className="h-9 rounded-md px-3 font-semibold"
                              onClick={() => setAssignDialogOrder(order)}
                            >
                              <UserPlus className="mr-1 h-4 w-4" />
                              Assign
                            </Button>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Order #</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Date</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Customer</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Status</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Delivery Partner</TableHead>
                    <TableHead className="h-14 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Payment</TableHead>
                    <TableHead className="h-14 px-5 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Amount</TableHead>
                    <TableHead className="h-14 px-5 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders?.map((order) => {
                    const deliveryPartner = order.delivery_partner as any;
                    const customer = order.customer as any;

                    return (
                      <TableRow key={order.id} className="border-slate-200 hover:bg-white">
                        <TableCell className="px-5 py-5 font-semibold text-slate-900">{order.order_number}</TableCell>
                        <TableCell className="px-5 py-5 text-sm text-slate-700">
                          {format(new Date(order.placed_at), 'dd MMM, hh:mm a')}
                        </TableCell>
                        <TableCell className="px-5 py-5">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">{customer?.full_name || 'Unknown'}</span>
                            <span className="text-xs text-slate-500">{customer?.phone || ''}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-5">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold capitalize ${getStatusColor(order.status)}`}>
                              {(order.status ?? '').replace(/_/g, ' ')}
                            </span>
                            {order.delivery_otp && (
                              <Badge className="bg-amber-100 font-mono text-xs text-amber-800" variant="secondary">
                                OTP: {order.delivery_otp}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-5">
                          {deliveryPartner?.full_name ? (
                            <span className="text-sm font-medium text-slate-700">{deliveryPartner.full_name}</span>
                          ) : (isManualMode
                            ? ['confirmed', 'preparing', 'ready_for_pickup']
                            : ['ready_for_pickup']
                          ).includes(order.status) ? (
                            <Button
                              variant={isManualMode ? 'default' : 'outline'}
                              size="sm"
                              className="h-10 rounded-md px-4 font-semibold"
                              onClick={() => setAssignDialogOrder(order)}
                            >
                              <UserPlus className="mr-1 h-4 w-4" />
                              Assign
                            </Button>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="px-5 py-5">
                          <PaymentStatusBadge order={order as any} variant="compact" />
                        </TableCell>
                        <TableCell className="px-5 py-5 text-right font-semibold text-slate-900">
                          ₹{Number(order.total_amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-5 py-5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-md text-slate-600 hover:bg-white hover:text-slate-900"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              {!deliveryPartner && !['delivered', 'cancelled', 'refunded'].includes(order.status) && (
                                <DropdownMenuItem onClick={() => setAssignDialogOrder(order)}>
                                  <UserPlus className="mr-2 h-4 w-4" />
                                  Assign Delivery Partner
                                </DropdownMenuItem>
                              )}
                              {!NON_EDITABLE_STATUSES.includes(order.status)
                                && (order.payment_status !== 'completed' || order.payment_method === 'credit') && (
                                <DropdownMenuItem onClick={() => setEditOrder(order)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit Order
                                </DropdownMenuItem>
                              )}
                              {!['delivered', 'cancelled', 'refunded'].includes(order.status) && (
                                <DropdownMenuItem className="text-destructive" onClick={() => setCancelOrder(order)}>
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel Order
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Badge className={getStatusColor(selectedOrder.status)} variant="secondary">
                  {(selectedOrder.status ?? '').replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(selectedOrder.placed_at), 'dd MMM yyyy, hh:mm a')}
                </span>
              </div>

              {selectedOrder.delivery_otp && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
                  <p className="mb-1 text-sm font-medium text-amber-800 dark:text-amber-200">Delivery OTP</p>
                  <p className="text-2xl font-bold tracking-widest text-amber-900 dark:text-amber-100">
                    {selectedOrder.delivery_otp}
                  </p>
                </div>
              )}

              {selectedOrder.customer && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Customer:</span>
                  <span className="text-sm">
                    {(selectedOrder.customer as any).full_name} ({(selectedOrder.customer as any).phone})
                  </span>
                </div>
              )}

              {selectedOrder.vendor && (
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Store:</span>
                  <span className="text-sm">{(selectedOrder.vendor as any).business_name}</span>
                </div>
              )}

              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium">
                  <Package className="h-4 w-4" />
                  Order Items
                </h4>
                <div className="space-y-3 rounded-lg bg-muted/50 p-4">
                  {((selectedOrder.order_items || []) as unknown as OrderItem[]).map((item) => {
                    const snapshot = item.product_snapshot as any;
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        {snapshot?.image_url && (
                          <img
                            src={snapshot.image_url}
                            alt={snapshot.name}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{snapshot?.name}</p>
                          {snapshot?.vendor_name && (
                            <p className="text-xs text-muted-foreground">by {snapshot.vendor_name}</p>
                          )}
                          <p className="text-sm text-muted-foreground">
                            {item.quantity} × ₹{item.unit_price}
                          </p>
                        </div>
                        <p className="font-medium">₹{item.total_price}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="mb-3 flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4" />
                  Delivery Address
                </h4>
                <div className="rounded-lg bg-muted/50 p-4">
                  {(() => {
                    const addr = selectedOrder.delivery_address as any;
                    return (
                      <>
                        <Badge variant="outline" className="mb-2 capitalize">
                          {addr?.address_type || 'Home'}
                        </Badge>
                        <p className="font-medium">{addr?.address_line1}</p>
                        {addr?.address_line2 && <p>{addr.address_line2}</p>}
                        {addr?.landmark && <p className="text-muted-foreground">Near: {addr.landmark}</p>}
                        <p className="text-muted-foreground">
                          {addr?.city}, {addr?.state} - {addr?.pincode}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{Number(selectedOrder.subtotal).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span>₹{Number(selectedOrder.delivery_fee).toLocaleString()}</span>
                </div>
                {Number(selectedOrder.platform_fee || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Platform Fee</span>
                    <span>₹{Number(selectedOrder.platform_fee).toLocaleString()}</span>
                  </div>
                )}
                {Number((selectedOrder as any).small_order_fee || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Small Order Fee</span>
                    <span>₹{Number((selectedOrder as any).small_order_fee).toLocaleString()}</span>
                  </div>
                )}
                {Number((selectedOrder as any).gst || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GST &amp; charges</span>
                    <span>₹{Number((selectedOrder as any).gst).toLocaleString()}</span>
                  </div>
                )}
                {Number(selectedOrder.discount_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Discount</span>
                    <span>− ₹{Number(selectedOrder.discount_amount).toLocaleString()}</span>
                  </div>
                )}
                {Number(selectedOrder.credit_used || 0) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Paid via Credit</span>
                    <span>₹{Number(selectedOrder.credit_used).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span>₹{Number(selectedOrder.total_amount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignDialogOrder} onOpenChange={() => setAssignDialogOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Delivery Partner</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-muted-foreground">
              Select a delivery partner for order {assignDialogOrder?.order_number}
            </p>
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a delivery partner" />
              </SelectTrigger>
              <SelectContent>
                {availablePartners?.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.full_name || 'Unknown'} ({partner.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOrder(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (assignDialogOrder && selectedPartnerId) {
                  assignPartnerMutation.mutate({
                    orderId: assignDialogOrder.id,
                    partnerId: selectedPartnerId,
                  });
                }
              }}
              disabled={!selectedPartnerId || assignPartnerMutation.isPending}
            >
              {assignPartnerMutation.isPending ? 'Assigning...' : 'Assign Partner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminCreateOrder open={createOrderOpen} onOpenChange={setCreateOrderOpen} />
      <AdminEditOrder order={editOrder} open={!!editOrder} onOpenChange={(open) => { if (!open) setEditOrder(null); }} />

      {/* Cancel Order Dialog */}
      <Dialog open={!!cancelOrder} onOpenChange={(open) => { if (!open) { setCancelOrder(null); setCancelReason(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Order {cancelOrder?.order_number}</DialogTitle>
            <DialogDescription>
              This will mark the order as cancelled. The action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {cancelOrder && (
            <div className="space-y-4">
              {(() => {
                const total = Number(cancelOrder.total_amount || 0);
                if (cancelOrder.payment_status !== 'completed') {
                  return (
                    <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                      No payment was collected for this order — nothing to refund.
                    </div>
                  );
                }
                if (cancelOrder.payment_method === 'credit') {
                  return (
                    <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                      Customer's <strong>₹{total.toFixed(2)}</strong> credit will be refunded immediately.
                    </div>
                  );
                }
                return (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    <strong>₹{total.toFixed(2)}</strong> will be refunded to the customer within <strong>3–5 business days</strong>.
                    You'll need to process the gateway refund manually.
                  </div>
                );
              })()}

              <div className="space-y-2">
                <label className="text-sm font-medium">Reason *</label>
                <Textarea
                  placeholder="Why is this order being cancelled? (visible in audit log)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelOrder(null); setCancelReason(''); }}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (cancelOrder && cancelReason.trim().length >= 3) {
                  cancelOrderMutation.mutate({ orderId: cancelOrder.id, reason: cancelReason.trim() });
                }
              }}
              disabled={cancelReason.trim().length < 3 || cancelOrderMutation.isPending}
            >
              {cancelOrderMutation.isPending ? 'Cancelling…' : 'Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminOrders;
