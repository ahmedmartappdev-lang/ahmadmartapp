import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Truck, Search, Star, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { subDays, differenceInDays } from 'date-fns';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PartnerRow {
  id: string;
  name: string;
  phone: string | null;
  suspended: boolean;
  delivered: number;
  cancelled: number;
  onTimeRate: number;
  avgDeliveryMinutes: number | null;
  avgRating: number | null;
  reviewCount: number;
  cashHeld: number;
  daysSinceLastDelivery: number | null;
}

const SLA_MINUTES = 60;

const AdminPartnerPerformance: React.FC = () => {
  const [days, setDays] = useState<string>('30');
  const [search, setSearch] = useState('');

  const since = useMemo(() => subDays(new Date(), Number(days)).toISOString(), [days]);

  const { data, isLoading } = useQuery({
    queryKey: ['partner-performance', days],
    queryFn: async () => {
      const [partnersRes, ordersRes, reviewsRes, settlementsRes, billsRes, returnsRes, collectionsRes] = await Promise.all([
        supabase.from('delivery_partners').select('id, full_name, phone, account_status'),
        supabase
          .from('orders')
          .select('id, delivery_partner_id, status, total_amount, payment_method, placed_at, picked_up_at, delivered_at, estimated_delivery_time')
          .gte('placed_at', since)
          .not('delivery_partner_id', 'is', null),
        supabase.from('reviews').select('delivery_partner_id, rating'),
        // Cash held = lifetime, not date-bounded
        (supabase.from('cash_settlements') as any).select('delivery_partner_id, amount'),
        supabase.from('delivery_bills').select('delivery_partner_id, amount, status'),
        (supabase.from('cash_returns') as any).select('delivery_partner_id, amount, status'),
        (supabase.from('credit_cash_collections') as any).select('delivery_partner_id, amount, status'),
      ]);
      // For cash held we need ALL delivered orders (not just within date range)
      const allOrdersRes = await supabase
        .from('orders')
        .select('delivery_partner_id, total_amount, payment_method, status')
        .eq('status', 'delivered' as any)
        .eq('payment_method', 'cash' as any)
        .not('delivery_partner_id', 'is', null);

      return {
        partners: partnersRes.error ? [] : (partnersRes.data || []),
        orders: ordersRes.error ? [] : (ordersRes.data || []),
        reviews: reviewsRes.error ? [] : (reviewsRes.data || []),
        settlements: settlementsRes.error ? [] : (settlementsRes.data || []),
        bills: billsRes.error ? [] : (billsRes.data || []),
        returns: returnsRes.error ? [] : (returnsRes.data || []),
        collections: collectionsRes.error ? [] : (collectionsRes.data || []),
        allCashOrders: allOrdersRes.error ? [] : (allOrdersRes.data || []),
      };
    },
  });

  const rows: PartnerRow[] = useMemo(() => {
    if (!data) return [];
    const byPartner = new Map<string, PartnerRow>();

    for (const p of data.partners as any[]) {
      byPartner.set(p.id, {
        id: p.id,
        name: p.full_name || 'Unknown',
        phone: p.phone,
        suspended: p.account_status === 'suspended',
        delivered: 0,
        cancelled: 0,
        onTimeRate: 100,
        avgDeliveryMinutes: null,
        avgRating: null,
        reviewCount: 0,
        cashHeld: 0,
        daysSinceLastDelivery: null,
      });
    }

    const onTime = new Map<string, { ok: number; total: number }>();
    const deliverySum = new Map<string, { total: number; count: number }>();
    const lastDeliveryAt = new Map<string, Date>();
    const ratingsByPartner = new Map<string, number[]>();

    // Cash held = (cash collected lifetime) − approved bills + verified collections − approved cash returns − settlements
    const cashCollectedTotal = new Map<string, number>();
    for (const o of data.allCashOrders as any[]) {
      cashCollectedTotal.set(o.delivery_partner_id, (cashCollectedTotal.get(o.delivery_partner_id) || 0) + Number(o.total_amount || 0));
    }

    for (const o of data.orders as any[]) {
      const r = byPartner.get(o.delivery_partner_id);
      if (!r) continue;
      if (o.status === 'cancelled') r.cancelled += 1;
      if (o.status === 'delivered') {
        r.delivered += 1;
        if (o.picked_up_at && o.delivered_at) {
          const mins = (new Date(o.delivered_at).getTime() - new Date(o.picked_up_at).getTime()) / 60000;
          if (mins >= 0 && mins < 60 * 24) {
            const cur = deliverySum.get(r.id) || { total: 0, count: 0 };
            cur.total += mins; cur.count += 1;
            deliverySum.set(r.id, cur);
          }
          const cur = onTime.get(r.id) || { ok: 0, total: 0 };
          cur.total += 1;
          if (mins <= SLA_MINUTES) cur.ok += 1;
          onTime.set(r.id, cur);
        }
        const d = o.delivered_at ? new Date(o.delivered_at) : null;
        if (d) {
          const cur = lastDeliveryAt.get(r.id);
          if (!cur || d > cur) lastDeliveryAt.set(r.id, d);
        }
      }
    }

    for (const r of data.reviews as any[]) {
      if (!r.delivery_partner_id || typeof r.rating !== 'number') continue;
      const arr = ratingsByPartner.get(r.delivery_partner_id) || [];
      arr.push(r.rating);
      ratingsByPartner.set(r.delivery_partner_id, arr);
    }

    for (const r of byPartner.values()) {
      const ot = onTime.get(r.id);
      r.onTimeRate = ot && ot.total > 0 ? Math.round((ot.ok / ot.total) * 100) : 100;
      const ds = deliverySum.get(r.id);
      r.avgDeliveryMinutes = ds && ds.count > 0 ? Math.round(ds.total / ds.count) : null;
      const ratings = ratingsByPartner.get(r.id) || [];
      r.reviewCount = ratings.length;
      r.avgRating = ratings.length > 0 ? +(ratings.reduce((s, x) => s + x, 0) / ratings.length).toFixed(1) : null;
      const last = lastDeliveryAt.get(r.id);
      r.daysSinceLastDelivery = last ? differenceInDays(new Date(), last) : null;

      const collected = cashCollectedTotal.get(r.id) || 0;
      const approvedBills = (data.bills as any[]).filter(b => b.delivery_partner_id === r.id && b.status === 'approved').reduce((s, b) => s + Number(b.amount || 0), 0);
      const approvedReturns = (data.returns as any[]).filter(x => x.delivery_partner_id === r.id && x.status === 'approved').reduce((s, x) => s + Number(x.amount || 0), 0);
      const verifiedCollections = (data.collections as any[]).filter(x => x.delivery_partner_id === r.id && x.status === 'verified').reduce((s, x) => s + Number(x.amount || 0), 0);
      const settled = (data.settlements as any[]).filter(x => x.delivery_partner_id === r.id).reduce((s, x) => s + Number(x.amount || 0), 0);
      r.cashHeld = collected - approvedBills + verifiedCollections - approvedReturns - settled;
    }

    return Array.from(byPartner.values()).sort((a, b) => b.delivered - a.delivered);
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.name.toLowerCase().includes(q) || (r.phone || '').includes(q));
  }, [rows, search]);

  const totalDelivered = rows.reduce((s, r) => s + r.delivered, 0);
  const onTimeOverall = rows.reduce((s, r) => s + r.onTimeRate * r.delivered, 0);
  const onTimeAvg = totalDelivered > 0 ? Math.round(onTimeOverall / totalDelivered) : 100;
  const totalCashHeld = rows.reduce((s, r) => s + (r.cashHeld > 0 ? r.cashHeld : 0), 0);
  const activePartners = rows.filter(r => !r.suspended && r.delivered > 0).length;

  return (
    <DashboardLayout title="Partner Performance" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard title="Deliveries" value={totalDelivered} icon={Truck} iconColor="bg-blue-100 text-blue-600" />
        <StatsCard title="On-time rate" value={`${onTimeAvg}%`} icon={CheckCircle} iconColor="bg-green-100 text-green-600" />
        <StatsCard title="Cash outstanding" value={`₹${Math.round(totalCashHeld).toLocaleString()}`} icon={AlertTriangle} iconColor="bg-amber-100 text-amber-600" />
        <StatsCard title="Active partners" value={activePartners} icon={Star} iconColor="bg-purple-100 text-purple-600" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search partner" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No partners</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">On-time</TableHead>
                    <TableHead className="text-right">Avg time</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                    <TableHead className="text-right">Cancellations</TableHead>
                    <TableHead className="text-right">Cash held</TableHead>
                    <TableHead className="text-right">Last delivery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          {r.name}
                          {r.suspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                        </div>
                        {r.phone && <div className="text-xs text-muted-foreground">{r.phone}</div>}
                      </TableCell>
                      <TableCell className="text-right">{r.delivered}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded text-xs font-medium',
                          r.onTimeRate >= 90 ? 'bg-green-100 text-green-800' :
                          r.onTimeRate >= 70 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        )}>
                          {r.onTimeRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.avgDeliveryMinutes !== null ? <><Clock className="w-3 h-3 inline mr-1" />{r.avgDeliveryMinutes} min</> : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.avgRating !== null ? (
                          <span className="inline-flex items-center gap-0.5 text-sm">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {r.avgRating} <span className="text-xs text-muted-foreground">({r.reviewCount})</span>
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.cancelled}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded text-xs font-medium',
                          Math.abs(r.cashHeld) < 1 ? 'bg-green-100 text-green-800' :
                          r.cashHeld > 0 ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        )}>
                          ₹{Math.round(r.cashHeld).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.daysSinceLastDelivery === null ? <span className="text-red-600">never</span>
                          : r.daysSinceLastDelivery === 0 ? 'today'
                          : `${r.daysSinceLastDelivery}d ago`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default AdminPartnerPerformance;
