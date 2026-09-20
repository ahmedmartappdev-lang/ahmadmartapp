// deno-lint-ignore-file no-explicit-any
// create-razorpay-order
// Auth-gated. Creates pending order rows via the existing RPC, then creates
// a single Razorpay order for the full cart total. Key secret stays server-side.
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

interface OrderItemInput {
  product_id: string;
  product_snapshot: Record<string, unknown>;
  quantity: number;
  unit_price: number;
  mrp: number;
  discount_amount: number;
  total_price: number;
}

interface VendorGroupInput {
  vendor_id: string;
  items: OrderItemInput[];
}

interface RequestBody {
  vendor_groups: VendorGroupInput[];
  delivery_address: Record<string, unknown>;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  customer_notes?: string | null;
  delivery_fee: number;
  platform_fee: number;
  small_order_fee: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RZP_KEY_ID || !RZP_KEY_SECRET) {
      return json({ error: "Payment gateway not configured" }, 500);
    }

    // --- 1. Verify user JWT ---
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

    // --- 2. Parse body ---
    const body = (await req.json()) as RequestBody;
    if (!body.vendor_groups?.length) return json({ error: "Empty cart" }, 400);
    if (!body.delivery_address) return json({ error: "Missing delivery address" }, 400);

    // Basic bounds checks — nothing should be negative
    for (const g of body.vendor_groups) {
      if (!g.vendor_id || !g.items?.length) return json({ error: "Invalid vendor group" }, 400);
      for (const it of g.items) {
        if (it.quantity <= 0 || it.unit_price < 0 || it.total_price < 0) {
          return json({ error: "Invalid item pricing" }, 400);
        }
      }
    }

    // --- 3. Create order rows via existing RPC. The RPC uses auth.uid(),
    //     so we must invoke it under the user's JWT to resolve the caller.
    const authed = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: rpcResult, error: rpcErr } = await authed.rpc(
      "place_customer_order_with_credit",
      {
        p_vendor_groups: body.vendor_groups as any,
        p_delivery_address: body.delivery_address as any,
        p_delivery_latitude: body.delivery_latitude ?? null,
        p_delivery_longitude: body.delivery_longitude ?? null,
        p_payment_method: "online",
        p_customer_notes: body.customer_notes ?? null,
        p_credit_used: 0,
        p_delivery_fee: body.delivery_fee,
        p_platform_fee: body.platform_fee,
        p_small_order_fee: body.small_order_fee,
      }
    );

    if (rpcErr) {
      console.error("RPC place_customer_order_with_credit error:", rpcErr);
      return json({ error: rpcErr.message || "Failed to create order" }, 500);
    }

    const created = (rpcResult as Array<{ id: string; order_number: string }>) ?? [];
    if (!created.length) return json({ error: "Order creation returned empty" }, 500);

    const orderIds = created.map((o) => o.id);

    // --- 4. Recompute total server-side from the DB rows we just created ---
    const { data: orderRows, error: fetchErr } = await admin
      .from("orders")
      .select("id, total_amount, order_number")
      .in("id", orderIds);

    if (fetchErr || !orderRows?.length) {
      console.error("Failed to fetch created orders:", fetchErr);
      return json({ error: "Order lookup failed" }, 500);
    }

    const totalRupees = orderRows.reduce((sum, r) => sum + Number(r.total_amount), 0);
    const amountPaise = Math.round(totalRupees * 100);

    if (amountPaise <= 0) {
      return json({ error: "Invalid order total" }, 400);
    }

    // --- 5. Create Razorpay order ---
    const basicAuth = btoa(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`);
    const receipt = `rcpt_${orderRows[0].order_number}`.slice(0, 40);

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
          order_ids: orderIds.join(","),
          order_numbers: orderRows.map((r) => r.order_number).join(","),
        },
      }),
    });

    if (!rzpRes.ok) {
      const errText = await rzpRes.text();
      console.error("Razorpay order creation failed:", rzpRes.status, errText);
      // Mark our DB orders as failed so the customer can retry cleanly
      await admin
        .from("orders")
        .update({ payment_status: "failed" })
        .in("id", orderIds);
      return json({ error: "Payment gateway error" }, 502);
    }

    const rzpOrder = await rzpRes.json();
    const razorpayOrderId: string = rzpOrder.id;

    // --- 6. Stamp our orders with razorpay_order_id; insert 'created' payment rows ---
    const { error: updErr } = await admin
      .from("orders")
      .update({ razorpay_order_id: razorpayOrderId })
      .in("id", orderIds);

    if (updErr) {
      console.error("Failed to stamp orders with razorpay_order_id:", updErr);
      return json({ error: "Order stamping failed" }, 500);
    }

    const paymentRows = orderRows.map((r) => ({
      order_id: r.id,
      customer_id: user.id,
      gateway: "razorpay",
      razorpay_order_id: razorpayOrderId,
      amount: r.total_amount,
      currency: "INR",
      status: "created",
      raw_payload: rzpOrder,
    }));
    const { error: payInsErr } = await admin.from("payments").insert(paymentRows);
    if (payInsErr) {
      // Non-fatal — the webhook / verify will upsert. Log and continue.
      console.warn("payments insert (created) warning:", payInsErr);
    }

    // --- 7. Return data required for Razorpay Checkout ---
    return json({
      razorpay_order_id: razorpayOrderId,
      key_id: RZP_KEY_ID,
      amount: amountPaise,
      currency: "INR",
      order_ids: orderIds,
      order_numbers: orderRows.map((r) => r.order_number),
      receipt,
    });
  } catch (err) {
    console.error("create-razorpay-order fatal:", err);
    return json({ error: "Internal error" }, 500);
  }
});
