import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Star, StarOff, ArrowUp, ArrowDown, X, Clock } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type DurationKey = 'days_3' | 'days_7' | 'days_14' | 'days_30' | 'until_change' | 'custom';

interface VendorRow {
  id: string;
  business_name: string;
  rating: number | null;
  status: string;
  is_accepting_orders: boolean;
  store_photo_url: string | null;
  owner_photo_url: string | null;
  is_featured: boolean;
  featured_order: number | null;
  featured_at: string | null;
  featured_until: string | null;
}

const computeFeaturedUntil = (key: DurationKey, customIso?: string): string | null => {
  if (key === 'until_change') return null;
  if (key === 'custom') return customIso || null;
  const days = key === 'days_3' ? 3 : key === 'days_7' ? 7 : key === 'days_14' ? 14 : 30;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const formatUntil = (iso: string | null): string => {
  if (!iso) return 'Until you change';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const isExpired = (iso: string | null) => !!iso && new Date(iso).getTime() < Date.now();

const AdminTopPicks: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const [dialogVendor, setDialogVendor] = useState<VendorRow | null>(null);
  const [dialogDuration, setDialogDuration] = useState<DurationKey>('until_change');
  const [dialogCustomIso, setDialogCustomIso] = useState<string>('');

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['admin-vendors-for-top-picks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, business_name, rating, status, is_accepting_orders, store_photo_url, owner_photo_url, is_featured, featured_order, featured_at, featured_until')
        .order('business_name');
      if (error) throw error;
      return (data as any[]) as VendorRow[];
    },
  });

  const featured = useMemo(
    () =>
      vendors
        .filter((v) => v.is_featured)
        .sort((a, b) => {
          const ao = a.featured_order ?? Number.POSITIVE_INFINITY;
          const bo = b.featured_order ?? Number.POSITIVE_INFINITY;
          if (ao !== bo) return ao - bo;
          // Tiebreak: most recently featured first
          const ad = a.featured_at ? new Date(a.featured_at).getTime() : 0;
          const bd = b.featured_at ? new Date(b.featured_at).getTime() : 0;
          return bd - ad;
        }),
    [vendors],
  );

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vendors
      .filter((v) => !v.is_featured)
      .filter((v) =>
        term ? (v.business_name || '').toLowerCase().includes(term) : true,
      )
      .sort((a, b) => (a.business_name || '').localeCompare(b.business_name || ''));
  }, [vendors, search]);

  // ─── Mutations ───────────────────────────────────────────────────

  const markFeatured = useMutation({
    mutationFn: async ({
      vendorId,
      featuredUntil,
    }: {
      vendorId: string;
      featuredUntil: string | null;
    }) => {
      // Place at end: max(featured_order) + 1, default 1.
      const maxOrder = featured.reduce(
        (m, v) => Math.max(m, v.featured_order ?? 0),
        0,
      );
      const { error } = await supabase
        .from('vendors')
        .update({
          is_featured: true,
          featured_at: new Date().toISOString(),
          featured_until: featuredUntil,
          featured_order: maxOrder + 1,
        })
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors-for-top-picks'] });
      queryClient.invalidateQueries({ queryKey: ['featured-stores'] });
      toast({ title: 'Vendor featured on home page' });
      setDialogVendor(null);
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  const editDuration = useMutation({
    mutationFn: async ({
      vendorId,
      featuredUntil,
    }: {
      vendorId: string;
      featuredUntil: string | null;
    }) => {
      const { error } = await supabase
        .from('vendors')
        .update({ featured_until: featuredUntil })
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors-for-top-picks'] });
      queryClient.invalidateQueries({ queryKey: ['featured-stores'] });
      toast({ title: 'Duration updated' });
      setDialogVendor(null);
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  const removeFeatured = useMutation({
    mutationFn: async (vendorId: string) => {
      const { error } = await supabase
        .from('vendors')
        .update({
          is_featured: false,
          featured_until: null,
          featured_order: null,
        })
        .eq('id', vendorId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors-for-top-picks'] });
      queryClient.invalidateQueries({ queryKey: ['featured-stores'] });
      toast({ title: 'Removed from Top Picks' });
    },
    onError: (e: any) => {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    },
  });

  const swapOrder = useMutation({
    mutationFn: async ({ a, b }: { a: string; b: string }) => {
      const { error } = await (supabase.rpc as any)('vendors_swap_featured_order', {
        p_a: a,
        p_b: b,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-vendors-for-top-picks'] });
      queryClient.invalidateQueries({ queryKey: ['featured-stores'] });
    },
    onError: (e: any) => {
      toast({ title: 'Reorder failed', description: e.message, variant: 'destructive' });
    },
  });

  // ─── UI helpers ──────────────────────────────────────────────────

  const openMarkDialog = (v: VendorRow) => {
    setDialogDuration('until_change');
    setDialogCustomIso('');
    setDialogVendor(v);
  };

  const openEditDialog = (v: VendorRow) => {
    setDialogDuration(v.featured_until ? 'custom' : 'until_change');
    setDialogCustomIso(
      v.featured_until ? new Date(v.featured_until).toISOString().slice(0, 16) : '',
    );
    setDialogVendor(v);
  };

  const submitDialog = () => {
    if (!dialogVendor) return;
    const featuredUntil = computeFeaturedUntil(
      dialogDuration,
      dialogCustomIso ? new Date(dialogCustomIso).toISOString() : undefined,
    );
    if (dialogDuration === 'custom' && !featuredUntil) {
      toast({ title: 'Pick a date', variant: 'destructive' });
      return;
    }
    if (dialogVendor.is_featured) {
      editDuration.mutate({ vendorId: dialogVendor.id, featuredUntil });
    } else {
      markFeatured.mutate({ vendorId: dialogVendor.id, featuredUntil });
    }
  };

  const VendorAvatar: React.FC<{ v: VendorRow }> = ({ v }) => {
    const url = v.store_photo_url || v.owner_photo_url;
    return (
      <div className="w-10 h-10 rounded-full bg-muted/40 overflow-hidden ring-1 ring-gray-100 shrink-0 flex items-center justify-center">
        {url ? (
          <img src={url} alt={v.business_name} className="w-full h-full object-cover scale-110" />
        ) : (
          <span className="text-primary font-bold">{(v.business_name || '?').charAt(0)}</span>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout title="Top Picks" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="space-y-4">
        {/* Currently featured — no cap; home renders all featured in a
            horizontal scroll. Admin uses the order column to rank them. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-primary" /> Currently featured
              <span className="text-xs font-normal text-muted-foreground ml-2">
                {featured.length} featured
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
            ) : featured.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border-2 border-dashed border-gray-200 rounded-xl">
                No vendors featured yet. Pick one from the list below.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {featured.map((v, idx) => {
                  const expired = isExpired(v.featured_until);
                  return (
                    <li key={v.id} className="flex items-center gap-3 py-3">
                      <span className="text-xs font-mono text-muted-foreground w-6 shrink-0 text-center">
                        {idx + 1}
                      </span>
                      <VendorAvatar v={v} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {v.business_name}
                          {v.rating ? (
                            <span className="ml-2 text-[11px] text-muted-foreground">★ {Number(v.rating).toFixed(1)}</span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {expired
                            ? <span className="text-destructive font-medium">Expired · {formatUntil(v.featured_until)}</span>
                            : v.featured_until
                              ? <>Active until {formatUntil(v.featured_until)}</>
                              : <>Until you change</>}
                          {v.status !== 'active' && (
                            <Badge variant="secondary" className="ml-2 bg-gray-100 text-gray-600">{v.status}</Badge>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={idx === 0 || swapOrder.isPending}
                          onClick={() => swapOrder.mutate({ a: v.id, b: featured[idx - 1].id })}
                          aria-label="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={idx === featured.length - 1 || swapOrder.isPending}
                          onClick={() => swapOrder.mutate({ a: v.id, b: featured[idx + 1].id })}
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => openEditDialog(v)}>
                          Edit duration
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => removeFeatured.mutate(v.id)}
                          aria-label="Remove from Top Picks"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Add a vendor */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vendors..."
                className="pl-9"
              />
            </div>
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
            ) : available.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                {search.trim() ? 'No vendors match your search.' : 'All vendors are already featured.'}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {available.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-3">
                    <VendorAvatar v={v} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{v.business_name}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        {v.rating ? <span>★ {Number(v.rating).toFixed(1)}</span> : <span>No rating</span>}
                        <span className="text-gray-300">·</span>
                        <span className="capitalize">{v.status}</span>
                        {!v.is_accepting_orders && (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-600 ml-1">Not accepting</Badge>
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full shrink-0"
                      onClick={() => openMarkDialog(v)}
                    >
                      <Star className="w-3 h-3 mr-1" />
                      Make Top Pick
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Duration dialog (shared by Mark + Edit) */}
      <Dialog open={!!dialogVendor} onOpenChange={(open) => { if (!open) setDialogVendor(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{dialogVendor?.is_featured ? 'Edit duration' : 'Make Top Pick'}</DialogTitle>
            <DialogDescription>
              {dialogVendor?.business_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
              Feature for
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'days_3' as DurationKey, label: '3 days' },
                { key: 'days_7' as DurationKey, label: '7 days' },
                { key: 'days_14' as DurationKey, label: '14 days' },
                { key: 'days_30' as DurationKey, label: '30 days' },
                { key: 'custom' as DurationKey, label: 'Custom date' },
                { key: 'until_change' as DurationKey, label: 'Until I change' },
              ].map((opt) => {
                const active = dialogDuration === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDialogDuration(opt.key)}
                    className={`h-10 px-3 rounded-full border text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 bg-white text-foreground hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {dialogDuration === 'custom' && (
              <Input
                type="datetime-local"
                value={dialogCustomIso}
                onChange={(e) => setDialogCustomIso(e.target.value)}
                className="mt-2"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogVendor(null)}>Cancel</Button>
            <Button onClick={submitDialog} disabled={markFeatured.isPending || editDuration.isPending}>
              {dialogVendor?.is_featured ? 'Save' : 'Make Top Pick'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdminTopPicks;
