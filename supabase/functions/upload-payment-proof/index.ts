import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kennixstore.github.io",
  "Access-Control-Allow-Headers": "content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const normalizePhone = (value: string) => value.trim().replace(/[\\s()-]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "Upload service is not configured." }, 500);

    const body = await req.json();
    const reference = String(body?.order_reference || "").trim().toUpperCase();
    const phone = normalizePhone(String(body?.phone || ""));
    const mime = String(body?.mime_type || "").toLowerCase();
    const base64 = String(body?.file_base64 || "").replace(/^data:[^;]+;base64,/, "");

    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!/^KNX-[A-F0-9]{16}$/.test(reference) || phone.length < 7 || phone.length > 30) {
      return reply({ error: "Enter a valid order reference and phone number." }, 400);
    }
    if (!allowed.includes(mime) || !base64) {
      return reply({ error: "Upload a JPG, PNG, WEBP or PDF receipt." }, 400);
    }
    if (base64.length > 7_000_000) return reply({ error: "File must be 5 MB or smaller." }, 413);

    const binary = atob(base64);
    if (binary.length > 5 * 1024 * 1024) return reply({ error: "File must be 5 MB or smaller." }, 413);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const supabase = createClient(url, key);
    const { data: order, error: orderError } = await supabase.from("orders")
      .select("id,customer_phone,payment_status")
      .eq("order_reference", reference)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order || normalizePhone(String(order.customer_phone || "")) !== phone) {
      return reply({ error: "No order matched those details. Check and try again." }, 404);
    }
    if (order.payment_status === "paid") {
      return reply({ error: "This order's payment has already been approved." }, 409);
    }

    const extension = mime === "image/jpeg" ? "jpg" :
      mime === "image/png" ? "png" :
      mime === "image/webp" ? "webp" : "pdf";
    const path = `${order.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from("payment-proofs")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase.from("orders").update({
      payment_status: "under_review",
      payment_proof_path: path,
      payment_submitted_at: new Date().toISOString(),
      payment_reviewed_at: null,
      payment_review_note: null,
    }).eq("id", order.id);

    if (updateError) {
      await supabase.storage.from("payment-proofs").remove([path]);
      throw updateError;
    }

    return reply({ success: true, message: "Receipt uploaded. Your payment is now under review." });
  } catch (error) {
    console.error("Payment proof upload failed:", error);
    return reply({ error: "Receipt upload failed. Please try again." }, 500);
  }
});
