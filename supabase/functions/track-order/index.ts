import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kennixstore.github.io",
  "Access-Control-Allow-Headers": "content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const normalizePhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("0") && digits.length === 11) normalized = "234" + digits.slice(1);
  else if (digits.startsWith("234") && digits.length === 13) normalized = digits;
  else if (digits.length === 10) normalized = "234" + digits;
  return /^234[789][01]\d{8}$/.test(normalized) ? normalized : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return reply({ error: "Tracking service is not configured." }, 500);
    const body = await req.json();
    const reference = String(body?.order_reference || "").trim().toUpperCase();
    const phone = normalizePhone(String(body?.phone || ""));
    if (!/^KNX-[A-F0-9]{16}$/.test(reference) || !phone) {
      return reply({ error: "Enter a valid order reference and Nigerian phone number." }, 400);
    }
    const supabase = createClient(url, key);
    // Look up by reference, then compare canonical phone numbers so older
    // orders saved as 0XXXXXXXXXX still match +234XXXXXXXXXX.
    const { data: order, error } = await supabase.from("orders")
      .select("id,order_reference,customer_phone,customer_name,created_at,status,payment_status,payment_submitted_at,payment_review_note")
      .eq("order_reference", reference).maybeSingle();
    if (error) throw error;
    if (!order || normalizePhone(String(order.customer_phone || "")) !== phone) {
      return reply({ error: "No order matched those details. Check and try again." }, 404);
    }
    const { data: items, error: itemError } = await supabase.from("order_items")
      .select("product_name,variant_label,quantity,unit_price,line_total")
      .eq("order_id", order.id);
    if (itemError) throw itemError;
    return reply({
      success: true,
      order: {
        reference: order.order_reference,
        customer_name: order.customer_name,
        created_at: order.created_at,
        order_status: order.status,
        payment_status: order.payment_status || "pending",
        payment_submitted_at: order.payment_submitted_at,
        payment_review_note: order.payment_status === "rejected" ? order.payment_review_note : null,
        items: items || [],
      },
    });
  } catch (error) {
    console.error("Order tracking failed:", error);
    return reply({ error: "Tracking is temporarily unavailable. Please try again." }, 500);
  }
});
