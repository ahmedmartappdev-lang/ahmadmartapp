// Signs Cloudinary upload parameters so the browser can upload directly to
// Cloudinary without ever seeing the API secret. JWT verification stays ON
// for this function (the default), so only logged-in users (vendors, admins,
// delivery partners) can obtain signatures.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Folders the app is allowed to upload into — mirrors the old storage buckets.
const ALLOWED_FOLDERS = new Set([
  "product-images",
  "category-images",
  "banner-images",
  "bill-images",
  "delivery-documents",
  "vendor-photos",
]);

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
    if (!cloudName || !apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: "Image service not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { folder } = await req.json();
    if (!folder || !ALLOWED_FOLDERS.has(folder)) {
      return new Response(
        JSON.stringify({ error: "Invalid upload folder." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary signature: signed params sorted alphabetically + API secret.
    const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);

    return new Response(
      JSON.stringify({ cloudName, apiKey, timestamp, folder, signature }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("cloudinary-sign error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
