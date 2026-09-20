import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart, Package, TrendingUp, Clock,
  CheckCircle, AlertCircle, Wallet
} from 'lucide-react';
import { DashboardLayout, vendorNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { vendorEarning } from '@/lib/vendorRevenue';

const VendorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: vendor } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ['vendor-stats', vendor?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      if (!vendor?.id) return null;
      
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfMonthIso = startOfMonth.toISOString();

      // Monthly revenue for vendor = Σ(vendor_selling_price × qty) on
      // DELIVERED orders only. No commission cut — vendor's earning per
      // unit is whatever vendor_selling_price they set. Snapshot lives
      // on order_items.product_snapshot.
      const [monthlyOrders, pendingOrders, products] = await Promise.all([
        supabase
          .from('orders')
          .select('id, status, order_items(quantity, unit_price, product_snapshot)')
          .eq('vendor_id', vendor.id)
          .eq('status', 'delivered')
          .gte('placed_at', startOfMonthIso),
        supabase.from('orders').select('id').eq('vendor_id', vendor.id).eq('status', 'pending'),
        supabase.from('products').select('id, status').eq('vendor_id', vendor.id),
      ]);

      const totalRevenue = (monthlyOrders.data || []).reduce(
        (sum, o: any) => sum + vendorEarning(o),
        0,
      );
      const pendingCount = pendingOrders.data?.length || 0;
      const outOfStockCount = products.data?.filter(p => p.status === 'out_of_stock').length || 0;

      return {
        totalOrders: monthlyOrders.data?.length || 0,
        pendingOrders: pendingCount,
        totalProducts: products.data?.length || 0,
        outOfStockCount,
        totalRevenue,
      };
    },
    enabled: !!vendor?.id,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ['vendor-recent-orders', vendor?.id],
    refetchInterval: 30000,
    queryFn: async () => {
      if (!vendor?.id) return [];
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, placed_at')
        .eq('vendor_id', vendor.id)
        .order('placed_at', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!vendor?.id,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'preparing': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!vendor) {
    return (
      <DashboardLayout
        title="Vendor Dashboard"
        navItems={vendorNavItems}
        roleColor="bg-purple-500 text-white"
        roleName="Vendor Panel"
      >
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">No Vendor Profile Found</h2>
            <p className="text-muted-foreground mb-4">
              You need to be registered as a vendor to access this dashboard.
              Please contact the admin team to be onboarded.
            </p>
            <Button variant="outline" onClick={() => navigate('/')}>Back to Home</Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Vendor Dashboard"
      navItems={vendorNavItems}
      roleColor="bg-purple-500 text-white"
      roleName="Vendor Panel"
    >
      {/* Store Status */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold truncate">{vendor.business_name}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{vendor.store_address}</p>
            </div>
            <Badge variant={vendor.is_accepting_orders ? 'default' : 'secondary'} className="shrink-0">
              {vendor.is_accepting_orders ? 'Accepting Orders' : 'Not Accepting'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid — 2 columns on phone, 5 on desktop (drop the awkward 1-col stage) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatsCard
          title="Monthly Orders"
          value={stats?.totalOrders || 0}
          icon={ShoppingCart}
          iconColor="bg-blue-100 text-blue-600"
        />
        <StatsCard
          title="Monthly Revenue"
          value={`₹${(stats?.totalRevenue || 0).toLocaleString()}`}
          icon={TrendingUp}
          iconColor="bg-green-100 text-green-600"
        />
        <StatsCard
          title="Amount Due"
          value={`₹${Number(vendor.amount_due || 0).toLocaleString()}`}
          icon={Wallet}
          iconColor="bg-orange-100 text-orange-600"
        />
        <StatsCard
          title="Active Products"
          value={stats?.totalProducts || 0}
          icon={Package}
          iconColor="bg-purple-100 text-purple-600"
        />
        <StatsCard
          title="Unavailable Products"
          value={stats?.outOfStockCount || 0}
          icon={AlertCircle}
          iconColor="bg-red-100 text-red-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentOrders?.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No orders yet</p>
              ) : (
                recentOrders?.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{order.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.placed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium text-sm">₹{Number(order.total_amount).toLocaleString()}</p>
                      <Badge className={getStatusColor(order.status)} variant="secondary">
                        {order.status}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-yellow-600" />
                <span className="font-medium">Pending Orders</span>
                {stats?.pendingOrders > 0 && (
                  <Badge variant="secondary" className="bg-yellow-200 text-yellow-800 ml-2">
                    {stats.pendingOrders}
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/vendor/orders')}>View All</Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Add New Product</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/vendor/products')}>Add</Button>
            </div>
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium">Update Inventory</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/vendor/products')}>Update</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default VendorDashboard;
