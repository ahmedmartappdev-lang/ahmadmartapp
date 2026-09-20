import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, MoreVertical, CheckCircle, XCircle, Clock, Package } from 'lucide-react';
import { DashboardLayout, vendorNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { format } from 'date-fns';
import { vendorEarning } from '@/lib/vendorRevenue';

interface OrderItem {
  id: string;
  product_id?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_snapshot: {
    name: string;
    image_url?: string;
    unit_value?: number;
    unit_type?: string;
    selling_price?: number;          // admin/effective price (what the customer paid)
    vendor_selling_price?: number;   // vendor's own price (added 2026-05); legacy rows won't have this
  };
}

const VendorOrders: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vendor } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Vendor's earning per order = Σ(vendor_selling_price × qty). No
  // commission deducted — Ahmad Mart's margin is the spread between
  // admin_selling_price and vendor_selling_price on the product, not a
  // cut on top. Mirrors server-side accrue_vendor_earnings exactly.
  const vendorRevenue = (order: any): number => vendorEarning(order);

  // Status the vendor sees — anything past "picked_up" is the delivery
  // partner's responsibility, so vendor's view stops there.
  const vendorVisibleStatus = (status: string): string => {
    if (['assigned_to_delivery', 'picked_up', 'out_for_delivery', 'delivered'].includes(status)) {
      return 'picked_up';
    }
    return status;
  };

  const { data: orders, isLoading } = useQuery({
    queryKey: ['vendor-orders', vendor?.id, statusFilter],
    queryFn: async () => {
      if (!vendor?.id) return [];
      
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items:order_items(*)
        `)
        .eq('vendor_id', vendor.id)
        .order('placed_at', { ascending: false });

      if (statusFilter !== 'all') {
        // "picked_up" in the filter means "anything post-vendor-handoff" since
        // we collapse those statuses in the UI.
        if (statusFilter === 'picked_up') {
          query = query.in('status', ['picked_up', 'assigned_to_delivery', 'out_for_delivery', 'delivered'] as any);
        } else {
          query = query.eq('status', statusFilter as any);
        }
      }

      const { data } = await query.limit(50);
      return data || [];
    },
    enabled: !!vendor?.id,
  });

  useRealtimeInvalidation({
    table: 'orders',
    filter: `vendor_id=eq.${vendor?.id}`,
    queryKeys: [['vendor-orders']],
    enabled: !!vendor?.id,
  });

  // For legacy orders (no vendor_selling_price in snapshot), look up the
  // vendor's *current* selling_price by product_id. Best-effort fallback —
  // if the price has since been changed on the product, this won't match
  // the historical price, but it's still better than showing the admin
  // markup as if it were the vendor's revenue.
  const missingPriceProductIds = React.useMemo(() => {
    if (!selectedOrder) return [] as string[];
    const items = (selectedOrder.order_items || []) as any[];
    return items
      .filter((it) => it?.product_snapshot?.vendor_selling_price == null && it?.product_id)
      .map((it) => it.product_id as string);
  }, [selectedOrder]);

  const { data: legacyVendorPriceMap } = useQuery({
    queryKey: ['vendor-order-legacy-prices', missingPriceProductIds.sort().join(',')],
    queryFn: async () => {
      if (missingPriceProductIds.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from('products')
        .select('id, selling_price')
        .in('id', missingPriceProductIds);
      const map: Record<string, number> = {};
      (data || []).forEach((p: any) => { map[p.id] = Number(p.selling_price) || 0; });
      return map;
    },
    enabled: missingPriceProductIds.length > 0,
  });

  // Resolve the vendor's per-unit price for an order item:
  //   1) snapshot.vendor_selling_price (new orders, exact historical price)
  //   2) legacy lookup against products.selling_price by product_id
  //   3) snapshot.selling_price / unit_price (admin/effective price — only as
  //      a last resort; will include any admin markup, which is the bug
  //      this code path is trying to avoid)
  const vendorUnitPrice = (item: any): number => {
    const snap = item?.product_snapshot || {};
    const fromSnap = Number(snap.vendor_selling_price);
    if (Number.isFinite(fromSnap) && fromSnap > 0) return fromSnap;
    const fromLegacy = legacyVendorPriceMap?.[item?.product_id];
    if (Number.isFinite(fromLegacy) && (fromLegacy as number) > 0) return fromLegacy as number;
    return Number(snap.selling_price ?? item?.unit_price ?? 0);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ status: status as any })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-orders'] });
      toast({ title: 'Order status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-indigo-100 text-indigo-800',
      ready_for_pickup: 'bg-purple-100 text-purple-800',
      assigned_to_delivery: 'bg-purple-100 text-purple-800',
      picked_up: 'bg-cyan-100 text-cyan-800',
      out_for_delivery: 'bg-orange-100 text-orange-800',
      delivered: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <DashboardLayout
      title="Orders"
      navItems={vendorNavItems}
      roleColor="bg-purple-500 text-white"
      roleName="Vendor Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle>Your Orders</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="ready_for_pickup">Ready for Pickup</SelectItem>
                <SelectItem value="picked_up">Picked Up</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : orders?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No orders found</div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {orders?.map((order) => {
                  const orderItems = (order.order_items || []) as unknown as OrderItem[];
                  return (
                    <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{order.order_number}</p>
                          <p className="text-xs text-slate-500">{format(new Date(order.placed_at), 'dd MMM, hh:mm a')}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {order.status === 'pending' && (
                              <>
                                <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'confirmed' })}>
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Confirm Order
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'cancelled' })}>
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Reject Order
                                </DropdownMenuItem>
                              </>
                            )}
                            {order.status === 'confirmed' && (
                              <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'ready_for_pickup' })}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Ready for Pickup
                              </DropdownMenuItem>
                            )}
                            {order.status === 'ready_for_pickup' && (
                              <DropdownMenuItem onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'picked_up' })}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Picked Up
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Items</span>
                          <span className="text-slate-700">{orderItems.length} item{orderItems.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Status</span>
                          <Badge className={getStatusColor(vendorVisibleStatus(order.status))} variant="secondary">
                            {vendorVisibleStatus(order.status).replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Your earning</span>
                          <span className="font-semibold text-slate-900 tabular-nums">₹{vendorRevenue(order).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Your earning</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders?.map((order) => {
                    const orderItems = (order.order_items || []) as unknown as OrderItem[];
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>
                          {format(new Date(order.placed_at), 'dd MMM, hh:mm a')}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {orderItems.length} item{orderItems.length !== 1 ? 's' : ''}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(vendorVisibleStatus(order.status))} variant="secondary">
                            {vendorVisibleStatus(order.status).replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {/* Canonical formula — matches accrue_vendor_earnings RPC */}
                          ₹{vendorRevenue(order).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedOrder(order)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {order.status === 'pending' && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'confirmed' })}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Confirm Order
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'cancelled' })}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Reject Order
                                  </DropdownMenuItem>
                                </>
                              )}
                              {order.status === 'confirmed' && (
                                <DropdownMenuItem
                                  onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'ready_for_pickup' })}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Ready for Pickup
                                </DropdownMenuItem>
                              )}
                              {order.status === 'ready_for_pickup' && (
                                <DropdownMenuItem
                                  onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: 'picked_up' })}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Picked Up
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

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6">
              {/* Status & Date */}
              <div className="flex items-center justify-between">
                <Badge className={getStatusColor(vendorVisibleStatus(selectedOrder.status))} variant="secondary">
                  {vendorVisibleStatus(selectedOrder.status).replace(/_/g, ' ')}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {format(new Date(selectedOrder.placed_at), 'dd MMM yyyy, hh:mm a')}
                </span>
              </div>

              {/* Order Items at vendor's price */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order Items
                </h4>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  {((selectedOrder.order_items || []) as OrderItem[]).map((item) => {
                    const snap = item.product_snapshot as any;
                    const vendorPrice = vendorUnitPrice(item);
                    const lineTotal = vendorPrice * item.quantity;
                    return (
                      <div key={item.id} className="flex items-center gap-3">
                        {snap?.image_url && (
                          <img
                            src={snap.image_url}
                            alt={snap.name}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{snap?.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.quantity} × ₹{vendorPrice.toFixed(2)}
                            {snap?.unit_value && snap?.unit_type && (
                              <span className="ml-1">
                                ({snap.unit_value}{snap.unit_type})
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="font-medium">₹{lineTotal.toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Vendor earning = Σ(vendor_selling_price × qty) — full vendor price, no commission cut. */}
              <div className="border-t pt-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>Your earning</span>
                  <span className="tabular-nums">₹{vendorRevenue(selectedOrder).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default VendorOrders;
