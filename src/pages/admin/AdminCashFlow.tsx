import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IndianRupee, Wallet, Receipt, Undo2, ArrowUpRight, Plus, Search,
  AlertCircle, CheckCircle, ChevronRight, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PartnerRow {
  id: string;
  name: string;
  phone: string | null;
  suspended: boolean;
  cashCollected: number;
  approvedBills: number;
  verifiedCollections: number;
  approvedCashReturns: number;
  recordedSettlements: number;
  netToTransfer: number;
  pendingBills: number;
  pendingCashReturns: number;
}

const AdminCashFlow: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-cash-flow'],
    queryFn: async () => {
      const [partnersRes, ordersRes, billsRes, collectionsRes, returnsRes, settlementsRes] = await Promise.all([
        supabase
          .from('delivery_partners')
          .select('id, full_name, phone, account_status')
          .order('full_name', { ascending: true }),
        supabase
          .from('orders')
          .select('id, order_number, total_amount, payment_method, delivered_at, delivery_partner_id, status')
          .eq('payment_method', 'cash')
          .eq('status', 'delivered' as any)
          .not('delivery_partner_id', 'is', null),
        supabase
          .from('delivery_bills')
          .select('id, delivery_partner_id, amount, description, bill_image_url, status, reviewed_at, created_at, order_id, orders:order_id(order_number)')
          .order('created_at', { ascending: false }),
        (supabase.from('credit_cash_collections') as any)
          .select('id, delivery_partner_id, customer_id, amount, status, collected_at')
          .eq('status', 'verified'),
        (supabase.from('cash_returns') as any)
          .select('id, delivery_partner_id, amount, description, status, reviewed_at, created_at')
          .order('created_at', { ascending: false }),
        (supabase.from('cash_settlements') as any)
          .select('id, delivery_partner_id, amount, notes, recorded_by, settled_at')
          .order('settled_at', { ascending: false }),
      ]);

      // Only partners is load-bearing; everything else degrades to [] on error
      // so a single bad query never blanks the page.
      if (partnersRes.error) throw partnersRes.error;
      if (ordersRes.error) console.warn('orders fetch failed', ordersRes.error);
      if (billsRes.error) console.warn('bills fetch failed', billsRes.error);
      if (collectionsRes.error) console.warn('collections fetch failed', collectionsRes.error);
      if (returnsRes.error) console.warn('returns fetch failed', returnsRes.error);
      // cash_settlements is the only brand-new table — degrade gracefully if
      // the migration hasn't run yet (page still shows everything else).
      const settlements = settlementsRes.error ? [] : (settlementsRes.data || []);

      // Fetch customer names for the verified-collections breakdown (separate
      // query because credit_cash_collections has no PostgREST FK to profiles).
      const collectionsRows = collectionsRes.error ? [] : (collectionsRes.data || []);
      const customerIds = Array.from(new Set(
        collectionsRows.map((c: any) => c.customer_id).filter(Boolean)
      ));
      let customerById = new Map<string, { full_name?: string; phone?: string }>();
      if (customerIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone')
          .in('user_id', customerIds);
        for (const p of (profilesData || []) as any[]) {
          customerById.set(p.user_id, { full_name: p.full_name, phone: p.phone });
        }
      }

      return {
        partners: partnersRes.data || [],
        orders: ordersRes.error ? [] : (ordersRes.data || []),
        bills: billsRes.error ? [] : (billsRes.data || []),
        collections: collectionsRows.map((c: any) => ({
          ...c,
          customer_name: customerById.get(c.customer_id)?.full_name || null,
        })),
        returns: returnsRes.error ? [] : (returnsRes.data || []),
        settlements,
      };
    },
  });

  const rows = useMemo<{ all: PartnerRow[]; hasMovement: PartnerRow[] }>(() => {
    if (!data) return { all: [], hasMovement: [] };
    const byPartner = new Map<string, PartnerRow>();

    for (const p of data.partners as any[]) {
      byPartner.set(p.id, {
        id: p.id,
        name: p.full_name || 'Unknown',
        phone: p.phone,
        suspended: p.account_status === 'suspended',
        cashCollected: 0,
        approvedBills: 0,
        verifiedCollections: 0,
        approvedCashReturns: 0,
        recordedSettlements: 0,
        netToTransfer: 0,
        pendingBills: 0,
        pendingCashReturns: 0,
      });
    }

    for (const o of data.orders as any[]) {
      const r = byPartner.get(o.delivery_partner_id);
      if (r) r.cashCollected += Number(o.total_amount || 0);
    }
    for (const b of data.bills as any[]) {
      const r = byPartner.get(b.delivery_partner_id);
      if (!r) continue;
      if (b.status === 'approved') r.approvedBills += Number(b.amount || 0);
      else if (b.status === 'pending') r.pendingBills += 1;
    }
    for (const c of data.collections as any[]) {
      const r = byPartner.get(c.delivery_partner_id);
      if (r) r.verifiedCollections += Number(c.amount || 0);
    }
    for (const cr of data.returns as any[]) {
      const r = byPartner.get(cr.delivery_partner_id);
      if (!r) continue;
      if (cr.status === 'approved') r.approvedCashReturns += Number(cr.amount || 0);
      else if (cr.status === 'pending') r.pendingCashReturns += 1;
    }
    for (const s of data.settlements as any[]) {
      const r = byPartner.get(s.delivery_partner_id);
      if (r) r.recordedSettlements += Number(s.amount || 0);
    }

    for (const r of byPartner.values()) {
      r.netToTransfer =
        r.cashCollected - r.approvedBills + r.verifiedCollections - r.approvedCashReturns - r.recordedSettlements;
    }

    const all = Array.from(byPartner.values());
    const hasMovement = all.filter(r =>
      r.cashCollected > 0 || r.recordedSettlements > 0 || r.approvedBills > 0 ||
      r.verifiedCollections > 0 || r.approvedCashReturns > 0 ||
      r.pendingBills > 0 || r.pendingCashReturns > 0
    );
    return { all, hasMovement };
  }, [data]);

  const visibleRows = useMemo(() => {
    const base = showAll ? rows.all : rows.hasMovement;
    return [...base].sort((a, b) => b.netToTransfer - a.netToTransfer);
  }, [rows, showAll]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return visibleRows;
    const q = search.toLowerCase();
    return visibleRows.filter(r =>
      r.name.toLowerCase().includes(q) || (r.phone || '').includes(q)
    );
  }, [visibleRows, search]);

  // Stats use the full set so totals don't change when toggling Show All.
  const allRows = rows.all;
  const totalOutstanding = allRows.filter(r => r.netToTransfer > 0).reduce((s, r) => s + r.netToTransfer, 0);
  const totalOverpaid = Math.abs(allRows.filter(r => r.netToTransfer < 0).reduce((s, r) => s + r.netToTransfer, 0));
  const partnersWithBalance = allRows.filter(r => Math.abs(r.netToTransfer) >= 1).length;
  const totalPendingActions = allRows.reduce((s, r) => s + r.pendingBills + r.pendingCashReturns, 0);

  const selectedPartner = selectedPartnerId ? allRows.find(r => r.id === selectedPartnerId) : null;

  const partnerDetail = useMemo(() => {
    if (!data || !selectedPartnerId) return null;
    return {
      orders: (data.orders as any[]).filter(o => o.delivery_partner_id === selectedPartnerId),
      bills: (data.bills as any[]).filter(b => b.delivery_partner_id === selectedPartnerId && b.status === 'approved'),
      collections: (data.collections as any[]).filter(c => c.delivery_partner_id === selectedPartnerId),
      returns: (data.returns as any[]).filter(r => r.delivery_partner_id === selectedPartnerId && r.status === 'approved'),
      settlements: (data.settlements as any[]).filter(s => s.delivery_partner_id === selectedPartnerId),
    };
  }, [data, selectedPartnerId]);

  const recordSettlementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPartnerId) throw new Error('No partner selected');
      const amt = parseFloat(settlementAmount);
      if (!amt || amt <= 0) throw new Error('Enter a valid amount');
      const { data: rpcData, error } = await (supabase as any).rpc('record_cash_settlement', {
        p_partner_id: selectedPartnerId,
        p_amount: amt,
        p_notes: settlementNotes || null,
      });
      if (error) throw error;
      return rpcData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-cash-flow'] });
      toast({ title: 'Settlement recorded' });
      setSettlementOpen(false);
      setSettlementAmount('');
      setSettlementNotes('');
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to record settlement',
        description: err.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const netCellClass = (n: number) => {
    if (Math.abs(n) < 1) return 'bg-green-50 text-green-700 border-green-200';
    if (n > 0) return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  return (
    <DashboardLayout title="Cash Flow" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Outstanding"
          value={`₹${totalOutstanding.toLocaleString()}`}
          icon={ArrowUpRight}
          iconColor="bg-red-100 text-red-600"
        />
        <StatsCard
          title="Overpaid"
          value={`₹${totalOverpaid.toLocaleString()}`}
          icon={Undo2}
          iconColor="bg-amber-100 text-amber-600"
        />
        <StatsCard
          title="Partners w/ balance"
          value={partnersWithBalance}
          icon={Wallet}
          iconColor="bg-blue-100 text-blue-600"
        />
        <StatsCard
          title="Pending actions"
          value={totalPendingActions}
          icon={Clock}
          iconColor="bg-yellow-100 text-yellow-600"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search partner by name or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant={showAll ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Active only' : 'Show all partners'}
              </Button>
              <p className="text-sm text-muted-foreground">
                {filteredRows.length} {filteredRows.length === 1 ? 'partner' : 'partners'}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p>No cash flow activity yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Cash collected</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                    <TableHead className="text-right">Credit collected</TableHead>
                    <TableHead className="text-right">Returns</TableHead>
                    <TableHead className="text-right" title="Cash already handed over to office">Paid out</TableHead>
                    <TableHead className="text-right">Net to transfer</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedPartnerId(r.id)}
                    >
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          {r.name}
                          {r.suspended && (
                            <Badge variant="destructive" className="text-[10px]">Suspended</Badge>
                          )}
                          {(r.pendingBills + r.pendingCashReturns) > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-yellow-100 text-yellow-800">
                              {r.pendingBills + r.pendingCashReturns} pending
                            </Badge>
                          )}
                        </div>
                        {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                      </TableCell>
                      <TableCell className="text-right">₹{r.cashCollected.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">−₹{r.approvedBills.toLocaleString()}</TableCell>
                      <TableCell className="text-right">+₹{r.verifiedCollections.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">−₹{r.approvedCashReturns.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">−₹{r.recordedSettlements.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn('inline-block px-2.5 py-1 rounded-md border font-bold', netCellClass(r.netToTransfer))}>
                          {r.netToTransfer < 0 ? `(₹${Math.abs(r.netToTransfer).toLocaleString()})` : `₹${r.netToTransfer.toLocaleString()}`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Partner detail sheet */}
      <Sheet open={!!selectedPartnerId} onOpenChange={(o) => !o && setSelectedPartnerId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              {selectedPartner?.name}
              {selectedPartner?.suspended && (
                <Badge variant="destructive" className="text-[10px]">Suspended</Badge>
              )}
            </SheetTitle>
            {selectedPartner?.phone && (
              <p className="text-sm text-muted-foreground">{selectedPartner.phone}</p>
            )}
          </SheetHeader>

          {selectedPartner && partnerDetail && (
            <div className="space-y-6 mt-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Cash collected</div>
                  <div className="font-bold text-lg">₹{selectedPartner.cashCollected.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Approved bills</div>
                  <div className="font-bold text-lg">−₹{selectedPartner.approvedBills.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Credit collected</div>
                  <div className="font-bold text-lg">+₹{selectedPartner.verifiedCollections.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Cash returned</div>
                  <div className="font-bold text-lg">−₹{selectedPartner.approvedCashReturns.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Settled (handed over)</div>
                  <div className="font-bold text-lg">−₹{selectedPartner.recordedSettlements.toLocaleString()}</div>
                </div>
                <div className={cn('rounded-lg border-2 p-3', netCellClass(selectedPartner.netToTransfer))}>
                  <div className="text-xs">Net to transfer</div>
                  <div className="font-extrabold text-lg">
                    {selectedPartner.netToTransfer < 0
                      ? `(₹${Math.abs(selectedPartner.netToTransfer).toLocaleString()})`
                      : `₹${selectedPartner.netToTransfer.toLocaleString()}`}
                  </div>
                </div>
              </div>

              <Button className="w-full" onClick={() => setSettlementOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Record Settlement
              </Button>

              {/* Delivered cash orders */}
              <Section title={`Delivered cash orders (${partnerDetail.orders.length})`} icon={IndianRupee}>
                {partnerDetail.orders.length === 0 ? (
                  <Empty>No delivered cash orders</Empty>
                ) : (
                  <SimpleTable
                    headers={['Order #', 'Amount', 'Delivered']}
                    rows={partnerDetail.orders.map((o: any) => [
                      o.order_number,
                      `₹${Number(o.total_amount).toLocaleString()}`,
                      o.delivered_at ? format(new Date(o.delivered_at), 'dd MMM, hh:mm a') : '-',
                    ])}
                  />
                )}
              </Section>

              {/* Approved bills */}
              <Section title={`Approved bills (${partnerDetail.bills.length})`} icon={Receipt}>
                {partnerDetail.bills.length === 0 ? (
                  <Empty>No approved bills</Empty>
                ) : (
                  <SimpleTable
                    headers={['Order', 'Amount', 'Description', 'Reviewed']}
                    rows={partnerDetail.bills.map((b: any) => [
                      (b.orders as any)?.order_number || '-',
                      `₹${Number(b.amount).toLocaleString()}`,
                      b.description || '-',
                      b.reviewed_at ? format(new Date(b.reviewed_at), 'dd MMM') : '-',
                    ])}
                  />
                )}
              </Section>

              {/* Verified credit collections */}
              <Section title={`Verified credit collections (${partnerDetail.collections.length})`} icon={Wallet}>
                {partnerDetail.collections.length === 0 ? (
                  <Empty>No verified collections</Empty>
                ) : (
                  <SimpleTable
                    headers={['Customer', 'Amount', 'Collected']}
                    rows={partnerDetail.collections.map((c: any) => [
                      c.customer_name || '-',
                      `₹${Number(c.amount).toLocaleString()}`,
                      c.collected_at ? format(new Date(c.collected_at), 'dd MMM') : '-',
                    ])}
                  />
                )}
              </Section>

              {/* Approved cash returns */}
              <Section title={`Approved cash returns (${partnerDetail.returns.length})`} icon={Undo2}>
                {partnerDetail.returns.length === 0 ? (
                  <Empty>No approved cash returns</Empty>
                ) : (
                  <SimpleTable
                    headers={['Amount', 'Description', 'Reviewed']}
                    rows={partnerDetail.returns.map((r: any) => [
                      `₹${Number(r.amount).toLocaleString()}`,
                      r.description || '-',
                      r.reviewed_at ? format(new Date(r.reviewed_at), 'dd MMM') : '-',
                    ])}
                  />
                )}
              </Section>

              {/* Settlement history */}
              <Section title={`Settlement history (${partnerDetail.settlements.length})`} icon={CheckCircle}>
                {partnerDetail.settlements.length === 0 ? (
                  <Empty>No settlements recorded yet</Empty>
                ) : (
                  <SimpleTable
                    headers={['Amount', 'Notes', 'Recorded']}
                    rows={partnerDetail.settlements.map((s: any) => [
                      `₹${Number(s.amount).toLocaleString()}`,
                      s.notes || '-',
                      format(new Date(s.settled_at), 'dd MMM, hh:mm a'),
                    ])}
                  />
                )}
              </Section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Record Settlement dialog */}
      <Dialog open={settlementOpen} onOpenChange={setSettlementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Settlement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPartner && (
              <div className="rounded-lg border p-3 bg-muted/50">
                <div className="text-xs text-muted-foreground">Partner</div>
                <div className="font-medium">{selectedPartner.name}</div>
                <div className="text-xs text-muted-foreground mt-1">Current net</div>
                <div className="font-bold">
                  {selectedPartner.netToTransfer < 0
                    ? `(₹${Math.abs(selectedPartner.netToTransfer).toLocaleString()})`
                    : `₹${selectedPartner.netToTransfer.toLocaleString()}`}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">Amount received *</label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Notes</label>
              <Textarea
                placeholder="e.g. handed over at office, UTR ref, etc."
                value={settlementNotes}
                onChange={(e) => setSettlementNotes(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Settlements cannot be edited or deleted later. Confirm the amount before submitting.</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettlementOpen(false)}>Cancel</Button>
            <Button
              onClick={() => recordSettlementMutation.mutate()}
              disabled={!settlementAmount || recordSettlementMutation.isPending}
            >
              {recordSettlementMutation.isPending ? 'Saving…' : 'Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const Section: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
      <Icon className="w-4 h-4 text-muted-foreground" />
      {title}
    </div>
    {children}
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-sm text-muted-foreground py-3 px-3 border rounded-md bg-muted/20">{children}</div>
);

const SimpleTable: React.FC<{ headers: string[]; rows: (string | number)[][] }> = ({ headers, rows }) => (
  <div className="border rounded-md overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => <TableCell key={j} className="text-sm">{c}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export default AdminCashFlow;
