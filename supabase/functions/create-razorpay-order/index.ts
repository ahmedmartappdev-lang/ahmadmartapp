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

// ---------------------------------------------------------------------------
// Server-side fee computation. Mirrors src/hooks/useDeliveryFeeConfig.ts
// (computeDeliveryFee). Keep the two in sync. The order RPC trusts the fee
// values it is given, so the edge function must not pass the client's
// numbers through: a modified client could send delivery_fee = 0.
// ---------------------------------------------------------------------------
interface FeeConfig {
  baseFee: number;
  freeDeliveryThreshold: number;
  platformFee: number;
  surgeEnabled: boolean;
  surgeMultiplier: number;
  rainSurgeEnabled: boolean;
  rainSurgeMultiplier: number;
  peakHoursEnabled: boolean;
  peakHoursMultiplier: number;
  peakHoursStart: string;
  peakHoursEnd: string;
  smallOrderFeeEnabled: boolean;
  smallOrderThreshold: number;
  smallOrderFee: number;
}

const DEFAULT_FEE_CONFIG: FeeConfig = {
  baseFee: 29,
  freeDeliveryThreshold: 199,
  platformFee: 5,
  surgeEnabled: false,
  surgeMultiplier: 1.5,
  rainSurgeEnabled: false,
  rainSurgeMultiplier: 1.3,
  peakHoursEnabled: false,
  peakHoursMultiplier: 1.2,
  peakHoursStart: "12:00",
  peakHoursEnd: "14:00",
  smallOrderFeeEnabled: false,
  smallOrderThreshold: 99,
  smallOrderFee: 10,
};

function computeFees(config: FeeConfig, subtotal: number) {
  if (subtotal >= config.freeDeliveryThreshold) {
    return { deliveryFee: 0, platformFee: config.platformFee, smallOrderFee: 0 };
  }
  let fee = config.baseFee;
  let surgeApplied = false;
  let surgeMultiplier = 1;
  if (config.surgeEnabled) {
    surgeMultiplier = config.surgeMultiplier;
    surgeApplied = true;
  }
  if (config.rainSurgeEnabled) {
    surgeMultiplier = Math.max(surgeMultiplier, config.rainSurgeMultiplier);
    surgeApplied = true;
  }
  if (config.peakHoursEnabled) {
    // The browser uses its local clock (customers are in India). The edge
    // runtime is UTC, so convert to IST (UTC+05:30).
    const now = new Date();
    const currentMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
    const [startH, startM] = config.peakHoursStart.split(":").map(Number);
    const [endH, endM] = config.peakHoursEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
      surgeMultiplier = Math.max(surgeMultiplier, config.peakHoursMultiplier);
      surgeApplied = true;
    }
  }
  if (surgeApplied) fee = Math.round(fee * surgeMultiplier);
  let smallOrderFee = 0;
  if (config.smallOrderFeeEnabled && subtotal < config.smallOrderThreshold) {
    smallOrderFee = config.smallOrderFee;
  }
  return { deliveryFee: fee, platformFee: config.platformFee, smallOrderFee };
}

async function computeServerFees(admin: any, groups: VendorGroupInput[]) {
  const qtyByProduct = new Map<string, number>();
  for (const g of groups) {
    for (const it of g.items) {
      qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) ?? 0) + Number(it.quantity));
    }
  }
  const { data: products, error: prodErr } = await admin
    .from("products")
    .select("id, selling_price, admin_selling_price")
    .in("id", [...qtyByProduct.keys()]);
  if (prodErr) throw prodErr;

  // Same price rule as place_customer_order_with_credit.
  let subtotal = 0;
  for (const p of products ?? []) {
    const admPrice = Number(p.admin_selling_price) || 0;
    const price = admPrice > 0 ? admPrice : Number(p.selling_price) || 0;
    subtotal += price * (qtyByProduct.get(p.id) ?? 0);
  }

  const { data: setting, error: setErr } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "delivery_fee_config")
    .maybeSingle();
  if (setErr) throw setErr;

  let config: FeeConfig = DEFAULT_FEE_CONFIG;
  if (setting?.value) {
    try {
      const parsed = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      config = { ...DEFAULT_FEE_CONFIG, ...parsed };
    } catch {
      config = DEFAULT_FEE_CONFIG;
    }
  }

  const fees = computeFees(config, subtotal);
  const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return {
    subtotal,
    deliveryFee: clamp(fees.deliveryFee),
    platformFee: clamp(fees.platformFee),
    smallOrderFee: clamp(fees.smallOrderFee),
  };
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

    // --- 2b. Recompute fees server-side; ignore the client's fee numbers ---
    let serverFees;
    try {
      serverFees = await computeServerFees(admin, body.vendor_groups);
    } catch (feeErr) {
      console.error("Server fee computation failed:", feeErr);
      return json({ error: "Could not compute order fees" }, 500);
    }
    const clientFeeSum =
      (Number(body.delivery_fee) || 0) + (Number(body.platform_fee) || 0) + (Number(body.small_order_fee) || 0);
    const serverFeeSum = serverFees.deliveryFee + serverFees.platformFee + serverFees.smallOrderFee;
    if (Math.abs(clientFeeSum - serverFeeSum) > 0.009) {
      console.warn(
        "Client fees differ from server fees; using server values. client=%s server=%s subtotal=%s",
        clientFeeSum,
        serverFeeSum,
        serverFees.subtotal
      );
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
        p_delivery_fee: serverFees.deliveryFee,
        p_platform_fee: serverFees.platformFee,
        p_small_order_fee: serverFees.smallOrderFee,
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
