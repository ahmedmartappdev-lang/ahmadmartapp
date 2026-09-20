import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserSearch, Search, MapPin, Wallet, ShoppingBag, Save, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CustomerRow {
  user_id: string;
  full_name: string;
  phone: string | null;
  credit_balance: number;
  credit_limit: number;
  created_at: string;
  metadata: any;
}

const AdminCustomers: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone, credit_balance, credit_limit, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        console.error(error);
        return [];
      }
      return (data || []) as CustomerRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      c.user_id.includes(q)
    );
  }, [customers, search]);

  const selected = selectedUserId ? customers.find(c => c.user_id === selectedUserId) : null;

  React.useEffect(() => {
    setNotes(selected?.metadata?.admin_notes || '');
  }, [selected?.user_id]);

  const { data: detail } = useQuery({
    queryKey: ['customer-detail', selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return null;
      const [ordersRes, addressesRes, txnsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, status, total_amount, payment_method, placed_at, delivered_at')
          .eq('customer_id', selectedUserId)
          .order('placed_at', { ascending: false })
          .limit(50),
        supabase
          .from('user_addresses')
          .select('id, address_type, address_line1, address_line2, city, pincode, is_default')
          .eq('user_id', selectedUserId),
        supabase
          .from('customer_credit_transactions')
          .select('id, amount, transaction_type, description, created_at')
          .eq('customer_id', selectedUserId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      return {
        orders: ordersRes.error ? [] : (ordersRes.data || []),
        addresses: addressesRes.error ? [] : (addressesRes.data || []),
        transactions: txnsRes.error ? [] : (txnsRes.data || []),
      };
    },
    enabled: !!selectedUserId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ adminNotes }: { adminNotes?: string }) => {
      if (!selected) throw new Error('No customer selected');
      // Re-read the latest metadata immediately before merging so a
      // concurrent edit in another tab is less likely to be stomped.
      // Not a transaction — a proper jsonb_set RPC would be ideal — but
      // narrows the race window from "until next page load" to "until
      // this single round-trip".
      const { data: latest, error: readErr } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('user_id', selected.user_id)
        .single();
      if (readErr) throw readErr;
      const newMeta = { ...((latest?.metadata as any) || {}) };
      if (adminNotes !== undefined) newMeta.admin_notes = adminNotes;
      const { error } = await supabase
        .from('profiles')
        .update({ metadata: newMeta } as any)
        .eq('user_id', selected.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      toast({ title: 'Saved' });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: err.message, variant: 'destructive' }),
  });

  const addCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!addName.trim()) throw new Error('Name is required');
      const cleanPhone = addPhone.replace(/\D/g, '');
      if (cleanPhone.length !== 10) throw new Error('Phone must be exactly 10 digits');

      const { data, error } = await supabase.functions.invoke('admin-create-customer', {
        body: {
          full_name: addName.trim(),
          phone: cleanPhone,
          email: addEmail.trim() || null,
        },
      });

      if (error) {
        // Pull the real error from the response body — supabase-js wraps any
        // 4xx/5xx as a generic "non-2xx" message which hides validation errors.
        let msg = error.message || 'Unknown error';
        let status: number | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx) {
            status = ctx.status;
            if (typeof ctx.json === 'function') {
              const body = await ctx.json();
              if (body?.error) msg = body.error;
            }
          }
        } catch { /* fall through */ }
        if (status === 404) throw new Error(`Edge function 'admin-create-customer' not deployed`);
        throw new Error(msg);
      }
      if (!data?.ok) throw new Error(data?.error || 'Could not create customer');
      return data as { user_id: string; existed: boolean };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
      toast({ title: data.existed ? 'Existing customer matched by phone' : 'Customer added' });
      setSelectedUserId(data.user_id);
      setAddOpen(false);
      setAddName('');
      setAddPhone('');
      setAddEmail('');
    },
    onError: (err: any) => toast({
      title: 'Failed to add customer',
      description: err.message || 'Unknown error',
      variant: 'destructive',
    }),
  });

  return (
    <DashboardLayout title="Customer 360" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserSearch className="w-4 h-4" /> Customers
              </CardTitle>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Name or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No customers</div>
              ) : (
                filtered.slice(0, 100).map((c) => (
                  <button
                    key={c.user_id}
                    className={`w-full text-left p-2 rounded hover:bg-muted/50 ${selectedUserId === c.user_id ? 'bg-muted' : ''}`}
                    onClick={() => setSelectedUserId(c.user_id)}
                  >
                    <div className="font-medium text-sm">
                      {c.full_name || 'Unnamed'}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.phone || '—'}</div>
                  </button>
                ))
              )}
              {filtered.length > 100 && (
                <div className="text-xs text-muted-foreground text-center py-2">Showing 100 of {filtered.length}. Refine search.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="text-center py-16 text-muted-foreground">
                <UserSearch className="w-12 h-12 mx-auto mb-3 opacity-40" />
                Select a customer to see their full record
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-xl font-bold">{selected.full_name}</h2>
                      <p className="text-sm text-muted-foreground">{selected.phone || '—'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Joined {format(new Date(selected.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Due balance</div>
                      <div className="font-bold text-lg">₹{Number(selected.credit_balance || 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">Credit limit</div>
                      <div className="font-bold text-lg">₹{Number(selected.credit_limit || 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> Orders</div>
                      <div className="font-bold text-lg">{detail?.orders.length || 0}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Admin notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Internal notes about this customer (visible only to admins)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                  <Button size="sm" onClick={() => saveMutation.mutate({ adminNotes: notes })} disabled={saveMutation.isPending}>
                    <Save className="w-4 h-4 mr-1" /> Save notes
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4" /> Recent orders ({detail?.orders.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!detail?.orders.length ? (
                    <div className="text-sm text-muted-foreground text-center py-4">No orders</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Placed</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.orders.map((o: any) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-medium">{o.order_number}</TableCell>
                            <TableCell><Badge variant="secondary" className="text-[10px]">{o.status}</Badge></TableCell>
                            <TableCell className="text-right">₹{Number(o.total_amount).toLocaleString()}</TableCell>
                            <TableCell className="text-sm">{format(new Date(o.placed_at), 'dd MMM, hh:mm a')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Addresses ({detail?.addresses.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!detail?.addresses.length ? (
                    <div className="text-sm text-muted-foreground text-center py-4">No addresses</div>
                  ) : (
                    <div className="space-y-2">
                      {detail.addresses.map((a: any) => (
                        <div key={a.id} className="border rounded p-3 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{a.address_type || 'address'}</span>
                            {a.is_default && <Badge variant="secondary" className="text-[10px]">default</Badge>}
                          </div>
                          <div className="text-muted-foreground">
                            {[a.address_line1, a.address_line2, a.city, a.pincode].filter(Boolean).join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> Credit transactions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!detail?.transactions.length ? (
                    <div className="text-sm text-muted-foreground text-center py-4">No transactions</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.transactions.map((t: any) => (
                          <TableRow key={t.id}>
                            <TableCell><Badge variant="secondary" className="text-[10px]">{t.transaction_type}</Badge></TableCell>
                            <TableCell className="text-right">₹{Number(t.amount).toLocaleString()}</TableCell>
                            <TableCell className="text-sm">{t.description || '—'}</TableCell>
                            <TableCell className="text-sm">{format(new Date(t.created_at), 'dd MMM')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Add Customer dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Full name *</label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Customer name" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Phone (10 digits) *</label>
              <Input
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9999999999"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email (optional)</label>
              <Input value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            <p className="text-xs text-muted-foreground">
              If a customer with this phone already exists, they'll be matched instead of duplicated.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addCustomerMutation.mutate()}
              disabled={!addName.trim() || addPhone.length !== 10 || addCustomerMutation.isPending}
            >
              {addCustomerMutation.isPending ? 'Adding…' : 'Add customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminCustomers;
