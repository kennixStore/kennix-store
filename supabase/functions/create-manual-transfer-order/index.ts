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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "Order service is not configured." }, 500);

    const supabase = createClient(url, serviceKey);
    const body = await req.json();
    const customer = body?.customer;
    const items = body?.items;

    if (
      typeof customer?.name !== "string" || !customer.name.trim() ||
      typeof customer?.phone !== "string" || !customer.phone.trim() ||
      typeof customer?.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()) ||
      typeof customer?.address !== "string" || !customer.address.trim() ||
      typeof customer?.state !== "string" || !customer.state.trim() ||
      typeof customer?.city !== "string" || !customer.city.trim()
    ) return reply({ error: "Enter your name, phone, valid email, delivery address, state and city." }, 400);

    if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
      return reply({ error: "Your shopping bag is empty or invalid." }, 400);
    }

    const cleanItems = [];
    let total = 0;
    let totalQuantity = 0;

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      const variantId = item.variant_id == null ? null : Number(item.variant_id);
      if (!Number.isSafeInteger(productId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20 ||
          (variantId !== null && !Number.isSafeInteger(variantId))) {
        return reply({ error: "A product or quantity in your bag is invalid." }, 400);
      }

      const { data: product, error: productError } = await supabase
        .from("products").select('id, "Name", "Price", "Is_active"')
        .eq("id", productId).single();
      if (productError || !product || product["Is_active"] !== true) {
        return reply({ error: "A product in your bag is unavailable." }, 400);
      }

      let price = Number(product["Price"]);
      let variantLabel: string | null = null;

      if (variantId === null) {
        const { data: activeVariants, error } = await supabase
          .from("product_variants").select("id")
          .eq("product_id", productId).eq("is_active", true).limit(1);
        if (error) throw error;
        if (activeVariants?.length) return reply({ error: `Select a size/colour for ${product["Name"]}.` }, 400);
      } else {
        const { data: variant, error } = await supabase
          .from("product_variants")
          .select("id, color, size, stock_quantity, price, is_active")
          .eq("id", variantId).eq("product_id", productId).single();
        if (error || !variant || variant.is_active !== true || Number(variant.stock_quantity) < quantity) {
          return reply({ error: `The selected option for ${product["Name"]} is unavailable or has insufficient stock.` }, 400);
        }
        if (variant.price !== null) price = Number(variant.price);
        variantLabel = [variant.color, variant.size].filter(Boolean).join(" / ");
      }

      if (!Number.isFinite(price) || price <= 0) return reply({ error: "A product has an invalid price." }, 400);
      const lineTotal = Math.round(price * quantity * 100) / 100;
      total += lineTotal;
      totalQuantity += quantity;
      cleanItems.push({
        product_id: productId, variant_id: variantId,
        product_name: product["Name"], variant_label: variantLabel,
        quantity, unit_price: price, line_total: lineTotal,
      });
    }

    total = Math.round(total * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) return reply({ error: "Invalid order total." }, 400);

    const reference = `KNX-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const address = [customer.address.trim(), customer.city.trim(), customer.state.trim(),
      typeof customer.landmark === "string" && customer.landmark.trim() ? customer.landmark.trim() : null]
      .filter(Boolean).join(", ");

    const { data: order, error: orderError } = await supabase.from("orders").insert({
      customer_name: customer.name.trim().slice(0, 120),
      customer_phone: customer.phone.trim().slice(0, 30),
      customer_email: customer.email.trim().toLowerCase(),
      delivery_address: address.slice(0, 1000),
      product_name: cleanItems.map((item) => item.product_name).join(", ").slice(0, 1000),
      quantity: totalQuantity,
      unit_price: Math.round((total / totalQuantity) * 100) / 100,
      total_amount: total,
      status: "Pending",
      order_reference: reference,
      payment_reference: reference,
      payment_status: "pending",
      payment_provider: "manual_transfer",
    }).select("id").single();

    if (orderError || !order) {
      console.error("Manual order insert failed:", orderError);
      return reply({ error: "We could not create your order. Please try again." }, 500);
    }

    const { error: itemError } = await supabase.from("order_items").insert(
      cleanItems.map((item) => ({ ...item, order_id: order.id }))
    );
    if (itemError) {
      console.error("Manual order items insert failed:", itemError);
      await supabase.from("orders").delete().eq("id", order.id);
      return reply({ error: "We could not save your order items. Please try again." }, 500);
    }

    return reply({
      success: true,
      order_id: order.id,
      order_reference: reference,
      amount: total,
      payment_status: "pending",
      payment: {
        bank: "OPay",
        account_name: "Romanus Okonkowo Eze",
        account_number: "9066045837",
        instructions: "Transfer the exact amount, then upload your transfer receipt. Your order will remain pending until KENNIX verifies the payment."
      }
    });
  } catch (error) {
    console.error("Manual transfer order error:", error);
    return reply({ error: "Something went wrong. Please try again." }, 500);
  }
});
