/* verify-credit-payment — HMAC verify + record_credit_payment RPC call. */
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RZP_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID")!;
const RZP_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET")!;

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) return json({ error: "Payment gateway not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Empty bearer token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body as any;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: "Missing payment fields" }, 400);
    }

    // 1. HMAC verify
    const expected = await hmacSha256Hex(
      RZP_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );
    if (!timingSafeEqual(expected, razorpay_signature)) {
      return json({ error: "Invalid signature" }, 401);
    }

    // 2. Fetch payment from Razorpay for server-attested amount + payload
    const basicAuth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    let amountPaise: number | null = null;
    let rawPayload: unknown = null;
    let notesCustomer: string | null = null;
    try {
      const res = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      if (res.ok) {
        const p = await res.json();
        amountPaise = p.amount;
        rawPayload = p;
        notesCustomer = p?.notes?.customer_id || null;
      } else {
        console.warn("Razorpay fetchPayment non-OK:", res.status);
        return json({ error: "Could not verify payment with gateway" }, 502);
      }
    } catch (e) {
      console.warn("Razorpay fetchPayment error:", e);
      return json({ error: "Gateway unreachable" }, 502);
    }

    if (amountPaise === null) return json({ error: "Could not determine paid amount" }, 502);

    // 3. Ownership: payment notes.customer_id must match the JWT user.
    if (notesCustomer && notesCustomer !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const amountRupees = amountPaise / 100;

    // 4. Apply via RPC.
    const { data, error } = await admin.rpc("record_credit_payment", {
      p_customer_id: user.id,
      p_amount: amountRupees,
      p_razorpay_order_id: razorpay_order_id,
      p_razorpay_payment_id: razorpay_payment_id,
      p_razorpay_signature: razorpay_signature,
      p_raw: rawPayload as any,
    });

    if (error) {
      console.error("record_credit_payment error:", error);
      return json({ error: error.message || "Failed to record payment" }, 500);
    }

    return json({ ok: true, result: data });
  } catch (err) {
    console.error("verify-credit-payment fatal:", err);
    return json({ error: "Internal error" }, 500);
  }
});
