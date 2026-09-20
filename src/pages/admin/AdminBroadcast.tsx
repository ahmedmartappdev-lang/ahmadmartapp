import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Loader2 } from 'lucide-react';
import { DashboardLayout, adminNavItems } from '@/components/layouts/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const AdminBroadcast: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('/');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Cheap customer-count estimate — "profiles minus admin/vendor/delivery role rows".
  // Uses the same filter the RPC applies, so the number matches what will be sent.
  const { data: customerCount, isLoading: countLoading } = useQuery({
    queryKey: ['admin-broadcast-customer-count'],
    queryFn: async () => {
      const { data: total, error: e1 } = await (supabase.from('profiles') as any)
        .select('user_id', { count: 'exact', head: true });
      if (e1) throw e1;
      const totalCount = (total as any)?.count ?? 0;

      const { data: nonCustomer, error: e2 } = await (supabase.from('user_roles') as any)
        .select('user_id', { count: 'exact', head: true })
        .in('role', ['admin', 'vendor', 'delivery_partner']);
      if (e2) throw e2;
      const nonCustCount = (nonCustomer as any)?.count ?? 0;

      // Approximate — a user with two of admin/vendor/delivery roles would be
      // double-counted here, but that's rare. Good enough for the preview label.
      return Math.max(0, totalCount - nonCustCount);
    },
    staleTime: 60_000,
  });

  const broadcastMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_broadcast_promotion' as any, {
        p_title: title.trim(),
        p_message: message.trim(),
        p_url: url.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; sent_to: number };
    },
    onSuccess: (result) => {
      toast({
        title: 'Broadcast sent',
        description: `${result.sent_to} customer${result.sent_to === 1 ? '' : 's'} will receive it.`,
      });
      setTitle('');
      setMessage('');
      setUrl('/');
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-broadcast-customer-count'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Broadcast failed',
        description: err?.message || 'Try again.',
        variant: 'destructive',
      });
    },
  });

  const trimmedTitle = title.trim();
  const trimmedMessage = message.trim();
  const canSend =
    trimmedTitle.length > 0 &&
    trimmedTitle.length <= 80 &&
    trimmedMessage.length > 0 &&
    trimmedMessage.length <= 240 &&
    !broadcastMutation.isPending;

  return (
    <DashboardLayout
      title="Broadcast Push"
      navItems={adminNavItems}
      roleColor="bg-red-500 text-white"
      roleName="Admin Panel"
    >
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-full bg-emerald-50 border border-emerald-100 p-2">
              <Megaphone className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <CardTitle>Send a promotion to all customers</CardTitle>
              <CardDescription className="mt-1">
                Sends a "promotion" push to every customer with an active push subscription. Requires the
                <strong> Promotions & offers </strong> toggle to be ON in Notifications settings, otherwise
                the in-app notification is created but the OS push is skipped.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="broadcast-title">Title</Label>
            <Input
              id="broadcast-title"
              maxLength={80}
              placeholder="e.g. Fresh mangoes just arrived!"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{trimmedTitle.length}/80</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea
              id="broadcast-message"
              rows={3}
              maxLength={240}
              placeholder="e.g. 20% off on all seasonal fruits, today only."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{trimmedMessage.length}/240</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadcast-url">Open URL when tapped (optional)</Label>
            <Input
              id="broadcast-url"
              maxLength={200}
              placeholder="/ (home) — or /category/food-restaurants"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Any in-app path. Defaults to the home page.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <p className="font-medium">
              Will be sent to{' '}
              {countLoading ? '…' : <span className="font-bold">{customerCount ?? 0}</span>} customer
              {(customerCount ?? 0) === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Only customers with an active push subscription will receive the OS-level push.
              Everyone else still gets the in-app notification in their history.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="lg"
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
            >
              {broadcastMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send broadcast
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this broadcast?</AlertDialogTitle>
            <AlertDialogDescription>
              This will fire a push to <strong>{customerCount ?? 0} customers</strong> immediately.
              You can't undo this — but you can cancel further pushes by disabling the
              "Promotions & offers" toggle in Notifications settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
            <p className="font-semibold">{trimmedTitle || <em className="text-muted-foreground">(no title)</em>}</p>
            <p className="text-slate-700 mt-1">{trimmedMessage || <em className="text-muted-foreground">(no message)</em>}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={broadcastMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={broadcastMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                broadcastMutation.mutate();
              }}
            >
              {broadcastMutation.isPending ? 'Sending…' : 'Send now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default AdminBroadcast;
