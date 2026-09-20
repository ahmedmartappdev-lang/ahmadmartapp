import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, MapPin } from 'lucide-react';
import { DashboardLayout, deliveryNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { OrderDetailsDialog } from '@/components/customer/OrderDetailsDialog';

const DeliveryHistory: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [open, setOpen] = useState(false);

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
    queryKey: ['delivery-history', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      // Include order_items + vendor so the preview modal has everything
      // it needs. Prior query was select('*') only — modal showed empty.
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*), vendor:vendors(business_name)')
        .eq('delivery_partner_id', partner.id)
        .in('status', ['delivered', 'cancelled'])
        .order('delivered_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!partner?.id,
  });

  const getStatusColor = (status: string) => {
    return status === 'delivered' 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  return (
    <DashboardLayout
      title="Order History"
      navItems={deliveryNavItems}
      roleColor="bg-blue-500 text-white"
      roleName="Delivery Partner"
    >
      <Card>
        <CardHeader>
          <CardTitle>Completed Deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : orders?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No completed deliveries yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Delivered At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders?.map((order) => (
                    <TableRow
                      key={order.id}
                      onClick={() => { setSelectedOrder(order); setOpen(true); }}
                      className="cursor-pointer hover:bg-muted/40"
                    >
                      <TableCell className="font-medium">{order.order_number}</TableCell>
                      <TableCell>
                        {order.delivered_at
                          ? new Date(order.delivered_at).toLocaleDateString()
                          : new Date(order.placed_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(order.status)} variant="secondary">
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{Number(order.total_amount).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reuses the customer-side order details dialog — items, bill
          summary, payment, cancellation reason. No onRate prop, so the
          Rate button stays hidden (delivery partner can't review). */}
      <OrderDetailsDialog
        order={selectedOrder}
        open={open}
        onOpenChange={setOpen}
      />
    </DashboardLayout>
  );
};

export default DeliveryHistory;
