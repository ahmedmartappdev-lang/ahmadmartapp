// deno-lint-ignore-file no-explicit-any
// verify-razorpay-payment
// Auth-gated. HMAC-SHA256 verifies {razorpay_order_id}|{razorpay_payment_id}
// with Key Secret, then calls mark_razorpay_order_paid RPC to flip orders.
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

// WebCrypto HMAC-SHA256 → hex
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

// Constant-time string compare
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface VerifyBody {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
      return json({ error: "Payment gateway not configured" }, 500);
    }

    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Empty bearer token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user) {
      console.error("getUser failed:", userErr);
      return json({ error: "Unauthorized: " + (userErr?.message || "no user") }, 401);
    }

    // 2. Body
    const body = (await req.json()) as VerifyBody;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: "Missing payment fields" }, 400);
    }

    // 3. Verify HMAC signature
    const expected = await hmacSha256Hex(
      RZP_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );
    if (!timingSafeEqual(expected, razorpay_signature)) {
      console.warn("Signature mismatch for razorpay_order_id=%s", razorpay_order_id);
      return json({ error: "Invalid signature" }, 401);
    }

    // 4. Ownership check — the order(s) with this razorpay_order_id must belong to this user
    const { data: owned, error: ownErr } = await admin
      .from("orders")
      .select("id, customer_id, total_amount")
      .eq("razorpay_order_id", razorpay_order_id);

    if (ownErr || !owned?.length) {
      console.error("Ownership lookup failed:", ownErr);
      return json({ error: "Order not found" }, 404);
    }
    if (owned.some((o) => o.customer_id !== user.id)) {
      return json({ error: "Forbidden" }, 403);
    }

    // 5. Fetch payment details from Razorpay for server-attested amount + method
    const basicAuth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    let rzpAmountPaise: number | null = null;
    let rzpMethod: string | null = null;
    let rzpPayload: unknown = null;
    try {
      const res = await fetch(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        { headers: { Authorization: `Basic ${basicAuth}` } }
      );
      if (res.ok) {
        const p = await res.json();
        rzpAmountPaise = p.amount;
        rzpMethod = p.method ?? null;
        rzpPayload = p;
      } else {
        console.warn("Razorpay fetchPayment non-OK:", res.status);
      }
    } catch (e) {
      console.warn("Razorpay fetchPayment error:", e);
    }

    // 5a. If Razorpay returned an amount, confirm it matches our DB sum
    const expectedSumRupees = owned.reduce((sum, r) => sum + Number(r.total_amount), 0);
    const expectedPaise = Math.round(expectedSumRupees * 100);
    if (rzpAmountPaise !== null && rzpAmountPaise !== expectedPaise) {
      console.error(
        "Gateway amount mismatch: gateway=%d expected=%d",
        rzpAmountPaise,
        expectedPaise
      );
      return json({ error: "Amount mismatch" }, 400);
    }

    // 6. Flip orders paid via RPC (atomic, idempotent, amount-guarded)
    const { data: rpcData, error: rpcErr } = await admin.rpc("mark_razorpay_order_paid", {
      p_razorpay_order_id: razorpay_order_id,
      p_razorpay_payment_id: razorpay_payment_id,
      p_razorpay_signature: razorpay_signature,
      p_amount: expectedSumRupees, // rupees, matches total_amount
      p_method: rzpMethod,
      p_raw: rzpPayload ?? { source: "verify", razorpay_order_id, razorpay_payment_id },
    });

    if (rpcErr) {
      console.error("mark_razorpay_order_paid error:", rpcErr);
      return json({ error: rpcErr.message || "Mark paid failed" }, 500);
    }

    return json({ ok: true, result: rpcData });
  } catch (err) {
    console.error("verify-razorpay-payment fatal:", err);
    return json({ error: "Internal error" }, 500);
  }
});
