// deno-lint-ignore-file no-explicit-any
// pay-existing-order
// Auth-gated. Lets a customer initiate online payment for an existing
// order they already placed (typically a COD order). Server recomputes
// amount from the DB row, attaches a Razorpay order_id, returns checkout
// data. Subsequent verify-razorpay-payment + mark_razorpay_order_paid
// flips the order to payment_method=online, payment_status=completed.
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

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
      return json({ error: "Payment gateway not configured" }, 500);
    }

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

    const body = await req.json().catch(() => ({}));
    const orderId = (body as any).order_id;
    if (!orderId || typeof orderId !== "string") {
      return json({ error: "order_id is required" }, 400);
    }

    // Fetch order, validate ownership and eligibility
    const { data: order, error: fetchErr } = await admin
      .from("orders")
      .select("id, customer_id, status, payment_status, payment_method, total_amount, order_number, razorpay_order_id")
      .eq("id", orderId)
      .single();

    if (fetchErr || !order) {
      console.error("Order lookup failed:", fetchErr);
      return json({ error: "Order not found" }, 404);
    }
    if (order.customer_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }
    if (order.payment_status === "completed") {
      return json({ error: "Order is already paid" }, 409);
    }
    if (TERMINAL_STATUSES.has(String(order.status))) {
      return json({ error: `Cannot pay for a ${order.status} order` }, 409);
    }

    const totalRupees = Number(order.total_amount);
    const amountPaise = Math.round(totalRupees * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return json({ error: "Invalid order total" }, 400);
    }

    // If a razorpay_order_id is already stamped, reuse it (idempotent retry).
    let razorpayOrderId = order.razorpay_order_id ?? null;

    if (!razorpayOrderId) {
      const basicAuth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
      const receipt = `cod2on_${order.order_number}`.slice(0, 40);

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
            order_id: order.id,
            order_number: order.order_number,
            origin: "cod_pay_now",
          },
        }),
      });

      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        console.error("Razorpay order creation failed:", rzpRes.status, errText);
        return json({ error: "Payment gateway error" }, 502);
      }

      const rzpOrder = await rzpRes.json();
      razorpayOrderId = String(rzpOrder.id);

      const { error: stampErr } = await admin
        .from("orders")
        .update({ razorpay_order_id: razorpayOrderId })
        .eq("id", order.id);
      if (stampErr) {
        console.error("Failed to stamp razorpay_order_id:", stampErr);
        return json({ error: "Order stamping failed" }, 500);
      }

      const { error: payInsErr } = await admin.from("payments").insert({
        order_id: order.id,
        customer_id: user.id,
        gateway: "razorpay",
        razorpay_order_id: razorpayOrderId,
        amount: totalRupees,
        currency: "INR",
        status: "created",
        raw_payload: rzpOrder,
      });
      if (payInsErr) {
        // Non-fatal — verify path will upsert the captured row.
        console.warn("payments insert (created) warning:", payInsErr);
      }
    }

    return json({
      razorpay_order_id: razorpayOrderId,
      key_id: RZP_KEY_ID,
      amount: amountPaise,
      currency: "INR",
      order_ids: [order.id],
      order_numbers: [order.order_number],
      receipt: `cod2on_${order.order_number}`.slice(0, 40),
    });
  } catch (err) {
    console.error("pay-existing-order fatal:", err);
    return json({ error: "Internal error" }, 500);
  }
});
