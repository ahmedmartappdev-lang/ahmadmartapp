import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { enablePush } from '@/lib/pushNotifications';
import { CURRENT_POLICY_VERSION, APP_VERSION } from '@/lib/policy';

export const NOTIF_CONSENT_PENDING_KEY = 'ahmadmart:notif-consent-pending';

/**
 * Redeems the "user ticked the notifications checkbox on the login page"
 * intent once a session actually exists.
 *
 * Why a separate bootstrap instead of doing it inline in AuthPage: the
 * Google OAuth path leaves the page entirely, so post-login code in
 * AuthPage never runs for it. AuthPage just sets a localStorage flag at
 * click time; this component (mounted once in App) sees flag + session
 * and finishes the job on whichever page the user lands on.
 *
 * Best-effort by design: the consent row is the durable record; the
 * browser permission prompt may be blocked without a fresh user gesture
 * (Safari/iOS especially) — the Enable Notifications card on the profile
 * page remains the fallback for those.
 */
export const NotificationConsentBootstrap: React.FC = () => {
  const { user } = useAuthStore();
  const redeeming = useRef(false);

  useEffect(() => {
    if (!user?.id || redeeming.current) return;
    let pending = false;
    try {
      pending = window.localStorage.getItem(NOTIF_CONSENT_PENDING_KEY) === '1';
    } catch { /* storage unavailable */ }
    if (!pending) return;

    redeeming.current = true;
    (async () => {
      try {
        // Durable audit row first — the user consented regardless of
        // whether the browser lets us subscribe right now.
        await (supabase.from('consent_logs') as any).insert({
          user_id: user.id,
          policy_version: CURRENT_POLICY_VERSION,
          app_version: APP_VERSION,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          source: 'notifications-opt-in',
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[notif-consent] consent_logs insert failed', e);
      }
      try {
        await enablePush();
      } catch { /* card on /profile remains the fallback */ }
      try {
        window.localStorage.removeItem(NOTIF_CONSENT_PENDING_KEY);
      } catch { /* ignore */ }
      redeeming.current = false;
    })();
  }, [user?.id]);

  return null;
};

export default NotificationConsentBootstrap;
