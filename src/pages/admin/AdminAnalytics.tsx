import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, ShoppingCart, Users, Store, Package } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

const AdminAnalytics: React.FC = () => {
  const { data: stats } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const [orders, products, vendors, users] = await Promise.all([
        supabase.from('orders').select('id, status, total_amount, placed_at'),
        supabase.from('products').select('id, status'),
        supabase.from('vendors').select('id, status'),
        supabase.from('profiles').select('id, created_at'),
      ]);

      const totalRevenue = orders.data?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const deliveredOrders = orders.data?.filter(o => o.status === 'delivered').length || 0;
      const cancelledOrders = orders.data?.filter(o => o.status === 'cancelled').length || 0;
      const activeProducts = products.data?.filter(p => p.status === 'active').length || 0;
      const activeVendors = vendors.data?.filter(v => v.status === 'active').length || 0;

      return {
        totalOrders: orders.data?.length || 0,
        deliveredOrders,
        cancelledOrders,
        totalRevenue,
        totalProducts: products.data?.length || 0,
        activeProducts,
        totalVendors: vendors.data?.length || 0,
        activeVendors,
        totalUsers: users.data?.length || 0,
      };
    },
  });

  return (
    <DashboardLayout
      title="Analytics"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <div className="space-y-6">
        {/* Revenue Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">Total Revenue</p>
                  <p className="text-3xl font-bold">₹{(stats?.totalRevenue || 0).toLocaleString()}</p>
                </div>
                <TrendingUp className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Total Orders</p>
                  <p className="text-3xl font-bold">{stats?.totalOrders || 0}</p>
                </div>
                <ShoppingCart className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Total Users</p>
                  <p className="text-3xl font-bold">{stats?.totalUsers || 0}</p>
                </div>
                <Users className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Delivered Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-green-600">{stats?.deliveredOrders || 0}</span>
                <TrendingUp className="w-4 h-4 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Cancelled Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-red-600">{stats?.cancelledOrders || 0}</span>
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Products
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{stats?.activeProducts || 0}</span>
                <span className="text-sm text-muted-foreground">/ {stats?.totalProducts || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Vendors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{stats?.activeVendors || 0}</span>
                <span className="text-sm text-muted-foreground">/ {stats?.totalVendors || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder for Charts */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Charts will be displayed here once you have more data</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminAnalytics;
