import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Package, Calendar } from 'lucide-react';
import { DashboardLayout, deliveryNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

const DeliveryEarnings: React.FC = () => {
  const { user } = useAuthStore();

  const { data: partner } = useQuery({
    queryKey: ['delivery-partner-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('delivery_partners')
        .select('*')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: stats } = useQuery({
    queryKey: ['delivery-earnings', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return null;
      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, delivery_fee')
        .eq('delivery_partner_id', partner.id)
        .eq('status', 'delivered');

      const totalEarnings = orders?.reduce((sum, o) => sum + Number(o.delivery_fee || 0), 0) || 0;

      return {
        totalDeliveries: orders?.length || 0,
        totalEarnings,
      };
    },
    enabled: !!partner?.id,
  });

  return (
    <DashboardLayout
      title="Earnings"
      navItems={deliveryNavItems}
      roleColor="bg-blue-500 text-white"
      roleName="Delivery Partner"
    >
      <div className="space-y-6">
        {/* Earnings Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">Total Earnings</p>
                  <p className="text-3xl font-bold">₹{(stats?.totalEarnings || 0).toLocaleString()}</p>
                </div>
                <TrendingUp className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Completed Deliveries</p>
                  <p className="text-3xl font-bold">{stats?.totalDeliveries || 0}</p>
                </div>
                <Package className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Rating</p>
                  <p className="text-3xl font-bold">{partner?.rating?.toFixed(1) || '0.0'} ⭐</p>
                </div>
                <Calendar className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder for Charts */}
        <Card>
          <CardHeader>
            <CardTitle>Earnings Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Charts will be displayed here once you have more data</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DeliveryEarnings;
