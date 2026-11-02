import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyPaystackSignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return constantTimeEqual(toHex(new Uint8Array(digest)), signature);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!supabaseUrl || !serviceRoleKey || !paystackSecret) {
      console.error("Webhook environment is not fully configured.");
      return json({ error: "Webhook is not configured" }, 500);
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") ?? "";

    if (!signature || !(await verifyPaystackSignature(rawBody, signature, paystackSecret))) {
      return json({ error: "Invalid signature" }, 401);
    }

    const event = JSON.parse(rawBody);

    // Acknowledge unrelated events; only successful charges can complete orders.
    if (event.event !== "charge.success") {
      return json({ received: true });
    }

    const payment = event.data;
    const reference = payment?.reference;
    const amountKobo = payment?.amount;

    if (
      payment?.status !== "success" ||
      payment?.currency !== "NGN" ||
      typeof reference !== "string" ||
      !reference ||
      !Number.isSafeInteger(amountKobo) ||
      amountKobo < 100
    ) {
      return json({ error: "Invalid successful payment payload" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, total_amount, payment_status, payment_provider, payment_reference")
      .eq("payment_reference", reference)
      .maybeSingle();

    if (orderError) {
      console.error("Order lookup failed:", orderError);
      return json({ error: "Could not verify order" }, 500);
    }

    if (!order) {
      console.error("No order matches Paystack reference:", reference);
      return json({ error: "Order not found" }, 404);
    }

    if (order.payment_provider !== "paystack") {
      return json({ error: "Payment provider mismatch" }, 400);
    }

    if (order.payment_status === "paid") {
      return json({ received: true, already_processed: true });
    }

    const expectedKobo = Math.round(Number(order.total_amount) * 100);
    if (!Number.isSafeInteger(expectedKobo) || expectedKobo !== amountKobo) {
      console.error("Payment amount mismatch for order:", order.id);
      return json({ error: "Payment amount mismatch" }, 400);
    }

    const { error: confirmError } = await supabase.rpc(
      "confirm_kennix_paid_order",
      {
        p_order_id: order.id,
        p_payment_reference: reference,
        p_amount_kobo: amountKobo,
      },
    );

    if (confirmError) {
      console.error("Paid order confirmation failed:", confirmError);
      return json({ error: "Could not confirm payment" }, 500);
    }

    return json({ received: true, confirmed: true });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
