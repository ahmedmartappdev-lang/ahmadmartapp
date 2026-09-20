import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wallet, TrendingUp, Banknote, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { DashboardLayout, vendorNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { vendorEarning } from '@/lib/vendorRevenue';

const VendorPayments: React.FC = () => {
  const { user } = useAuthStore();

  const { data: vendor } = useQuery({
    queryKey: ['vendor-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('vendors')
        .select('id, business_name, amount_due')
        .eq('user_id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Total earned = Σ(vendor_selling_price × qty) across all delivered
  // orders. No commission — vendor keeps the full price they set.
  const { data: totalEarned } = useQuery({
    queryKey: ['vendor-total-earned', vendor?.id],
    queryFn: async () => {
      if (!vendor?.id) return 0;
      const { data } = await supabase
        .from('orders')
        .select('id, order_items(quantity, unit_price, product_snapshot)')
        .eq('vendor_id', vendor.id)
        .eq('status', 'delivered');
      return (data || []).reduce((sum, o: any) => sum + vendorEarning(o), 0);
    },
    enabled: !!vendor?.id,
  });

  // Fetch payment transactions
  const { data: transactions } = useQuery({
    queryKey: ['vendor-payment-transactions', vendor?.id],
    queryFn: async () => {
      if (!vendor?.id) return [];
      const { data } = await (supabase
        .from('vendor_payment_transactions' as any) as any)
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!vendor?.id,
  });

  const amountDue = Number(vendor?.amount_due || 0);
  const totalPaid = transactions
    ?.filter((t: any) => t.transaction_type === 'credit')
    .reduce((s: number, t: any) => s + Number(t.amount), 0) || 0;

  return (
    <DashboardLayout
      title="Payments"
      navItems={vendorNavItems}
      roleColor="bg-purple-500 text-white"
      roleName="Vendor Panel"
    >
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-100">Amount Due</p>
                  <p className="text-3xl font-bold">₹{amountDue.toLocaleString()}</p>
                </div>
                <Wallet className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100">Total Earned</p>
                  <p className="text-3xl font-bold">₹{(totalEarned || 0).toLocaleString()}</p>
                </div>
                <TrendingUp className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100">Total Received</p>
                  <p className="text-3xl font-bold">₹{totalPaid.toLocaleString()}</p>
                </div>
                <Banknote className="w-12 h-12 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {!transactions || transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((txn: any) => {
                  const isPayment = txn.transaction_type === 'credit';
                  return (
                    <div key={txn.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPayment ? 'bg-green-100' : 'bg-orange-100'}`}>
                          {isPayment ? <ArrowDownLeft className="w-5 h-5 text-green-600" /> : <ArrowUpRight className="w-5 h-5 text-orange-600" />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{txn.description || (isPayment ? 'Payment Received' : 'Order Revenue')}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(txn.created_at).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                          {txn.transaction_id && (
                            <p className="text-xs text-muted-foreground">Ref: {txn.transaction_id}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${isPayment ? 'text-green-600' : 'text-orange-600'}`}>
                          {isPayment ? '+' : ''}₹{Number(txn.amount).toLocaleString()}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                          Due: ₹{Number(txn.balance_after).toLocaleString()}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default VendorPayments;
