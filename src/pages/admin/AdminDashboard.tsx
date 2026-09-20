import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ShoppingCart, Users, Store, TrendingUp, Clock, CheckCircle, Wallet, Receipt
} from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';

const AdminDashboard: React.FC = () => {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    refetchInterval: 30000,
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const startOfMonthIso = startOfMonth.toISOString();

      const [monthlyOrders, pendingOrders, products, vendors, users] = await Promise.all([
        // Revenue should only count orders that actually shipped; cancelled
        // and refunded orders inflate the headline number otherwise.
        supabase
          .from('orders')
          .select('total_amount, status')
          .gte('placed_at', startOfMonthIso)
          .not('status', 'in', '("cancelled","refunded")'),
        supabase.from('orders').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('products').select('id', { count: 'exact' }),
        supabase.from('vendors').select('id', { count: 'exact' }),
        supabase.from('profiles').select('id', { count: 'exact' }),
      ]);

      const totalRevenue = monthlyOrders.data?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;

      return {
        totalOrders: monthlyOrders.data?.length || 0,
        pendingOrders: pendingOrders.count || 0,
        totalProducts: products.count || 0,
        totalVendors: vendors.count || 0,
        totalUsers: users.count || 0,
        totalRevenue,
      };
    },
  });

  const { data: recentOrders } = useQuery({
    queryKey: ['admin-recent-orders'],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, placed_at, delivery_otp')
        .order('placed_at', { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  // Credit & Bills overview
  const { data: creditStats } = useQuery({
    queryKey: ['admin-dashboard-credit-stats'],
    queryFn: async () => {
      const [partners, pendingBills, approvedBills] = await Promise.all([
        supabase.from('delivery_partners').select('id, credit_balance'),
        supabase.from('delivery_bills').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('delivery_bills').select('amount').eq('status', 'approved'),
      ]);

      const totalCreditsOut = partners.data?.reduce((s, p) => s + Number(p.credit_balance), 0) || 0;
      const totalApprovedBills = approvedBills.data?.reduce((s, b) => s + Number(b.amount), 0) || 0;

      return {
        totalCreditsOut,
        pendingBillsCount: pendingBills.count || 0,
        totalApprovedBills,
      };
    },
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

  return (
    <DashboardLayout
      title="Admin Dashboard"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Monthly Orders"
          value={stats?.totalOrders || 0}
          icon={ShoppingCart}
          trend={{ value: 12, isPositive: true }}
          iconColor="bg-blue-100 text-blue-600"
        />
        <StatsCard
          title="Monthly Revenue"
          value={`₹${(stats?.totalRevenue || 0).toLocaleString()}`}
          icon={TrendingUp}
          trend={{ value: 8, isPositive: true }}
          iconColor="bg-green-100 text-green-600"
        />
        <StatsCard
          title="Active Vendors"
          value={stats?.totalVendors || 0}
          icon={Store}
          iconColor="bg-purple-100 text-purple-600"
        />
        <StatsCard
          title="Total Users"
          value={stats?.totalUsers || 0}
          icon={Users}
          trend={{ value: 5, isPositive: true }}
          iconColor="bg-orange-100 text-orange-600"
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
                  <div key={order.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(order.placed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">₹{Number(order.total_amount).toLocaleString()}</p>
                      <div className="flex items-center gap-1.5 justify-end">
                        <Badge className={getStatusColor(order.status)} variant="secondary">
                          {order.status}
                        </Badge>
                        {order.delivery_otp && (
                          <Badge className="bg-amber-100 text-amber-800 font-mono text-xs" variant="secondary">
                            OTP: {order.delivery_otp}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Credit & Bills Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Credit & Bills</CardTitle>
              <Link to="/admin/credits">
                <Button variant="outline" size="sm">Manage Credits</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-primary" />
                <span className="font-medium">Credits Outstanding</span>
              </div>
              <span className="text-2xl font-bold text-primary">₹{(creditStats?.totalCreditsOut || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Receipt className="w-5 h-5 text-yellow-600" />
                <span className="font-medium">Pending Bills</span>
              </div>
              <Link to="/admin/bills">
                <Badge className="bg-yellow-100 text-yellow-800 text-lg px-3 py-1 cursor-pointer" variant="secondary">
                  {creditStats?.pendingBillsCount || 0}
                </Badge>
              </Link>
            </div>
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium">Approved Bills Total</span>
              </div>
              <span className="text-2xl font-bold text-green-600">₹{(creditStats?.totalApprovedBills || 0).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;
