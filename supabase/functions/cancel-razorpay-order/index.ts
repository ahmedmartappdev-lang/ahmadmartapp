// deno-lint-ignore-file no-explicit-any
// cancel-razorpay-order
// Auth-gated. Replaces the client's direct call to the
// cancel_pending_razorpay_order RPC, which is service_role-only since
// migration 20261108000000. Flow:
//   1. verify the user's JWT;
//   2. check that every order carrying this razorpay_order_id belongs to the user;
//   3. ask Razorpay (read-only GET) whether the order already has a captured
//      or authorized payment. If it does, do NOT cancel: the webhook /
//      verify will settle it, and cancelling would strand a real payment;
//   4. otherwise call cancel_pending_razorpay_order(p_razorpay_order_id,
//      p_customer_id) with the service role.
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
const RZP_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RZP_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Empty bearer token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const razorpayOrderId = String((body as any).razorpay_order_id || "").trim();
    if (!razorpayOrderId) return json({ error: "Missing razorpay_order_id" }, 400);

    // Ownership
    const { data: rows, error: ownErr } = await admin
      .from("orders")
      .select("id, customer_id")
      .eq("razorpay_order_id", razorpayOrderId);
    if (ownErr) {
      console.error("Ownership lookup failed:", ownErr);
      return json({ error: "Order lookup failed" }, 500);
    }
    if (!rows?.length) return json({ error: "Order not found" }, 404);
    if (rows.some((r) => r.customer_id !== user.id)) return json({ error: "Forbidden" }, 403);

    // Read-only check with Razorpay: was money taken (or held) already?
    if (RZP_KEY_ID && RZP_KEY_SECRET) {
      try {
        const basicAuth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
        const res = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`,
          { headers: { Authorization: `Basic ${basicAuth}` } }
        );
        if (res.ok) {
          const list = await res.json();
          const live = (list?.items ?? []).find(
            (p: any) => p?.status === "captured" || p?.status === "authorized"
          );
          if (live) {
            return json({
              ok: false,
              cancelled: 0,
              payment_in_progress: true,
              payment_status: live.status,
            });
          }
        } else {
          // Fall through and cancel, matching the old behaviour. A late
          // capture is still caught by the webhook as requires_refund.
          console.warn("Razorpay order payments lookup non-OK:", res.status);
        }
      } catch (e) {
        console.warn("Razorpay order payments lookup error:", e);
      }
    }

    const { data, error } = await admin.rpc("cancel_pending_razorpay_order", {
      p_razorpay_order_id: razorpayOrderId,
      p_customer_id: user.id,
    });
    if (error) {
      console.error("cancel_pending_razorpay_order error:", error);
      return json({ error: error.message || "Cancel failed" }, 500);
    }
    return json({ ok: true, result: data });
  } catch (err) {
    console.error("cancel-razorpay-order fatal:", err);
    return json({ error: "Internal error" }, 500);
  }
});
