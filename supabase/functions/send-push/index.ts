// send-push — Web Push dispatcher for the Ahmad Mart notifications system.
//
// Called by:
//   1. The AFTER INSERT trigger on `notifications` (via pg_net.http_post).
//   2. Any client / admin code that wants to fire a push directly
//      (supabase.functions.invoke('send-push', { body: { ... } })).
//
// Body: { user_id: string, title: string, body: string,
//         url?: string, tag?: string, data?: Record<string, unknown> }
//
// Requires three Supabase Edge Function secrets:
//   VAPID_PUBLIC_KEY  — base64url-encoded (P-256 EC public key)
//   VAPID_PRIVATE_KEY — base64url-encoded
//   VAPID_SUBJECT     — mailto:you@example.com
//
// Uses the pure-Deno webpush port `jsr:@negrel/webpush` — no Node deps.
//
// Push is best-effort: any subscription that returns 404/410 is deleted so
// the table stays clean.

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Use the mature Node `web-push` package via Supabase's npm-compat layer.
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PushRequest {
  user_id: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let payload: PushRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const { user_id, title, body, url, tag, data } = payload;
  if (!user_id || !title || !body) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "server_misconfigured", detail: "supabase env missing" }, 500);
  }
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return jsonResponse(
      {
        error: "vapid_not_configured",
        detail:
          "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in Supabase Edge Function secrets.",
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (subsError) {
    console.error("[send-push] failed to load subscriptions", subsError);
    return jsonResponse({ error: "db_error", detail: subsError.message }, 500);
  }

  const subscriptions = (subs || []) as Subscription[];
  if (subscriptions.length === 0) {
    return jsonResponse({ ok: true, delivered: 0, note: "no_subscriptions" });
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  } catch (err) {
    console.error("[send-push] failed to set VAPID details", err);
    return jsonResponse({ error: "vapid_init_failed", detail: String(err) }, 500);
  }

  const notificationPayload = JSON.stringify({
    title,
    body,
    url: url ?? "/orders",
    tag: tag ?? undefined,
    data: data ?? {},
  });

  const goneSubIds: string[] = [];
  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload,
          { TTL: 60 * 60 },
        );
        return { id: sub.id, ok: true };
      } catch (err: any) {
        // Push service returns 404/410 for endpoints the user has unsubscribed
        // from or that the browser has expired — clean them up.
        const status = err?.statusCode;
        const msg = String(err?.message ?? err);
        if (status === 404 || status === 410 || /(gone|not\s*found)/i.test(msg)) {
          goneSubIds.push(sub.id);
        }
        console.warn("[send-push] delivery failed", { endpoint: sub.endpoint, status, err: msg });
        return { id: sub.id, ok: false, error: msg };
      }
    }),
  );

  if (goneSubIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", goneSubIds);
  }

  const delivered = results.filter((r) => r.ok).length;
  return jsonResponse({
    ok: true,
    delivered,
    total: subscriptions.length,
    pruned: goneSubIds.length,
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
