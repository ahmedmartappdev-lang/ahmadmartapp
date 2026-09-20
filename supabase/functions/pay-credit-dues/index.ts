/* pay-credit-dues — Razorpay checkout init for paying customer credit dues. */
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    const requestedAmount = Number((body as any).amount) || 0;

    // Read current credit balance
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("user_id, credit_balance, full_name, phone")
      .eq("user_id", user.id)
      .single();
    if (profErr || !profile) return json({ error: "Profile not found" }, 404);

    const due = Number(profile.credit_balance || 0);
    if (due <= 0) return json({ error: "No outstanding dues" }, 400);

    // Default to full due if amount not provided. Cap at due — never let
    // someone pay more than they owe.
    const amountRupees = requestedAmount > 0 ? Math.min(requestedAmount, due) : due;
    const amountPaise = Math.round(amountRupees * 100);
    if (amountPaise <= 0) return json({ error: "Invalid amount" }, 400);

    const basicAuth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    const receipt = `creddue_${user.id.substring(0, 16)}_${Date.now().toString(36)}`.slice(0, 40);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          customer_id: user.id,
          purpose: "credit_dues",
          due_at_request: due,
        },
      }),
    });

    if (!rzpRes.ok) {
      const t = await rzpRes.text();
      console.error("Razorpay order creation failed:", rzpRes.status, t);
      return json({ error: "Payment gateway error" }, 502);
    }

    const rzpOrder = await rzpRes.json();

    return json({
      razorpay_order_id: rzpOrder.id,
      key_id: RZP_KEY_ID,
      amount: amountPaise,
      currency: "INR",
      due_total: due,
      paying_amount: amountRupees,
      prefill_name: profile.full_name || undefined,
      prefill_contact: profile.phone || undefined,
    });
  } catch (err) {
    console.error("pay-credit-dues fatal:", err);
    return json({ error: "Internal error" }, 500);
  }
});
