import { supabase } from '@/integrations/supabase/client';

// The VAPID public key must be present at build time. Vite bakes any env
// var prefixed with VITE_ into the bundle. If it's missing, all push flows
// degrade to no-ops with a console warning — the app doesn't crash.
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  reason?: 'no_service_worker' | 'no_push_manager' | 'no_notification_api' | 'no_vapid_key';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

export function isPushSupported(): PushStatus['reason'] | null {
  if (typeof window === 'undefined') return 'no_service_worker';
  if (!('serviceWorker' in navigator)) return 'no_service_worker';
  if (!('PushManager' in window)) return 'no_push_manager';
  if (typeof Notification === 'undefined') return 'no_notification_api';
  if (!VAPID_PUBLIC_KEY) return 'no_vapid_key';
  return null;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Return the existing registration if there is one — don't re-register
    // on every mount. Vite HMR would otherwise register the SW dozens of
    // times per session.
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    // Non-fatal — the site still works; push just won't be available.
    // eslint-disable-next-line no-console
    console.warn('[push] service worker registration failed:', err);
    return null;
  }
}

export async function getPushStatus(): Promise<PushStatus> {
  const reason = isPushSupported();
  if (reason) {
    return { supported: false, permission: 'unsupported', subscribed: false, reason };
  }
  const permission = Notification.permission;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return {
    supported: true,
    permission,
    subscribed: !!sub,
  };
}

/**
 * Ask the OS for permission (if needed), subscribe to the Push service, and
 * upsert the subscription into Supabase via the RPC.
 *
 * Returns:
 *   { ok: true }                       — subscribed successfully
 *   { ok: false, reason: '...' }       — user denied, unsupported, or config missing
 */
export async function enablePush(): Promise<
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'blocked' | 'failed'; detail?: string }
> {
  const reason = isPushSupported();
  if (reason) return { ok: false, reason: 'unsupported', detail: reason };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: 'unsupported', detail: 'no_registration' };

  // Wait for the SW to be active — Chrome sometimes reports "installing"
  // right after registration and pushManager.subscribe fails on that.
  if (reg.installing) {
    await new Promise<void>((resolve) => {
      const worker = reg.installing!;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated' || worker.state === 'redundant') resolve();
      });
    });
  }
  await navigator.serviceWorker.ready;

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'blocked', detail: 'The site is blocked from sending notifications. Enable it in your browser site settings.' };
  }
  if (Notification.permission === 'default') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
      return { ok: false, reason: 'denied' };
    }
  }

  try {
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const p256dhBuf = sub.getKey('p256dh');
    const authBuf = sub.getKey('auth');
    const p256dh = arrayBufferToBase64(p256dhBuf);
    const auth = arrayBufferToBase64(authBuf);

    const { error } = await supabase.rpc('save_push_subscription' as any, {
      p_endpoint: sub.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    if (error) {
      return { ok: false, reason: 'failed', detail: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: 'failed', detail: err?.message || String(err) };
  }
}

/**
 * Full opt-out: unsubscribe this browser AND delete every push
 * subscription row the user has (all devices). With zero rows in
 * push_subscriptions the send-push edge function has nothing to
 * deliver to — sending becomes structurally impossible, not merely
 * suppressed. RLS limits the DELETE to the caller's own rows.
 */
export async function disablePushEverywhere(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return { ok: false, detail: 'not_authenticated' };

    const reg = await navigator.serviceWorker?.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;

    // 1) Kill THIS DEVICE's subscription row first — by endpoint, via the
    //    SECURITY DEFINER RPC that deletes regardless of which account
    //    registered it. A browser has one push endpoint shared across all
    //    accounts; without this, a row registered under a previously
    //    logged-in account survives the per-user delete below and the
    //    device keeps ringing.
    if (sub?.endpoint) {
      const { error } = await supabase.rpc('delete_push_subscription' as any, {
        p_endpoint: sub.endpoint,
      });
      if (error) return { ok: false, detail: error.message };
    }

    // 2) Delete every subscription this USER has on other devices.
    const { error: userDelError } = await supabase
      .from('push_subscriptions' as any)
      .delete()
      .eq('user_id', user.id);
    if (userDelError) return { ok: false, detail: userDelError.message };

    // 3) Invalidate the browser-side subscription last — even if this
    //    fails, the rows are already gone so nothing can be delivered.
    if (sub) await sub.unsubscribe().catch(() => {});

    return { ok: true };
  } catch (err: any) {
    return { ok: false, detail: err?.message || String(err) };
  }
}

/**
 * Unsubscribe from Push on the browser side AND delete the row in Supabase.
 * Safe to call even if the user isn't subscribed.
 */
export async function disablePush(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return { ok: true };
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    const { error } = await supabase.rpc('delete_push_subscription' as any, { p_endpoint: endpoint });
    if (error) return { ok: false, detail: error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, detail: err?.message || String(err) };
  }
}
