import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Helpers ──

async function getProfileUserIdByPhone(
  supabaseAdmin: ReturnType<typeof createClient>,
  phone: string
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function listAuthUsersPage(
  page: number,
  perPage: number
): Promise<any[]> {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    }
  );
  if (!res.ok) {
    await res.text();
    return [];
  }
  const json = await res.json();
  return json.users ?? [];
}

async function findAuthUserByPhoneOrEmail(
  phone: string,
  email: string
): Promise<{ id: string } | null> {
  // Scan up to 10 pages (1000 users) — should cover most projects
  for (let page = 1; page <= 10; page++) {
    const users = await listAuthUsersPage(page, 100);
    if (!users.length) break;
    for (const u of users) {
      if (u.phone === phone || u.email === email) {
        return { id: u.id };
      }
    }
    if (users.length < 100) break;
  }
  return null;
}

async function updateAuthUserForLogin(
  userId: string,
  email: string,
  password: string
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    console.error("updateAuthUserForLogin error:", err);
    return false;
  }
  await res.text(); // consume body
  return true;
}

async function repairProfileLinkage(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  phone: string
) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, phone")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      // Create missing profile
      await supabaseAdmin.from("profiles").insert({
        user_id: userId,
        full_name: "User",
        phone,
      });
      console.log("Repaired: created missing profile for", userId);
    } else if (!existing.phone || existing.phone !== phone) {
      // Fix mismatched phone
      await supabaseAdmin
        .from("profiles")
        .update({ phone })
        .eq("user_id", userId);
      console.log("Repaired: updated phone on profile for", userId);
    }
  } catch (e) {
    console.error("Profile repair error (non-fatal):", e);
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, otp } = await req.json();

    const cleanPhone = phone?.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length !== 10) {
      return jsonResponse({ error: "Invalid phone number." }, 400);
    }
    if (!otp || otp.length !== 6) {
      return jsonResponse({ error: "Invalid OTP. Must be 6 digits." }, 400);
    }

    const fullPhone = `+91${cleanPhone}`;
    const fakeEmail = `${cleanPhone}@phone.ahmedmart.local`;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const tempPassword = crypto.randomUUID();

    // 1. Validate OTP — also enforce per-phone lockout after 5 failed
    // attempts (migration 20260518100000 adds otp_codes.attempts,
    // otp_codes.locked_until and register_otp_failure()).
    // First, check whether the latest row for this phone is currently
    // locked out (regardless of whether the submitted OTP is right).
    const { data: latestRow } = await supabaseAdmin
      .from("otp_codes")
      .select("locked_until")
      .eq("phone", fullPhone)
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRow?.locked_until && new Date(latestRow.locked_until) > new Date()) {
      return jsonResponse({ error: "Too many wrong attempts. Try again in 15 minutes." }, 429);
    }

    const { data: otpRecord, error: otpError } = await supabaseAdmin
      .from("otp_codes")
      .select("*")
      .eq("phone", fullPhone)
      .eq("otp", otp)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError || !otpRecord) {
      // Record the failed attempt; if 5+ in this window, the row is locked.
      const { data: failureInfo } = await supabaseAdmin.rpc("register_otp_failure", {
        p_phone: fullPhone,
      });
      const locked = (failureInfo as any)?.locked === true;
      return jsonResponse(
        {
          error: locked
            ? "Too many wrong attempts. Try again in 15 minutes."
            : "Wrong OTP. Please try again.",
        },
        locked ? 429 : 400,
      );
    }

    // 2. Resolve existing user — multi-source
    let userId: string | null = null;
    let needsProfileRepair = false;

    // 2a. Check profiles table first (fast path)
    userId = await getProfileUserIdByPhone(supabaseAdmin, fullPhone);

    // 2b. If profiles miss, search Auth directly
    if (!userId) {
      console.log("Profile lookup miss, searching Auth for", fullPhone);
      const authUser = await findAuthUserByPhoneOrEmail(fullPhone, fakeEmail);
      if (authUser) {
        userId = authUser.id;
        needsProfileRepair = true;
        console.log("Found existing auth user via Auth scan:", userId);
      }
    }

    // 3. If user exists, update for login
    if (userId) {
      const ok = await updateAuthUserForLogin(userId, fakeEmail, tempPassword);
      if (!ok) {
        return jsonResponse({ error: "Verification failed. Please try again." }, 500);
      }
      // Self-heal profile linkage if needed
      if (needsProfileRepair) {
        await repairProfileLinkage(supabaseAdmin, userId, fullPhone);
      }
    } else {
      // 4. No existing user found — create new
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
          user_metadata: { full_name: "User" },
        }),
      });
      const createData = await createRes.json();

      if (!createRes.ok || !createData.id) {
        const errCode = createData?.error_code || "";

        // Conflict recovery: search Auth again (not profiles)
        if (errCode === "phone_exists" || errCode === "email_exists") {
          console.warn("Create conflict, recovering via Auth scan:", errCode);
          const recovered = await findAuthUserByPhoneOrEmail(fullPhone, fakeEmail);
          if (recovered) {
            userId = recovered.id;
            const ok = await updateAuthUserForLogin(userId, fakeEmail, tempPassword);
            if (!ok) {
              return jsonResponse({ error: "Verification failed. Please try again." }, 500);
            }
            await repairProfileLinkage(supabaseAdmin, userId, fullPhone);
          } else {
            console.error("Auth scan recovery also failed");
            return jsonResponse({ error: "Verification failed. Please try again." }, 500);
          }
        } else {
          console.error("Create user error:", createData);
          return jsonResponse({ error: "Verification failed. Please try again." }, 500);
        }
      } else {
        userId = createData.id;
      }
    }

    // 5. Sign in to get session tokens
    const signInRes = await fetch(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: Deno.env.get("SUPABASE_ANON_KEY") || serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: fakeEmail, password: tempPassword }),
      }
    );
    const signInData = await signInRes.json();

    if (!signInRes.ok || !signInData.access_token) {
      console.error("Sign in error:", signInData);
      return jsonResponse({ error: "Verification failed. Please try again." }, 500);
    }

    // 6. Mark OTP as verified ONLY after successful session
    await supabaseAdmin
      .from("otp_codes")
      .update({ verified: true })
      .eq("id", otpRecord.id);

    return jsonResponse({
      success: true,
      access_token: signInData.access_token,
      refresh_token: signInData.refresh_token,
      user: {
        id: signInData.user?.id || userId!,
        phone: fullPhone,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return jsonResponse({ error: "Verification failed. Please try again." }, 500);
  }
});
