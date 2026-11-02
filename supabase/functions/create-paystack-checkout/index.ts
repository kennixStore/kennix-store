import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://kennixstore.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PAYSTACK_KEY = Deno.env.get("PAYSTACK_SECRET_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY || !PAYSTACK_KEY) {
      return reply({ error: "Payment service is not configured" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const customer = body.customer;
    const items = body.items;

    if (
      typeof customer?.name !== "string" || !customer.name.trim() ||
      typeof customer?.phone !== "string" || !customer.phone.trim() ||
      typeof customer?.email !== "string" || !customer.email.trim() ||
      typeof customer?.address !== "string" || !customer.address.trim()
    ) {
      return reply({ error: "Please provide your name, phone, email and delivery address." }, 400);
    }

    const customerEmail = customer.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return reply({ error: "Please enter a valid email address." }, 400);
    }

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 30
    ) {
      return reply({ error: "Your shopping bag is empty or invalid." }, 400);
    }

    const cleanItems = [];
    let total = 0;
    let totalQuantity = 0;

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      const variantId = item.variant_id ? Number(item.variant_id) : null;

      if (
        !Number.isSafeInteger(productId) ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return reply({ error: "Invalid product or quantity." }, 400);
      }

      const { data: product, error: productError } = await supabase
        .from("products")
        .select('id, "Name", "Price", "Is_active"')
        .eq("id", productId)
        .single();

      if (productError || !product || product["Is_active"] === false) {
        return reply({ error: "A product in your bag is unavailable." }, 400);
      }

      let price = Number(product["Price"]);
      let variantLabel = null;

      if (variantId === null) {
        const { data: availableVariants, error: variantsError } = await supabase
          .from("product_variants")
          .select("id")
          .eq("product_id", productId)
          .eq("is_active", true)
          .limit(1);

        if (variantsError) throw variantsError;
        if (availableVariants && availableVariants.length > 0) {
          return reply({ error: `Please select an option for ${product["Name"]}.` }, 400);
        }
      }

      if (variantId !== null) {
        const { data: variant, error: variantError } = await supabase
          .from("product_variants")
          .select("id, color, size, stock_quantity, price, is_active")
          .eq("id", variantId)
          .eq("product_id", productId)
          .single();

        if (
          variantError ||
          !variant ||
          !variant.is_active ||
          variant.stock_quantity < quantity
        ) {
          return reply({
            error: `Insufficient stock or unavailable option for ${product["Name"]}.`,
          }, 400);
        }

        if (variant.price !== null) {
          price = Number(variant.price);
        }

        variantLabel = `${variant.color} / ${variant.size}`;
      }

      if (!Number.isFinite(price) || price <= 0) {
        return reply({ error: "A product has an invalid price." }, 400);
      }

      const lineTotal = price * quantity;
      total += lineTotal;
      totalQuantity += quantity;

      cleanItems.push({
        product_id: productId,
        variant_id: variantId,
        product_name: product["Name"],
        variant_label: variantLabel,
        quantity,
        unit_price: price,
        line_total: lineTotal,
      });
    }

    const amountKobo = Math.round(total * 100);

    if (!Number.isSafeInteger(amountKobo) || amountKobo < 100) {
      return reply({ error: "Invalid payment amount." }, 400);
    }

    const orderReference = `KNX-${crypto.randomUUID()}`;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_name: customer.name.trim(),
        customer_phone: customer.phone.trim(),
        customer_email: customerEmail,
        delivery_address: customer.address.trim(),
        product_name: cleanItems.map((i) => i.product_name).join(", "),
        quantity: totalQuantity,
        unit_price: total / totalQuantity,
        total_amount: total,
        status: "pending",
        order_reference: orderReference,
        payment_reference: orderReference,
        payment_status: "pending",
        payment_provider: "paystack",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      console.error("Order creation failed:", orderError);
      return reply({ error: "Could not create your order." }, 500);
    }

    const orderItems = cleanItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Order items failed:", itemsError);
      await supabase.from("orders").delete().eq("id", order.id);
      return reply({ error: "Could not save your order items." }, 500);
    }

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: customer.email.trim(),
          amount: amountKobo,
          reference: orderReference,
          callback_url: "https://kennixstore.github.io/kennix-store/?payment=return",
          metadata: {
            order_id: order.id,
            order_reference: orderReference,
          },
        }),
      },
    );

    const payment = await paystackResponse.json();

    if (!paystackResponse.ok || !payment.status || !payment.data?.authorization_url) {
      console.error("Paystack initialization failed:", payment);
      const { error: failureUpdateError } = await supabase
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", order.id);

      if (failureUpdateError) {
        console.error("Could not mark failed checkout:", failureUpdateError);
      }

      return reply({ error: "Payment could not be started. Please try again." }, 502);
    }


    return reply({
      success: true,
      order_reference: orderReference,
      authorization_url: payment.data.authorization_url,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return reply({ error: "Something went wrong. Please try again." }, 500);
  }
});
