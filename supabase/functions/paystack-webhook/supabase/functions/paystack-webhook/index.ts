import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function verifySignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body),
  );

  const expected = Array.from(new Uint8Array(mac))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return expected === signature.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secret || !supabaseUrl || !serviceKey) {
      throw new Error("Server configuration is incomplete.");
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    const validSignature = await verifySignature(
      rawBody,
      signature,
      secret,
    );

    if (!validSignature) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);

    if (event.event !== "charge.success") {
      return new Response("Event ignored", { status: 200 });
    }

    const payment = event.data;

    if (
      payment.status !== "success" ||
      payment.currency !== "NGN" ||
      !payment.reference ||
      !Number.isSafeInteger(payment.amount)
    ) {
      return new Response("Invalid payment details", { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, total_amount, payment_reference, payment_status")
      .eq("payment_reference", payment.reference)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      return new Response("Order not found", { status: 404 });
    }

    if (order.payment_status === "paid") {
      return new Response("Payment already confirmed", { status: 200 });
    }

    const expectedAmount = Math.round(Number(order.total_amount) * 100);

    if (payment.amount !== expectedAmount) {
      return new Response("Payment amount mismatch", { status: 400 });
    }

    const { error: confirmError } = await supabase.rpc(
      "confirm_kennix_paid_order",
      {
        p_order_id: order.id,
        p_payment_reference: payment.reference,
        p_amount_kobo: payment.amount,
      },
    );

    if (confirmError) throw confirmError;

    return new Response("Payment confirmed", {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("Paystack webhook error:", error);

    return new Response("Webhook processing failed", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
