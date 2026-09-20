// Admin-only: create a customer (auth.users + profile) for the
// "Create Order" flow. Mirrors the verify-otp signup shape so that if
// the customer later self-signs-up via OTP with the same phone, the
// existing row is reused (no duplicates).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify caller is an admin via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Decode caller JWT → user_id
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (callerErr || !callerData.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const callerId = callerData.user.id;

    // is_admin check (uses the SECURITY DEFINER helper already in the project)
    const { data: isAdminData, error: isAdminErr } = await supabaseAdmin.rpc("is_admin", {
      _user_id: callerId,
    });
    if (isAdminErr || !isAdminData) {
      return jsonResponse({ error: "Admin access required" }, 403);
    }

    // 2. Parse + sanitise body
    const body = await req.json();
    const fullName = String(body.full_name || "").trim();
    const phoneRaw = String(body.phone || "");
    const cleanPhone = phoneRaw.replace(/\D/g, "");

    if (!fullName) return jsonResponse({ error: "Name is required" }, 400);
    if (cleanPhone.length !== 10) {
      return jsonResponse({ error: "Phone must be 10 digits" }, 400);
    }

    const fullPhone = `+91${cleanPhone}`;
    const fakeEmail = `${cleanPhone}@phone.ahmedmart.local`;
    const tempPassword = crypto.randomUUID();

    // 3. Existing-customer fast path: profile match by phone
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_id, full_name, phone")
      .eq("phone", fullPhone)
      .limit(1)
      .maybeSingle();

    if (existingProfile?.user_id) {
      // Bring full_name up to date if blank/User
      if (!existingProfile.full_name || existingProfile.full_name === "User") {
        await supabaseAdmin
          .from("profiles")
          .update({ full_name: fullName })
          .eq("user_id", existingProfile.user_id);
      }
      return jsonResponse({
        ok: true,
        existed: true,
        user_id: existingProfile.user_id,
        full_name: fullName,
        phone: fullPhone,
      });
    }

    // 4. Auth.users scan as a second-line check (covers cases where a
    //    user exists in auth but profile linkage is broken)
    let foundUserId: string | null = null;
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=100`,
        { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } }
      );
      if (!res.ok) break;
      const json = await res.json();
      const users: any[] = json.users ?? [];
      if (users.length === 0) break;
      const hit = users.find((u) => u.phone === fullPhone || u.email === fakeEmail);
      if (hit) {
        foundUserId = hit.id;
        break;
      }
      if (users.length < 100) break;
    }

    if (foundUserId) {
      // Make sure a profile row exists (auto-via trigger normally; safety net here)
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("user_id", foundUserId)
        .maybeSingle();
      if (!prof) {
        await supabaseAdmin.from("profiles").insert({
          user_id: foundUserId,
          full_name: fullName,
          phone: fullPhone,
        });
      } else {
        await supabaseAdmin
          .from("profiles")
          .update({ full_name: fullName, phone: fullPhone })
          .eq("user_id", foundUserId);
      }
      return jsonResponse({
        ok: true,
        existed: true,
        user_id: foundUserId,
        full_name: fullName,
        phone: fullPhone,
      });
    }

    // 5. Create fresh auth.users entry (handle_new_user trigger creates profile)
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: fullPhone,
        email: fakeEmail,
        password: tempPassword,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });
    const created = await createRes.json();
    if (!createRes.ok || !created.id) {
      console.error("admin-create-customer create error:", created);
      return jsonResponse({ error: "Could not create customer", detail: created }, 500);
    }
    const newUserId = created.id;

    // Trigger should have inserted the profile already; ensure full_name is set
    await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName, phone: fullPhone })
      .eq("user_id", newUserId);

    return jsonResponse({
      ok: true,
      existed: false,
      user_id: newUserId,
      full_name: fullName,
      phone: fullPhone,
    });
  } catch (e) {
    console.error("admin-create-customer error:", e);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
