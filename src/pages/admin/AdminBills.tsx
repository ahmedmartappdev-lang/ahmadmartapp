import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, CheckCircle, XCircle, Clock, Eye, Undo2 } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { format } from 'date-fns';

const AdminBills: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [cashReturnNotes, setCashReturnNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: bills, isLoading } = useQuery({
    queryKey: ['admin-bills', statusFilter, partnerFilter],
    queryFn: async () => {
      let query = supabase
        .from('delivery_bills')
        .select('*, delivery_partners:delivery_partner_id(id, full_name, phone), orders:order_id(order_number)')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as any);
      }
      if (partnerFilter !== 'all') {
        query = query.eq('delivery_partner_id', partnerFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Cash returns
  const { data: cashReturns, isLoading: cashReturnsLoading } = useQuery({
    queryKey: ['admin-cash-returns', partnerFilter],
    queryFn: async () => {
      let query = (supabase.from('cash_returns') as any)
        .select('*, delivery_partners:delivery_partner_id(id, full_name, phone)')
        .order('created_at', { ascending: false });
      if (partnerFilter !== 'all') {
        query = query.eq('delivery_partner_id', partnerFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Partners list for the filter dropdown
  const { data: partners = [] } = useQuery({
    queryKey: ['admin-bills-partners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('delivery_partners')
        .select('id, full_name, phone')
        .order('full_name', { ascending: true });
      return data || [];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ billId, status, notes }: { billId: string; status: string; notes: string }) => {
      const { error } = await supabase
        .from('delivery_bills')
        .update({
          status: status as any,
          admin_notes: notes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', billId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-bills'] });
      toast({ title: `Bill ${reviewAction} successfully` });
      setSelectedBill(null);
      setReviewAction(null);
      setAdminNotes('');
    },
    onError: () => {
      toast({ title: 'Failed to update bill', variant: 'destructive' });
    },
  });

  const reviewCashReturnMutation = useMutation({
    mutationFn: async ({ returnId, status, notes }: { returnId: string; status: string; notes: string }) => {
      const { error } = await (supabase.from('cash_returns') as any)
        .update({
          status,
          admin_notes: notes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', returnId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-cash-returns'] });
      toast({ title: 'Cash return updated' });
      setCashReturnNotes('');
    },
    onError: () => {
      toast({ title: 'Failed to update cash return', variant: 'destructive' });
    },
  });

  const pendingCount = bills?.filter(b => b.status === 'pending').length || 0;
  const approvedTotal = bills?.filter(b => b.status === 'approved').reduce((s, b) => s + Number(b.amount), 0) || 0;
  const pendingCashReturns = cashReturns?.filter((r: any) => r.status === 'pending').length || 0;

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-muted text-muted-foreground';
  };

  return (
    <DashboardLayout title="Bill Management" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatsCard title="Pending Bills" value={pendingCount} icon={Clock} iconColor="bg-yellow-100 text-yellow-600" />
        <StatsCard title="Approved Total" value={`₹${approvedTotal.toLocaleString()}`} icon={CheckCircle} iconColor="bg-green-100 text-green-600" />
        <StatsCard title="Pending Cash Returns" value={pendingCashReturns} icon={Undo2} iconColor="bg-purple-100 text-purple-600" />
      </div>

      <Tabs defaultValue="bills" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bills">
            Delivery Bills {pendingCount > 0 && <Badge variant="destructive" className="ml-1 text-xs">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="cash_returns">
            Cash Returns {pendingCashReturns > 0 && <Badge variant="destructive" className="ml-1 text-xs">{pendingCashReturns}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bills">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Delivery Partner Bills</CardTitle>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All partners" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All partners</SelectItem>
                      {partners.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.phone || 'Unknown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : bills?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No bills found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills?.map((bill) => {
                        const partner = bill.delivery_partners as any;
                        const order = bill.orders as any;
                        return (
                          <TableRow key={bill.id}>
                            <TableCell className="font-medium">{partner?.full_name || 'Unknown'}</TableCell>
                            <TableCell>{order?.order_number || '-'}</TableCell>
                            <TableCell className="font-medium">₹{Number(bill.amount).toLocaleString()}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{bill.description || '-'}</TableCell>
                            <TableCell>
                              <Badge className={getStatusBadge(bill.status)} variant="secondary">
                                {bill.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{format(new Date(bill.created_at), 'dd MMM, hh:mm a')}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => setSelectedBill(bill)}>
                                <Eye className="w-4 h-4" />
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

        <TabsContent value="cash_returns">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Undo2 className="w-5 h-5" />
                  Cash Return Requests
                </CardTitle>
                <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="All partners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All partners</SelectItem>
                    {partners.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.phone || 'Unknown'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {cashReturnsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : !cashReturns || cashReturns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Undo2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No cash return requests</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashReturns.map((cr: any) => {
                        const partner = cr.delivery_partners as any;
                        return (
                          <TableRow key={cr.id}>
                            <TableCell className="font-medium">{partner?.full_name || 'Unknown'}</TableCell>
                            <TableCell className="font-medium">₹{Number(cr.amount).toLocaleString()}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{cr.description || '-'}</TableCell>
                            <TableCell>
                              <Badge className={getStatusBadge(cr.status)} variant="secondary">
                                {cr.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{format(new Date(cr.created_at), 'dd MMM, hh:mm a')}</TableCell>
                            <TableCell className="text-right">
                              {cr.status === 'pending' ? (
                                <div className="flex gap-1 justify-end">
                                  {/* Per-row notes via prompt — the previous shared
                                      cashReturnNotes state was never wired to any
                                      textarea, so admin could only ever submit empty
                                      notes. Prompt is rough but at least lets admin
                                      record context per-decision. */}
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      const notes = window.prompt('Optional notes for approval:') || '';
                                      reviewCashReturnMutation.mutate({ returnId: cr.id, status: 'approved', notes });
                                    }}
                                    disabled={reviewCashReturnMutation.isPending}
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => {
                                      const notes = window.prompt('Reason for rejection (required):');
                                      if (notes == null || notes.trim() === '') return;
                                      reviewCashReturnMutation.mutate({ returnId: cr.id, status: 'rejected', notes });
                                    }}
                                    disabled={reviewCashReturnMutation.isPending}
                                  >
                                    <XCircle className="w-3 h-3 mr-1" />Reject
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">{cr.admin_notes || '-'}</span>
                              )}
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

      {/* Bill Detail Dialog */}
      <Dialog open={!!selectedBill} onOpenChange={() => { setSelectedBill(null); setReviewAction(null); setAdminNotes(''); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bill Details</DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Partner</span>
                <span className="font-medium">{(selectedBill.delivery_partners as any)?.full_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="font-bold text-lg">₹{Number(selectedBill.amount).toLocaleString()}</span>
              </div>
              {(selectedBill.orders as any)?.order_number && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Order</span>
                  <span>{(selectedBill.orders as any).order_number}</span>
                </div>
              )}
              {selectedBill.description && (
                <div>
                  <span className="text-sm text-muted-foreground">Description</span>
                  <p className="mt-1">{selectedBill.description}</p>
                </div>
              )}
              <div>
                <span className="text-sm text-muted-foreground">Bill Image</span>
                <img
                  src={selectedBill.bill_image_url}
                  alt="Bill"
                  className="mt-2 w-full rounded-lg border object-contain max-h-64"
                />
              </div>
              <Badge className={getStatusBadge(selectedBill.status)} variant="secondary">
                {selectedBill.status}
              </Badge>

              {selectedBill.admin_notes && (
                <div>
                  <span className="text-sm text-muted-foreground">Admin Notes</span>
                  <p className="mt-1 text-sm">{selectedBill.admin_notes}</p>
                </div>
              )}

              {selectedBill.status === 'pending' && (
                <div className="space-y-3 border-t pt-4">
                  <Textarea
                    placeholder="Add notes (optional)..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        setReviewAction('approved');
                        reviewMutation.mutate({ billId: selectedBill.id, status: 'approved', notes: adminNotes });
                      }}
                      disabled={reviewMutation.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        setReviewAction('rejected');
                        reviewMutation.mutate({ billId: selectedBill.id, status: 'rejected', notes: adminNotes });
                      }}
                      disabled={reviewMutation.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminBills;
