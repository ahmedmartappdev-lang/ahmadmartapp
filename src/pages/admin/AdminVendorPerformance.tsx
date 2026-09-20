import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Search, Star, TrendingUp, TrendingDown } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';
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

interface VendorRow {
  id: string;
  business_name: string;
  status: string;
  gmv: number;
  orderCount: number;
  cancelledCount: number;
  fulfillmentRate: number;
  avgPrepMinutes: number | null;
  avgRating: number | null;
  reviewCount: number;
  commissionEarned: number;
  daysSinceLastOrder: number | null;
}

const AdminVendorPerformance: React.FC = () => {
  const [days, setDays] = useState<string>('30');
  const [search, setSearch] = useState('');

  const since = useMemo(() => subDays(new Date(), Number(days)).toISOString(), [days]);

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-performance', days],
    queryFn: async () => {
      const [vendorsRes, ordersRes, reviewsRes] = await Promise.all([
        supabase.from('vendors').select('id, business_name, status, commission_rate'),
        supabase
          .from('orders')
          .select('id, vendor_id, status, total_amount, subtotal, placed_at, confirmed_at, preparing_at, delivered_at')
          .gte('placed_at', since),
        supabase.from('reviews').select('vendor_id, rating'),
      ]);
      return {
        vendors: vendorsRes.error ? [] : (vendorsRes.data || []),
        orders: ordersRes.error ? [] : (ordersRes.data || []),
        reviews: reviewsRes.error ? [] : (reviewsRes.data || []),
      };
    },
  });

  const rows: VendorRow[] = useMemo(() => {
    if (!data) return [];
    const byVendor = new Map<string, VendorRow>();

    for (const v of data.vendors as any[]) {
      byVendor.set(v.id, {
        id: v.id,
        business_name: v.business_name || 'Unknown',
        status: v.status || 'unknown',
        gmv: 0,
        orderCount: 0,
        cancelledCount: 0,
        fulfillmentRate: 0,
        avgPrepMinutes: null,
        avgRating: null,
        reviewCount: 0,
        commissionEarned: 0,
        daysSinceLastOrder: null,
      });
    }

    const prepSum = new Map<string, { total: number; count: number }>();
    const lastOrderAt = new Map<string, Date>();
    const ratingsByVendor = new Map<string, number[]>();

    for (const o of data.orders as any[]) {
      const v = byVendor.get(o.vendor_id);
      if (!v) continue;
      v.orderCount += 1;
      if (o.status === 'cancelled') v.cancelledCount += 1;
      else v.gmv += Number(o.total_amount || 0);

      // commission earned (what vendor PAID us). subtotal × commission_rate%
      const vendorRow = (data.vendors as any[]).find(x => x.id === o.vendor_id);
      const commissionRate = Number(vendorRow?.commission_rate || 0);
      if (o.status !== 'cancelled') {
        v.commissionEarned += Number(o.subtotal || 0) * (commissionRate / 100);
      }

      if (o.confirmed_at && o.preparing_at) {
        const mins = (new Date(o.preparing_at).getTime() - new Date(o.confirmed_at).getTime()) / 60000;
        if (mins >= 0 && mins < 60 * 24) {
          const cur = prepSum.get(v.id) || { total: 0, count: 0 };
          cur.total += mins; cur.count += 1;
          prepSum.set(v.id, cur);
        }
      }

      const placed = o.placed_at ? new Date(o.placed_at) : null;
      if (placed) {
        const cur = lastOrderAt.get(v.id);
        if (!cur || placed > cur) lastOrderAt.set(v.id, placed);
      }
    }

    for (const r of data.reviews as any[]) {
      if (!r.vendor_id || typeof r.rating !== 'number') continue;
      const arr = ratingsByVendor.get(r.vendor_id) || [];
      arr.push(r.rating);
      ratingsByVendor.set(r.vendor_id, arr);
    }

    for (const v of byVendor.values()) {
      v.fulfillmentRate = v.orderCount === 0 ? 100 : Math.round(((v.orderCount - v.cancelledCount) / v.orderCount) * 100);
      const prep = prepSum.get(v.id);
      v.avgPrepMinutes = prep && prep.count > 0 ? Math.round(prep.total / prep.count) : null;
      const ratings = ratingsByVendor.get(v.id) || [];
      v.reviewCount = ratings.length;
      v.avgRating = ratings.length > 0 ? +(ratings.reduce((s, x) => s + x, 0) / ratings.length).toFixed(1) : null;
      const last = lastOrderAt.get(v.id);
      v.daysSinceLastOrder = last ? differenceInDays(new Date(), last) : null;
    }

    return Array.from(byVendor.values()).sort((a, b) => b.gmv - a.gmv);
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.business_name.toLowerCase().includes(q));
  }, [rows, search]);

  const totalGMV = rows.reduce((s, r) => s + r.gmv, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orderCount, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commissionEarned, 0);
  const activeVendors = rows.filter(r => r.orderCount > 0).length;

  return (
    <DashboardLayout title="Vendor Performance" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard title="GMV" value={`₹${totalGMV.toLocaleString()}`} icon={TrendingUp} iconColor="bg-green-100 text-green-600" />
        <StatsCard title="Orders" value={totalOrders} icon={BarChart3} iconColor="bg-blue-100 text-blue-600" />
        <StatsCard title="Commission earned" value={`₹${Math.round(totalCommission).toLocaleString()}`} icon={TrendingUp} iconColor="bg-purple-100 text-purple-600" />
        <StatsCard title="Active vendors" value={activeVendors} icon={Star} iconColor="bg-amber-100 text-amber-600" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search vendor" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
            <div className="text-center py-12 text-muted-foreground">No vendors</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">GMV</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Fulfillment</TableHead>
                    <TableHead className="text-right">Avg prep</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Last order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.business_name}</div>
                        {r.status !== 'active' && (
                          <Badge variant="secondary" className="text-[10px] mt-0.5">{r.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">₹{Math.round(r.gmv).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{r.orderCount}</TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded text-xs font-medium',
                          r.fulfillmentRate >= 95 ? 'bg-green-100 text-green-800' :
                          r.fulfillmentRate >= 85 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        )}>
                          {r.fulfillmentRate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.avgPrepMinutes !== null ? `${r.avgPrepMinutes} min` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.avgRating !== null ? (
                          <span className="inline-flex items-center gap-0.5 text-sm">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {r.avgRating} <span className="text-xs text-muted-foreground">({r.reviewCount})</span>
                          </span>
                        ) : <span className="text-xs text-muted-foreground">no reviews</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">₹{Math.round(r.commissionEarned).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">
                        {r.daysSinceLastOrder === null ? <span className="text-red-600">never</span>
                          : r.daysSinceLastOrder === 0 ? 'today'
                          : `${r.daysSinceLastOrder}d ago`}
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

export default AdminVendorPerformance;
