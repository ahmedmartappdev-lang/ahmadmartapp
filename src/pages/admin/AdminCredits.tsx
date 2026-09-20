import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, Plus, Search, Eye, CreditCard, AlertTriangle, CheckCircle, XCircle, Banknote, Store } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';

const AdminCredits: React.FC = () => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'set_limit' | 'record_payment'>('set_limit');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  // Optional delivery-partner picker for the Record Payment dialog.
  // When set, the recorded payment is ALSO mirrored into
  // credit_cash_collections so the partner's "net to transfer" drops.
  const [selectedDeliveryPartnerId, setSelectedDeliveryPartnerId] = useState('');
  const [showTransactionsDialog, setShowTransactionsDialog] = useState(false);
  const [transactionsCustomerId, setTransactionsCustomerId] = useState('');
  const [transactionsCustomerName, setTransactionsCustomerName] = useState('');
  const [showVendorPaymentDialog, setShowVendorPaymentDialog] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [vendorPaymentAmount, setVendorPaymentAmount] = useState('');
  const [vendorTransactionId, setVendorTransactionId] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Fetch customers
  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['admin-customer-credits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, phone, credit_balance, credit_limit')
        .order('full_name');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // Fetch transactions for a specific customer
  const { data: customerTransactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['admin-customer-transactions', transactionsCustomerId],
    queryFn: async () => {
      if (!transactionsCustomerId) return [];
      const { data, error } = await (supabase
        .from('customer_credit_transactions') as any)
        .select('*')
        .eq('customer_id', transactionsCustomerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!transactionsCustomerId,
  });

  // Set credit limit mutation — uses admin_set_credit_limit RPC (atomic,
  // and crucially does NOT insert a customer_credit_transactions row.
  // Pre-fix this used a fake 'credit' txn that made the limit change look
  // like a payment received in the customer's credit history.
  const setLimitMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt < 0) throw new Error('Invalid amount');
      if (!selectedCustomerId) throw new Error('Select a customer');

      const { error } = await (supabase.rpc as any)('admin_set_credit_limit', {
        p_customer_id: selectedCustomerId,
        p_new_limit: amt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-credits'] });
      toast({ title: 'Credit limit updated' });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: err.message || 'Failed', variant: 'destructive' });
    },
  });

  // Active delivery partners — drives the optional "Collected by Delivery
  // Agent" dropdown on the Record Payment dialog.
  const { data: deliveryPartners } = useQuery({
    queryKey: ['admin-delivery-partners-for-credits'],
    queryFn: async () => {
      const { data } = await supabase
        .from('delivery_partners')
        .select('id, full_name, phone, account_status')
        .order('full_name');
      return ((data as any[]) || []).filter(d => d.account_status !== 'suspended');
    },
  });

  // Record payment mutation (reduces due amount) — atomic via RPC. If
  // an agent was selected, also mirror the amount into
  // credit_cash_collections (status=verified) so the partner's
  // net-to-transfer formula picks it up.
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!selectedCustomerId) throw new Error('Select a customer');

      const { error } = await (supabase.rpc as any)('admin_record_credit_payment', {
        p_customer_id: selectedCustomerId,
        p_amount: amt,
        p_description: description || 'Payment received - Due reduced',
      });
      if (error) throw error;

      if (selectedDeliveryPartnerId) {
        const nowIso = new Date().toISOString();
        const { error: ccErr } = await (supabase
          .from('credit_cash_collections' as any) as any)
          .insert({
            customer_id: selectedCustomerId,
            delivery_partner_id: selectedDeliveryPartnerId,
            amount: amt,
            status: 'verified',
            verified_by: user?.id,
            verified_at: nowIso,
            collected_at: nowIso,
            notes: description || 'Cash collected for credit payment',
          });
        if (ccErr) throw ccErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-credits'] });
      toast({ title: 'Payment recorded successfully' });
      closeDialog();
    },
    onError: (err: any) => {
      toast({ title: err.message || 'Failed', variant: 'destructive' });
    },
  });

  const closeDialog = () => {
    setShowCreditDialog(false);
    setSelectedCustomerId('');
    setAmount('');
    setDescription('');
    setSelectedDeliveryPartnerId('');
  };

  const filteredCustomers = customers?.filter(c =>
    c.full_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  ) || [];

  const totalCreditLimits = customers?.reduce((s, c) => s + Number(c.credit_limit || 0), 0) || 0;
  // "Total Due Amount" reflects what customers actually owe (positive balances
  // only). A signed sum would mix in negative balances from refunds and
  // pre-payments, producing a misleading number that doesn't reconcile with
  // the "Customers With Due" count.
  const totalDueAmount = customers?.reduce((s, c) => s + Math.max(0, Number(c.credit_balance || 0)), 0) || 0;
  const customersWithDue = customers?.filter(c => Number(c.credit_balance || 0) > 0).length || 0;

  // Vendor dues
  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['admin-vendor-dues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, business_name, phone, amount_due')
        .order('business_name');
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const totalVendorDues = vendors?.reduce((s, v) => s + Number(v.amount_due || 0), 0) || 0;

  const filteredVendors = vendors?.filter(v =>
    v.business_name?.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    v.phone?.includes(vendorSearch)
  ) || [];

  const closeVendorDialog = () => {
    setShowVendorPaymentDialog(false);
    setSelectedVendorId('');
    setVendorPaymentAmount('');
    setVendorTransactionId('');
  };

  const vendorPaymentMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(vendorPaymentAmount);
      if (!amt || amt <= 0) throw new Error('Invalid amount');
      if (!selectedVendorId) throw new Error('Select a vendor');

      const { error } = await (supabase.rpc as any)('admin_record_vendor_payment', {
        p_vendor_id: selectedVendorId,
        p_amount: amt,
        p_description: `Payment of ₹${amt.toLocaleString()} made to vendor`,
        p_transaction_id: vendorTransactionId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendor-dues'] });
      toast({ title: 'Vendor payment recorded successfully' });
      closeVendorDialog();
    },
    onError: (err: any) => {
      toast({ title: err.message || 'Failed', variant: 'destructive' });
    },
  });

  return (
    <DashboardLayout title="Credit Management" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatsCard title="Total Credit Limits" value={`₹${totalCreditLimits.toLocaleString()}`} icon={CreditCard} iconColor="bg-primary/10 text-primary" />
        <StatsCard title="Total Due Amount" value={`₹${totalDueAmount.toLocaleString()}`} icon={AlertTriangle} iconColor="bg-destructive/10 text-destructive" />
        <StatsCard title="Customers with Due" value={customersWithDue} icon={Wallet} iconColor="bg-orange-100 text-orange-600" />
        <StatsCard title="Vendor Dues" value={`₹${totalVendorDues.toLocaleString()}`} icon={Store} iconColor="bg-purple-100 text-purple-600" />
      </div>

      <Tabs defaultValue="credits" className="space-y-4">
      <TabsList>
        <TabsTrigger value="credits">Customer Credits</TabsTrigger>
        <TabsTrigger value="vendor-dues">Vendor Dues</TabsTrigger>
      </TabsList>

      <TabsContent value="credits">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>Customer Credits</CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search customer..." className="pl-9 w-full sm:w-[200px]" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              </div>
              <Button onClick={() => { setDialogMode('set_limit'); setShowCreditDialog(true); }}>
                <Plus className="w-4 h-4 mr-2" />Set Limit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {customersLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No customers found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Credit Limit</TableHead>
                    <TableHead className="text-right">Due Amount</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => {
                    const limit = Number(customer.credit_limit || 0);
                    const due = Number(customer.credit_balance || 0);
                    const available = Math.max(0, limit - due);
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.full_name || 'Unnamed'}</TableCell>
                        <TableCell>{customer.phone || '-'}</TableCell>
                        <TableCell className="text-right font-bold">₹{limit.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {due > 0 ? (
                            <Badge variant="destructive" className="font-bold">₹{due.toLocaleString()}</Badge>
                          ) : (
                            <span className="text-muted-foreground">₹0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">₹{available.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="outline" size="sm" onClick={() => {
                              setTransactionsCustomerId(customer.user_id);
                              setTransactionsCustomerName(customer.full_name || 'Customer');
                              setShowTransactionsDialog(true);
                            }}>
                              <Eye className="w-3 h-3 mr-1" />Txns
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => {
                              setSelectedCustomerId(customer.user_id);
                              setDialogMode('set_limit');
                              setAmount(String(limit));
                              setShowCreditDialog(true);
                            }}>
                              <CreditCard className="w-3 h-3 mr-1" />Limit
                            </Button>
                            {/* Always allow recording a payment — admin sometimes
                                needs to credit a customer who has a zero balance
                                (e.g. compensating an over-collection). */}
                            {(
                              <Button variant={due > 0 ? 'default' : 'outline'} size="sm" onClick={() => {
                                setSelectedCustomerId(customer.user_id);
                                setDialogMode('record_payment');
                                setShowCreditDialog(true);
                              }}>
                                <Plus className="w-3 h-3 mr-1" />Payment
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="vendor-dues">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Store className="w-5 h-5" />
                Vendor Dues
              </CardTitle>
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search vendor..." className="pl-9 w-full sm:w-[200px]" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {vendorsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredVendors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No vendors found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-right">Amount Due</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendors.map((v) => {
                      const due = Number(v.amount_due || 0);
                      return (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.business_name}</TableCell>
                          <TableCell>{v.phone || '-'}</TableCell>
                          <TableCell className="text-right">
                            {due > 0 ? (
                              <Badge variant="destructive" className="font-bold">₹{due.toLocaleString()}</Badge>
                            ) : (
                              <span className="text-muted-foreground">₹0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedVendorId(v.id);
                                setShowVendorPaymentDialog(true);
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" />Payment
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>

      {/* Set Limit / Record Payment Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === 'set_limit' ? 'Set Credit Limit' : 'Record Payment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Customer</label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name || 'Unnamed'} — Limit: ₹{Number(c.credit_limit || 0).toLocaleString()} | Due: ₹{Number(c.credit_balance || 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {dialogMode === 'set_limit' ? 'Credit Limit Amount' : 'Payment Amount'}
              </label>
              <Input type="number" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <Textarea placeholder="Reason..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {dialogMode === 'record_payment' && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Collected by Delivery Agent (optional)
                </label>
                <Select value={selectedDeliveryPartnerId} onValueChange={setSelectedDeliveryPartnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select delivery agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryPartners?.map((dp: any) => (
                      <SelectItem key={dp.id} value={dp.id}>
                        {dp.full_name || 'Unnamed'} {dp.phone ? `(${dp.phone})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  If cash was collected via a delivery agent, select them — the
                  amount will count against their net-to-transfer.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={() => dialogMode === 'set_limit' ? setLimitMutation.mutate() : recordPaymentMutation.mutate()}
              disabled={(dialogMode === 'set_limit' ? setLimitMutation.isPending : recordPaymentMutation.isPending) || !selectedCustomerId || !amount}
            >
              {(dialogMode === 'set_limit' ? setLimitMutation.isPending : recordPaymentMutation.isPending)
                ? 'Processing...'
                : dialogMode === 'set_limit' ? 'Set Limit' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Transactions Dialog */}
      <Dialog open={showTransactionsDialog} onOpenChange={(open) => {
        if (!open) { setShowTransactionsDialog(false); setTransactionsCustomerId(''); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transactions — {transactionsCustomerName}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {transactionsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : !customerTransactions || customerTransactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No transactions</div>
            ) : (
              <div className="space-y-2">
                {customerTransactions.map((txn: any) => {
                  const isCredit = txn.transaction_type === 'credit' || txn.transaction_type === 'refund';
                  return (
                    <div key={txn.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{txn.description || txn.transaction_type}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(txn.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                          {isCredit ? '+' : '-'}₹{Number(txn.amount).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">Due: ₹{Number(txn.balance_after).toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Vendor Payment Dialog */}
      <Dialog open={showVendorPaymentDialog} onOpenChange={(open) => { if (!open) closeVendorDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Vendor Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Vendor</label>
              <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors?.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.business_name} — Due: ₹{Number(v.amount_due || 0).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Payment Amount</label>
              <Input type="number" placeholder="Enter amount" value={vendorPaymentAmount} onChange={(e) => setVendorPaymentAmount(e.target.value)} min="0" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Transaction ID (UPI/Bank Ref)</label>
              <Input placeholder="Enter transaction ID" value={vendorTransactionId} onChange={(e) => setVendorTransactionId(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeVendorDialog}>Cancel</Button>
            <Button
              onClick={() => vendorPaymentMutation.mutate()}
              disabled={vendorPaymentMutation.isPending || !selectedVendorId || !vendorPaymentAmount}
            >
              {vendorPaymentMutation.isPending ? 'Processing...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminCredits;
