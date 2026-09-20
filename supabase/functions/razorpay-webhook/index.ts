// deno-lint-ignore-file no-explicit-any
// razorpay-webhook
// Public (verify_jwt=false). HMAC-verifies the request with RAZORPAY_WEBHOOK_SECRET.
// Authoritative source: even when the client never calls verify-razorpay-payment,
// this webhook flips the order. Idempotent via razorpay_webhook_events.event_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-razorpay-signature, x-razorpay-event-id",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  if (!WEBHOOK_SECRET) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-razorpay-signature") ?? "";

  // 1. HMAC verify
  const expected = await hmacSha256Hex(WEBHOOK_SECRET, rawBody);
  if (!timingSafeEqual(expected, sigHeader)) {
    console.warn("Webhook signature mismatch");
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const eventId: string =
    event.id || req.headers.get("x-razorpay-event-id") || `evt_${Date.now()}_${crypto.randomUUID()}`;
  const eventType: string = event.event || "unknown";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 2. Idempotency — only the FIRST insert succeeds for a given event_id
  const { data: inserted, error: insertErr } = await admin
    .from("razorpay_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      signature: sigHeader,
      payload: event,
    })
    .select("id")
    .single();

  if (insertErr) {
    // Duplicate event id → already processed. Return 200 so Razorpay stops retrying.
    if ((insertErr as any).code === "23505") {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Webhook event insert error:", insertErr);
    return new Response("DB error", { status: 500, headers: corsHeaders });
  }

  const eventRowId = inserted?.id;
  let processingError: string | null = null;

  try {
    const paymentEntity = event?.payload?.payment?.entity;
    const refundEntity = event?.payload?.refund?.entity;

    switch (eventType) {
      case "payment.captured": {
        if (!paymentEntity?.order_id || !paymentEntity?.id) {
          throw new Error("payment.captured missing order_id/id");
        }
        const amountRupees = Number(paymentEntity.amount) / 100;
        const { error } = await admin.rpc("mark_razorpay_order_paid", {
          p_razorpay_order_id: paymentEntity.order_id,
          p_razorpay_payment_id: paymentEntity.id,
          p_razorpay_signature: sigHeader,
          p_amount: amountRupees,
          p_method: paymentEntity.method ?? null,
          p_raw: paymentEntity,
        });
        if (error) throw error;
        break;
      }
      case "payment.failed": {
        if (!paymentEntity?.order_id) break;
        const { error } = await admin.rpc("mark_razorpay_order_failed", {
          p_razorpay_order_id: paymentEntity.order_id,
          p_razorpay_payment_id: paymentEntity.id ?? null,
          p_error_code: paymentEntity.error_code ?? null,
          p_error_description: paymentEntity.error_description ?? null,
          p_raw: paymentEntity,
        });
        if (error) throw error;
        break;
      }
      case "refund.processed":
      case "refund.created":
      case "payment.refunded": {
        const refundOrderId = refundEntity?.payment_id
          ? (await admin
              .from("payments")
              .select("order_id, razorpay_order_id")
              .eq("razorpay_payment_id", refundEntity.payment_id)
              .limit(1)
              .maybeSingle()).data?.razorpay_order_id
          : paymentEntity?.order_id;

        if (refundOrderId) {
          await admin
            .from("orders")
            .update({ payment_status: "refunded", updated_at: new Date().toISOString() })
            .eq("razorpay_order_id", refundOrderId);

          // Log refund audit row
          const { data: orderRows } = await admin
            .from("orders")
            .select("id, customer_id, total_amount")
            .eq("razorpay_order_id", refundOrderId);

          if (orderRows?.length) {
            const refundRows = orderRows.map((o) => ({
              order_id: o.id,
              customer_id: o.customer_id,
              gateway: "razorpay",
              razorpay_order_id: refundOrderId,
              razorpay_payment_id: refundEntity?.payment_id ?? paymentEntity?.id ?? null,
              amount: refundEntity?.amount ? Number(refundEntity.amount) / 100 : o.total_amount,
              currency: "INR",
              status: "refunded",
              raw_payload: refundEntity ?? paymentEntity,
            }));
            const { error: refIns } = await admin.from("payments").insert(refundRows);
            if (refIns) console.warn("refund audit insert warn:", refIns);
          }
        }
        break;
      }
      default:
        // Other events (order.paid, etc) — silently acknowledge
        break;
    }

    if (eventRowId) {
      await admin
        .from("razorpay_webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventRowId);
    }
  } catch (err) {
    processingError = (err as Error)?.message ?? String(err);
    console.error(`Webhook ${eventType} processing error:`, processingError);
    if (eventRowId) {
      await admin
        .from("razorpay_webhook_events")
        .update({ error: processingError })
        .eq("id", eventRowId);
    }
    // Still return 200 so Razorpay doesn't retry on every edge case — we've logged it.
  }

  return new Response(JSON.stringify({ ok: true, error: processingError }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
