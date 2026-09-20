import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { enablePush, disablePushEverywhere, getPushStatus, type PushStatus } from '@/lib/pushNotifications';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { CURRENT_POLICY_VERSION, APP_VERSION } from '@/lib/policy';

const DISMISS_KEY = 'ahmadmart:push-prompt-dismissed';

/**
 * Two-state notifications control on the profile page.
 *
 * Not subscribed → opt-in prompt (dismissible; the dismiss only hides
 * the PROMPT, never the ability to opt back in later).
 * Subscribed     → "notifications are on" panel with a Turn off button.
 *   Turn off unsubscribes this browser AND deletes every device
 *   subscription the user has, so no push can be delivered anywhere —
 *   the send-push edge fn only sends to rows in push_subscriptions.
 *   Both opt-in and opt-out are written to consent_logs.
 *
 * Hidden entirely when signed out or the browser doesn't support push.
 */
export const EnableNotificationsCard: React.FC = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    let alive = true;
    getPushStatus().then((s) => { if (alive) setStatus(s); });
    return () => { alive = false; };
  }, []);

  if (!user) return null;
  if (!status) return null;
  if (!status.supported) return null;

  const isOn = status.permission === 'granted' && status.subscribed;
  // Dismissal only suppresses the opt-in nudge; the ON panel always shows
  // so the user can always find the off switch.
  if (!isOn && dismissed) return null;

  const logConsent = async (source: 'notifications-opt-in' | 'notifications-opt-out') => {
    try {
      await (supabase.from('consent_logs') as any).insert({
        user_id: user.id,
        policy_version: CURRENT_POLICY_VERSION,
        app_version: APP_VERSION,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        source,
      });
    } catch { /* audit best-effort */ }
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result.ok) {
        void logConsent('notifications-opt-in');
        toast({ title: 'Notifications enabled', description: 'You will get order updates on this device.' });
        setStatus(await getPushStatus());
      } else if (result.reason === 'blocked') {
        toast({
          title: 'Notifications are blocked',
          description: "Turn them on in your browser's site settings for ahmadmart.in, then try again.",
          variant: 'destructive',
        });
      } else if (result.reason === 'denied') {
        toast({ title: 'Permission denied', description: 'You can enable it later from this card.', variant: 'destructive' });
      } else {
        toast({
          title: 'Could not enable notifications',
          description: result.detail || 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      const result = await disablePushEverywhere();
      if (result.ok) {
        void logConsent('notifications-opt-out');
        // Clear the old dismissal so the opt-in prompt is visible again —
        // otherwise a user who dismissed it long ago would have no way
        // to turn notifications back on.
        try { window.localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
        setDismissed(false);
        toast({ title: 'Notifications turned off', description: 'No more push notifications on any of your devices.' });
        setStatus(await getPushStatus());
      } else {
        toast({
          title: 'Could not turn off notifications',
          description: result.detail || 'Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    try { window.localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  if (isOn) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm mb-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-white border border-emerald-100 p-2">
            <Bell className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">Notifications are on</p>
            <p className="text-[13px] text-slate-600 mt-0.5 leading-snug">
              You get order updates and offers on this device. Turning off stops
              notifications on all your devices.
            </p>
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisable}
                disabled={busy}
                className="h-9 rounded-full font-semibold text-slate-700"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <BellOff className="w-3.5 h-3.5 mr-1" />}
                Turn off notifications
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm mb-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-white border border-emerald-100 p-2">
          <Bell className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">Get order updates on your phone</p>
          <p className="text-[13px] text-slate-600 mt-0.5 leading-snug">
            We{"'"}ll notify you when your order is confirmed, on the way, or delivered — even when the app is closed.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={busy}
              className="h-9 rounded-full font-semibold"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Enable notifications
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              disabled={busy}
              className="h-9 rounded-full text-slate-600"
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnableNotificationsCard;
