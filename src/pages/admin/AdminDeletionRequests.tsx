import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Minimal admin queue for customer account-deletion requests.
 * Each row is auto-tagged with a reference number (DEL-001, …) via the
 * Postgres sequence + DEFAULT on the `reference_number` column.
 *
 * Admin workflow:
 *   1. Customer requests via Profile → Delete My Account (pre-checks
 *      dues + active orders client-side, then writes a row here).
 *   2. Admin verifies identity (email/phone), performs the deletion
 *      manually (auth + profile + addresses + cart), and marks the row
 *      "Completed" here with what was deleted / retained.
 *   3. Reference number is sent to the customer for their records.
 */

interface DeletionRow {
  id: string;
  user_id: string | null;
  reference_number: string;
  requested_at: string;
  processed_at: string | null;
  status: 'pending' | 'completed' | 'rejected';
  customer_email: string | null;
  customer_phone: string | null;
  what_deleted: any;
  what_retained: any;
  notes: string | null;
}

const AdminDeletionRequests: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | DeletionRow['status']>('pending');
  const [editing, setEditing] = useState<DeletionRow | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['admin-deletion-requests', statusFilter],
    queryFn: async () => {
      let q = (supabase.from('deletion_requests') as any)
        .select('*')
        .order('requested_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DeletionRow[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<DeletionRow> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from('deletion_requests')
        .update(rest as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-deletion-requests'] });
      toast({ title: 'Request updated' });
      setEditing(null);
    },
    onError: (err: any) => {
      toast({ title: err?.message || 'Failed to update', variant: 'destructive' });
    },
  });

  const statusBadge = (s: DeletionRow['status']) => {
    const cls = s === 'pending'
      ? 'bg-amber-100 text-amber-800'
      : s === 'completed'
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-red-100 text-red-800';
    return <Badge className={cls} variant="secondary">{s}</Badge>;
  };

  return (
    <DashboardLayout
      title="Account Deletion Requests"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Requests ({rows?.length ?? 0})</CardTitle>
          <div className="flex gap-1">
            {(['pending', 'completed', 'rejected', 'all'] as const).map(s => (
              <Button
                key={s}
                variant={statusFilter === s ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="capitalize h-7"
              >
                {s}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : !rows || rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No {statusFilter !== 'all' ? statusFilter : ''} requests.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map(r => (
                <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-semibold">{r.reference_number}</span>
                      {statusBadge(r.status)}
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Phone:</span> {r.customer_phone || '—'}{' '}
                      <span className="text-muted-foreground ml-2">Email:</span> {r.customer_email || '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Requested {format(new Date(r.requested_at), 'd MMM yyyy h:mm a')}
                      {r.processed_at && <> · Processed {format(new Date(r.processed_at), 'd MMM yyyy h:mm a')}</>}
                    </p>
                    {r.notes && <p className="text-xs text-slate-600 mt-1">{r.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      Manage
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Manage modal */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage {editing?.reference_number}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ManageForm
              row={editing}
              onSave={(patch) => mutation.mutate({ id: editing.id, ...patch })}
              isSaving={mutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const ManageForm: React.FC<{
  row: DeletionRow;
  onSave: (patch: Partial<DeletionRow>) => void;
  isSaving: boolean;
}> = ({ row, onSave, isSaving }) => {
  const [status, setStatus] = useState(row.status);
  const [notes, setNotes] = useState(row.notes || '');
  const [whatDeleted, setWhatDeleted] = useState(
    Array.isArray(row.what_deleted) ? row.what_deleted.join('\n') : '',
  );
  const [whatRetained, setWhatRetained] = useState(
    Array.isArray(row.what_retained) ? row.what_retained.join('\n') : '',
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider mb-1">Status</p>
        <div className="flex gap-1">
          {(['pending', 'completed', 'rejected'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? 'default' : 'outline'}
              onClick={() => setStatus(s)}
              className="capitalize h-8"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">What was deleted</label>
        <Textarea
          rows={3}
          placeholder="One item per line, e.g.&#10;profile&#10;addresses&#10;auth session"
          value={whatDeleted}
          onChange={(e) => setWhatDeleted(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">What was retained (and why)</label>
        <Textarea
          rows={3}
          placeholder="One item per line, e.g.&#10;orders (7-year GST retention)&#10;payment ledger (audit)"
          value={whatRetained}
          onChange={(e) => setWhatRetained(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Internal notes</label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Identity verified, deletion run on …"
        />
      </div>

      <DialogFooter>
        <Button
          disabled={isSaving}
          onClick={() => {
            onSave({
              status,
              notes: notes || null,
              what_deleted: whatDeleted.split('\n').map(s => s.trim()).filter(Boolean),
              what_retained: whatRetained.split('\n').map(s => s.trim()).filter(Boolean),
              processed_at: status !== 'pending' ? new Date().toISOString() : null,
            });
          }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </div>
  );
};

export default AdminDeletionRequests;
