import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Volume2, VolumeX, ChevronRight, Clock, MapPin, User, IndianRupee } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { cn } from '@/lib/utils';

type ColumnKey = 'placed' | 'confirmed' | 'preparing' | 'out' | 'delivered_today';

const COLUMNS: { key: ColumnKey; title: string; statuses: string[]; color: string }[] = [
  { key: 'placed', title: 'Placed', statuses: ['pending'], color: 'bg-yellow-50 border-yellow-200' },
  { key: 'confirmed', title: 'Confirmed', statuses: ['confirmed'], color: 'bg-blue-50 border-blue-200' },
  { key: 'preparing', title: 'Preparing', statuses: ['preparing', 'ready_for_pickup'], color: 'bg-purple-50 border-purple-200' },
  { key: 'out', title: 'Out for delivery', statuses: ['assigned_to_delivery', 'picked_up', 'out_for_delivery'], color: 'bg-orange-50 border-orange-200' },
  { key: 'delivered_today', title: 'Delivered today', statuses: ['delivered'], color: 'bg-green-50 border-green-200' },
];

const AdminLiveOrders: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [soundOn, setSoundOn] = useState(false);
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const lastSeenIdsRef = useRef<Set<string>>(new Set());

  const { data: vendors } = useQuery({
    queryKey: ['live-orders-vendors'],
    queryFn: async () => {
      const { data } = await supabase.from('vendors').select('id, business_name').order('business_name');
      return data || [];
    },
  });

  const { data: partners } = useQuery({
    queryKey: ['live-orders-partners'],
    queryFn: async () => {
      const { data } = await supabase
        .from('delivery_partners')
        .select('id, full_name, phone, status, account_status')
        .order('full_name');
      return (data || []).filter((p: any) => p.account_status !== 'suspended');
    },
  });

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['live-orders', vendorFilter],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select(`
          id, order_number, status, total_amount, payment_method, payment_status,
          placed_at, delivered_at, vendor_id, delivery_partner_id, customer_id,
          delivery_address, vendor:vendors(business_name),
          delivery_partner:delivery_partners(full_name, phone)
        `)
        // Drop refunded too — they're terminal and clutter the board.
        // Use explicit allowlist (status IN ...) so future status enum
        // additions don't silently appear here.
        .or(`status.neq.delivered,delivered_at.gte.${todayStart}`)
        .not('status', 'in', '("cancelled","refunded")' as any)
        .order('placed_at', { ascending: false })
        .limit(200);

      if (vendorFilter !== 'all') query = query.eq('vendor_id', vendorFilter);

      const { data, error } = await query;
      if (error) {
        console.error('live-orders fetch', error);
        return [];
      }

      const customerIds = Array.from(new Set((data || []).map((o: any) => o.customer_id).filter(Boolean)));
      let byUserId = new Map<string, any>();
      if (customerIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, phone')
          .in('user_id', customerIds);
        for (const p of (profiles || []) as any[]) byUserId.set(p.user_id, p);
      }
      return (data || []).map((o: any) => ({
        ...o,
        customer: byUserId.get(o.customer_id) || null,
      }));
    },
    refetchInterval: 30000,
  });

  useRealtimeInvalidation({ table: 'orders', queryKeys: [['live-orders', vendorFilter]] });

  // New-order chime + toast — fires on rows we haven't seen before
  useEffect(() => {
    const ids = new Set(orders.map((o: any) => o.id));
    if (lastSeenIdsRef.current.size === 0) {
      lastSeenIdsRef.current = ids;
      return;
    }
    const newOnes = orders.filter((o: any) => !lastSeenIdsRef.current.has(o.id) && o.status === 'pending');
    if (newOnes.length > 0) {
      if (soundOn) playChime();
      toast({ title: `🔔 ${newOnes.length} new order${newOnes.length > 1 ? 's' : ''}`, description: newOnes[0].order_number });
    }
    lastSeenIdsRef.current = ids;
    // `toast` is a fresh function each render under React 19 / strict mode;
    // including it would re-fire the chime twice per new order. Stable in
    // this codebase, so safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, soundOn]);

  const grouped = useMemo(() => {
    const out: Record<ColumnKey, any[]> = { placed: [], confirmed: [], preparing: [], out: [], delivered_today: [] };
    for (const o of orders) {
      const col = COLUMNS.find(c => c.statuses.includes(o.status));
      if (col) out[col.key].push(o);
    }
    return out;
  }, [orders]);

  const advanceMutation = useMutation({
    mutationFn: async ({ orderId, nextStatus, currentOrder }: { orderId: string; nextStatus: string; currentOrder?: any }) => {
      const update: any = { status: nextStatus };
      if (nextStatus === 'delivered') {
        update.delivered_at = new Date().toISOString();
        // For COD orders the customer pays at the door; admins advancing
        // here should reflect that. Without this, the order stays
        // payment_status='pending' forever and the customer app shows
        // "payment pending" on a delivered order.
        if (currentOrder?.payment_method === 'cash' && currentOrder?.payment_status !== 'completed') {
          update.payment_status = 'completed';
        }
      }
      const { error } = await supabase.from('orders').update(update).eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-orders'] });
      toast({ title: 'Order advanced' });
    },
    onError: (err: any) => toast({ title: 'Could not update', description: err.message, variant: 'destructive' }),
  });

  const assignPartnerMutation = useMutation({
    mutationFn: async ({ orderId, partnerId }: { orderId: string; partnerId: string }) => {
      const { error } = await supabase
        .from('orders')
        .update({ delivery_partner_id: partnerId, status: 'assigned_to_delivery' as any })
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-orders'] });
      toast({ title: 'Delivery partner assigned' });
    },
    onError: (err: any) => toast({ title: 'Could not assign', description: err.message, variant: 'destructive' }),
  });

  return (
    <DashboardLayout title="Live Orders" navItems={adminNavItems} roleColor="bg-red-500 text-white" roleName="Admin Panel">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-600 animate-pulse" />
          <span className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${orders.length} active orders`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {(vendors || []).map((v: any) => (
                <SelectItem key={v.id} value={v.id}>{v.business_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant={soundOn ? 'default' : 'outline'} size="sm" onClick={() => setSoundOn(!soundOn)}>
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className={cn('rounded-lg border-2 p-3 flex flex-col min-h-[400px]', col.color)}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">{col.title}</div>
              <Badge variant="secondary">{grouped[col.key].length}</Badge>
            </div>
            <div className="space-y-2 overflow-y-auto flex-1">
              {grouped[col.key].length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8">No orders</div>
              ) : (
                grouped[col.key].map((o: any) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    column={col.key}
                    partners={partners || []}
                    onAdvance={(next) => advanceMutation.mutate({ orderId: o.id, nextStatus: next, currentOrder: o })}
                    onAssign={(partnerId) => assignPartnerMutation.mutate({ orderId: o.id, partnerId })}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
};

function nextStatusFor(current: string): string | null {
  const map: Record<string, string> = {
    pending: 'confirmed',
    confirmed: 'preparing',
    preparing: 'ready_for_pickup',
    ready_for_pickup: 'assigned_to_delivery',
    assigned_to_delivery: 'picked_up',
    picked_up: 'out_for_delivery',
    out_for_delivery: 'delivered',
  };
  return map[current] || null;
}

const OrderCard: React.FC<{
  order: any;
  column: ColumnKey;
  partners: any[];
  onAdvance: (next: string) => void;
  onAssign: (partnerId: string) => void;
}> = ({ order, column, partners, onAdvance, onAssign }) => {
  const next = nextStatusFor(order.status);
  const showAssign = column === 'preparing' && order.status === 'ready_for_pickup' && !order.delivery_partner_id;
  const placedAgo = order.placed_at ? formatDistanceToNow(new Date(order.placed_at), { addSuffix: false }) : '';

  return (
    <Card className="bg-white shadow-sm">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm truncate">{order.order_number}</div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
            <Clock className="w-3 h-3" /> {placedAgo}
          </span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
          <User className="w-3 h-3 shrink-0" />
          {order.customer?.full_name || 'Customer'} · {order.customer?.phone || ''}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {(order.vendor as any)?.business_name || 'Vendor'}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold flex items-center gap-0.5">
            <IndianRupee className="w-3 h-3" />{Number(order.total_amount).toLocaleString()}
          </span>
          <Badge variant="outline" className="text-[10px]">{order.payment_method}</Badge>
        </div>
        {order.delivery_partner && (
          <div className="text-[11px] bg-blue-50 text-blue-700 rounded px-2 py-0.5 truncate">
            🛵 {(order.delivery_partner as any)?.full_name}
          </div>
        )}

        {showAssign && (
          <Select onValueChange={onAssign}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Assign partner" />
            </SelectTrigger>
            <SelectContent>
              {partners.length === 0 ? (
                <SelectItem value="none" disabled>No partners</SelectItem>
              ) : partners.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {next && column !== 'delivered_today' && (
          <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => onAdvance(next)}>
            → {(next ?? '').replace(/_/g, ' ')} <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.start();
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // user hasn't interacted yet — chime silently fails, fine
  }
}

export default AdminLiveOrders;
