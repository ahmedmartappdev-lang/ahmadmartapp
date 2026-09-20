import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, Info } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface NotificationSetting {
  notification_type: string;
  push_enabled: boolean;
  label: string;
  description: string | null;
  updated_at: string;
}

// Events that currently have a wired trigger point. All 11 are wired as of
// the "wire all push events" migration:
//   - order_placed / order_confirmed / order_dispatched / order_delivered /
//     order_cancelled / order_preparing / payment_success / payment_failed
//     → orders_notify_on_insert_trg + orders_notify_on_update_trg
//   - credit_low → profiles_notify_credit_low_trg
//   - promotion  → admin_broadcast_promotion RPC (via /admin/broadcast)
//   - general    → inline insert in admin_finalize_order_edit
const WIRED_EVENTS = new Set<string>([
  'order_placed',
  'order_confirmed',
  'order_preparing',
  'order_assigned',
  'order_picked_up',
  'order_dispatched',
  'order_delivered',
  'order_cancelled',
  'payment_success',
  'payment_failed',
  'credit_low',
  'promotion',
  'general',
  'vendor_new_order',
  'vendor_order_cancelled',
  'agent_order_assigned',
]);

const AdminNotificationSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings' as any)
        .select('*')
        .order('notification_type', { ascending: true });
      if (error) throw error;
      return (data || []) as NotificationSetting[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      const { error } = await supabase.rpc('admin_set_notification_setting' as any, {
        p_type: type,
        p_enabled: enabled,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Could not update setting',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <DashboardLayout
      title="Notification Settings"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-full bg-emerald-50 border border-emerald-100 p-2">
              <BellRing className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <CardTitle>Push notifications</CardTitle>
              <CardDescription className="mt-1">
                Toggle OS-level push notifications per event. In-app notification history is always saved
                regardless of these switches — this only controls whether the customer's device also gets a
                native push.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              An event marked <span className="font-semibold">Not wired yet</span> won't fire pushes even
              when toggled ON — the trigger point in the corresponding server RPC still needs to be added
              (separate work). Toggling OFF is always effective immediately.
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : !settings || settings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No notification settings found.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[140px]">Wiring</TableHead>
                    <TableHead className="w-[100px] text-right">Push</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((s) => {
                    const wired = WIRED_EVENTS.has(s.notification_type);
                    const isBusy =
                      toggleMutation.isPending &&
                      toggleMutation.variables?.type === s.notification_type;
                    return (
                      <TableRow key={s.notification_type}>
                        <TableCell>
                          <div className="font-medium text-slate-900">{s.label}</div>
                          <div className="font-mono text-[11px] text-slate-500">{s.notification_type}</div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 max-w-md">
                          {s.description || <span className="text-slate-400 italic">—</span>}
                        </TableCell>
                        <TableCell>
                          {wired ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                              Wired
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                              Not wired yet
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={s.push_enabled}
                            disabled={isBusy}
                            onCheckedChange={(next) => {
                              toggleMutation.mutate({ type: s.notification_type, enabled: next });
                            }}
                            aria-label={`Push notification for ${s.label}`}
                          />
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
    </DashboardLayout>
  );
};

export default AdminNotificationSettings;
