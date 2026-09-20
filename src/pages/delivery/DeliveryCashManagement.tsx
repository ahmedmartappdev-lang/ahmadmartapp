import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, IndianRupee, Receipt, ArrowUpRight, Plus, Clock, CheckCircle, XCircle, Undo2 } from 'lucide-react';
import { DashboardLayout, deliveryNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PaymentStatusBadge } from '@/components/shared/PaymentStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ImageUpload } from '@/components/ui/image-upload';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const DeliveryCashManagement: React.FC = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [billImage, setBillImage] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDescription, setBillDescription] = useState('');
  const [billOrderId, setBillOrderId] = useState('');
  const [cashReturnOpen, setCashReturnOpen] = useState(false);
  const [returnAmount, setReturnAmount] = useState('');
  const [returnDescription, setReturnDescription] = useState('');

  // Get partner profile
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

  // Delivered orders
  const { data: deliveredOrders } = useQuery({
    queryKey: ['delivery-cash-orders', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, payment_method, payment_status, delivered_at')
        .eq('delivery_partner_id', partner.id)
        .eq('status', 'delivered' as any)
        .order('delivered_at', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  // Bills
  const { data: bills } = useQuery({
    queryKey: ['delivery-bills', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase
        .from('delivery_bills')
        .select('*, orders:order_id(order_number)')
        .eq('delivery_partner_id', partner.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  // Cash returns
  const { data: cashReturns } = useQuery({
    queryKey: ['delivery-cash-returns', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await (supabase.from('cash_returns') as any)
        .select('*')
        .eq('delivery_partner_id', partner.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  // Verified cash collections (credit payments assigned to this partner by admin)
  const { data: verifiedCollections } = useQuery({
    queryKey: ['delivery-verified-collections', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await (supabase.from('credit_cash_collections') as any)
        .select('*')
        .eq('delivery_partner_id', partner.id)
        .eq('status', 'verified');
      return data || [];
    },
    enabled: !!partner?.id,
  });

  // Settlements admin has recorded for this partner (cash physically handed over)
  const { data: settlements } = useQuery({
    queryKey: ['delivery-settlements', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      // Tolerant of pre-migration state: if cash_settlements doesn't exist
      // yet, return [] instead of breaking the page.
      const { data, error } = await (supabase.from('cash_settlements') as any)
        .select('*')
        .eq('delivery_partner_id', partner.id)
        .order('settled_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!partner?.id,
  });

  const submitBillMutation = useMutation({
    mutationFn: async () => {
      if (!partner?.id || !billImage || !billAmount) throw new Error('Missing fields');
      const { error } = await supabase.from('delivery_bills').insert({
        delivery_partner_id: partner.id,
        order_id: billOrderId || null,
        bill_image_url: billImage,
        amount: parseFloat(billAmount),
        description: billDescription || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-bills'] });
      toast({ title: 'Bill submitted successfully' });
      setSubmitOpen(false);
      setBillImage('');
      setBillAmount('');
      setBillDescription('');
      setBillOrderId('');
    },
    onError: (err: any) => {
      toast({ title: 'Failed to submit bill', description: err.message, variant: 'destructive' });
    },
  });

  const submitCashReturnMutation = useMutation({
    mutationFn: async () => {
      if (!partner?.id || !returnAmount) throw new Error('Missing fields');
      const { error } = await (supabase.from('cash_returns') as any).insert({
        delivery_partner_id: partner.id,
        amount: parseFloat(returnAmount),
        description: returnDescription || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery-cash-returns'] });
      toast({ title: 'Cash return request submitted' });
      setCashReturnOpen(false);
      setReturnAmount('');
      setReturnDescription('');
    },
    onError: (err: any) => {
      toast({ title: 'Failed to submit', description: err.message, variant: 'destructive' });
    },
  });

  const cashCollected = deliveredOrders?.filter(o => o.payment_method === 'cash').reduce((s, o) => s + Number(o.total_amount), 0) || 0;
  const approvedBills = bills?.filter(b => b.status === 'approved').reduce((s, b) => s + Number(b.amount), 0) || 0;
  const verifiedCollectionTotal = verifiedCollections?.reduce((s: number, c: any) => s + Number(c.amount), 0) || 0;
  const approvedCashReturns = cashReturns?.filter((r: any) => r.status === 'approved').reduce((s: number, r: any) => s + Number(r.amount), 0) || 0;
  const recordedSettlements = settlements?.reduce((s: number, x: any) => s + Number(x.amount), 0) || 0;
  const netToTransfer = cashCollected - approvedBills + verifiedCollectionTotal - approvedCashReturns - recordedSettlements;

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-muted text-muted-foreground';
  };

  if (!partner) {
    return (
      <DashboardLayout title="Cash Management" navItems={deliveryNavItems} roleColor="bg-blue-500 text-white" roleName="Delivery Partner">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No delivery partner profile found.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Cash Management" navItems={deliveryNavItems} roleColor="bg-blue-500 text-white" roleName="Delivery Partner">
      {/* Summary Cards — Settled hidden per admin/client decision; netToTransfer math still subtracts it internally */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatsCard title="Lifetime Cash Collected" value={`₹${cashCollected.toLocaleString()}`} icon={IndianRupee} iconColor="bg-green-100 text-green-600" />
        <StatsCard title="Approved Bills" value={`₹${approvedBills.toLocaleString()}`} icon={Receipt} iconColor="bg-blue-100 text-blue-600" />
        <StatsCard title="Cash Returned" value={`₹${approvedCashReturns.toLocaleString()}`} icon={Undo2} iconColor="bg-purple-100 text-purple-600" />
        <StatsCard title="Net to Transfer" value={`₹${netToTransfer.toLocaleString()}`} icon={ArrowUpRight} iconColor="bg-orange-100 text-orange-600" />
      </div>

      <Tabs defaultValue="orders" className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="orders">Delivered Orders</TabsTrigger>
            <TabsTrigger value="bills">My Bills</TabsTrigger>
            <TabsTrigger value="cash_returned">Cash Returned</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setSubmitOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Submit Bill
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCashReturnOpen(true)}>
              <Undo2 className="w-4 h-4 mr-1" /> Return Cash
            </Button>
          </div>
        </div>

        <TabsContent value="orders">
          <Card>
            <CardContent className="pt-6">
              {deliveredOrders?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No delivered orders yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead colSpan={2}>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Delivered</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveredOrders?.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_number}</TableCell>
                          <TableCell colSpan={2}>
                            <PaymentStatusBadge order={order as any} variant="compact" />
                          </TableCell>
                          <TableCell className="text-right font-medium">₹{Number(order.total_amount).toLocaleString()}</TableCell>
                          <TableCell>{order.delivered_at ? format(new Date(order.delivered_at), 'dd MMM, hh:mm a') : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bills">
          <Card>
            <CardContent className="pt-6">
              {bills?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No bills submitted yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills?.map((bill) => (
                        <TableRow key={bill.id}>
                          <TableCell>{(bill.orders as any)?.order_number || '-'}</TableCell>
                          <TableCell className="font-medium">₹{Number(bill.amount).toLocaleString()}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{bill.description || '-'}</TableCell>
                          <TableCell>
                            <Badge className={getStatusBadge(bill.status)} variant="secondary">{bill.status}</Badge>
                          </TableCell>
                          <TableCell>{format(new Date(bill.created_at), 'dd MMM, hh:mm a')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cash_returned">
          <Card>
            <CardContent className="pt-6">
              {!cashReturns || cashReturns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Undo2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No cash return requests yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Admin Notes</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashReturns.map((cr: any) => (
                        <TableRow key={cr.id}>
                          <TableCell className="font-medium">₹{Number(cr.amount).toLocaleString()}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{cr.description || '-'}</TableCell>
                          <TableCell>
                            <Badge className={getStatusBadge(cr.status)} variant="secondary">{cr.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{cr.admin_notes || '-'}</TableCell>
                          <TableCell>{format(new Date(cr.created_at), 'dd MMM, hh:mm a')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submit Bill Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Bill Image *</label>
              <ImageUpload value={billImage} onChange={setBillImage} bucket="bill-images" />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Amount *</label>
              <Input type="number" placeholder="Enter amount" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Related Order (optional)</label>
              <Select value={billOrderId} onValueChange={setBillOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select order" />
                </SelectTrigger>
                <SelectContent>
                  {deliveredOrders?.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} - ₹{Number(order.total_amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <Textarea placeholder="What is this bill for?" value={billDescription} onChange={(e) => setBillDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submitBillMutation.mutate()}
              disabled={!billImage || !billAmount || submitBillMutation.isPending}
            >
              {submitBillMutation.isPending ? 'Submitting...' : 'Submit Bill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Cash Dialog */}
      <Dialog open={cashReturnOpen} onOpenChange={setCashReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Cash to Admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Amount *</label>
              <Input type="number" placeholder="Enter amount" value={returnAmount} onChange={(e) => setReturnAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description</label>
              <Textarea placeholder="Any notes about this cash return..." value={returnDescription} onChange={(e) => setReturnDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashReturnOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submitCashReturnMutation.mutate()}
              disabled={!returnAmount || submitCashReturnMutation.isPending}
            >
              {submitCashReturnMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DeliveryCashManagement;
