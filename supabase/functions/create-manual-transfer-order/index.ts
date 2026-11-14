import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const normalizePhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("0") && digits.length === 11) normalized = "234" + digits.slice(1);
  else if (digits.startsWith("234") && digits.length === 13) normalized = digits;
  else if (digits.length === 10) normalized = "234" + digits;
  return /^234[789][01]\d{8}$/.test(normalized) ? normalized : null;
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return reply({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return reply({ error: "Order service is not configured." }, 500);

    const supabase = createClient(url, serviceKey);
    if (req.method === "GET") {
      const params = new URL(req.url).searchParams;
      const visitorId = params.get("visitor_id")?.trim() || "";
      if (visitorId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) {
          return reply({ error: "Invalid visitor identifier." }, 400);
        }
        const { data: visitorCode, error: visitorCodeError } = await supabase.rpc(
          "kennix_get_or_create_visitor_referral",
          { p_visitor_id: visitorId }
        );
        if (visitorCodeError) throw visitorCodeError;
        return reply({ success: true, referral_code: visitorCode });
      }
      const code = params.get("referral_code")?.trim().toUpperCase() || "";
      if (!/^[A-Z0-9]{6,40}$/.test(code)) return reply({ error: "Enter a valid referral code." }, 400);
      const { data: referral, error: referralError } = await supabase
        .from("kennix_referral_codes").select("code").eq("code", code).eq("is_active", true).maybeSingle();
      if (referralError) throw referralError;
      if (!referral) return reply({ error: "Referral code not found or inactive." }, 404);
      const { data: rewards, error: rewardsError } = await supabase
        .from("kennix_referral_rewards").select("status,reward_amount").eq("referral_code", code);
      if (rewardsError) throw rewardsError;
      const successful = (rewards || []).filter((row: any) => ["approved", "paid"].includes(row.status));
      const pending = (rewards || []).filter((row: any) => row.status === "pending");
      const earned = successful.reduce((sum: number, row: any) => sum + Number(row.reward_amount || 0), 0);
      return reply({
        success: true,
        referral_code: code,
        successful_referrals: successful.length,
        pending_referrals: pending.length,
        earned_amount: Math.round(earned * 100) / 100,
        target: 5,
        target_reward: 1500
      });
    }
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
        .from("products").select('id, "Name", "Price", "Is_active", compare_at_price')
        .eq("id", productId).single();
      if (productError || !product || product["Is_active"] !== true) {
        return reply({ error: "A product in your bag is unavailable." }, 400);
      }

      let price = Number(product["Price"]);
      let compareAtPrice = product.compare_at_price === null ? null : Number(product.compare_at_price);
      let variantLabel: string | null = null;

      // KENNIX checkout no longer requires colour/size variants. Historical variant
      // records remain untouched; all new orders use the product's base price.
      const ignoredVariantId = variantId;
      void ignoredVariantId;

      if (!Number.isFinite(price) || price <= 0) return reply({ error: "A product has an invalid price." }, 400);
      const lineTotal = Math.round(price * quantity * 100) / 100;
      total += lineTotal;
      totalQuantity += quantity;
      cleanItems.push({
        product_id: productId, variant_id: variantId,
        product_name: product["Name"], variant_label: variantLabel,
        quantity, unit_price: price, line_total: lineTotal,
        promo_eligible: !(compareAtPrice !== null && Number.isFinite(compareAtPrice) && compareAtPrice > price),
      });
    }

    total = Math.round(total * 100) / 100;
    if (!Number.isFinite(total) || total <= 0) return reply({ error: "Invalid order total." }, 400);

    const phone = normalizePhone(customer.phone);
    if (!phone) return reply({ error: "Enter a valid Nigerian phone number, e.g. +2349135102119." }, 400);
    const phoneFormats = [phone, "0" + phone.slice(3), "+" + phone];
    const { data: previousPaidOrders, error: historyError } = await supabase
      .from("orders").select("id").eq("payment_status", "paid")
      .in("customer_phone", phoneFormats).limit(1);
    if (historyError) throw historyError;

    const isFirstPurchase = !previousPaidOrders?.length;
    const eligibleSubtotal = cleanItems
      .filter((item) => item.promo_eligible)
      .reduce((sum, item) => sum + item.line_total, 0);
    const discountAmount = isFirstPurchase
      ? Math.round(eligibleSubtotal * 0.13 * 100) / 100
      : 0;
    let finalTotal = Math.round((total - discountAmount) * 100) / 100;
    if (finalTotal <= 0) return reply({ error: "Invalid discounted order total." }, 400);

    const couponCode = typeof body?.coupon_code === "string" ? body.coupon_code.trim().toUpperCase() : "";
    let couponDiscount = 0;
    let couponRecord: any = null;
    if (couponCode) {
      const { data: coupon, error: couponError } = await supabase
        .from("kennix_coupons").select("*").eq("code", couponCode).eq("is_active", true).maybeSingle();
      if (couponError) throw couponError;
      const now = Date.now();
      if (!coupon || (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) ||
          (coupon.ends_at && new Date(coupon.ends_at).getTime() < now) ||
          (coupon.usage_limit !== null && Number(coupon.usage_count) >= Number(coupon.usage_limit))) {
        return reply({ error: "This coupon code is invalid, expired or no longer available." }, 400);
      }
      if (total < Number(coupon.minimum_order || 0)) {
        return reply({ error: `This coupon requires a minimum order of ${Number(coupon.minimum_order).toLocaleString("en-NG")}.` }, 400);
      }
      couponRecord = coupon;
      const couponBase = Math.max(0, finalTotal);
      couponDiscount = coupon.discount_type === "percent"
        ? Math.round(couponBase * Number(coupon.discount_value) / 100 * 100) / 100
        : Math.min(couponBase, Number(coupon.discount_value));
      if (coupon.maximum_discount !== null) couponDiscount = Math.min(couponDiscount, Number(coupon.maximum_discount));
      couponDiscount = Math.min(couponBase, Math.max(0, couponDiscount));
      finalTotal = Math.round((finalTotal - couponDiscount) * 100) / 100;
    }
    if (finalTotal <= 0) return reply({ error: "The discounts make this order total invalid. Please contact KENNIX." }, 400);

    const referralCode = typeof body?.referral_code === "string" ? body.referral_code.trim().toUpperCase() : "";
    let referralRecord: any = null;
    if (referralCode) {
      const { data: referral, error: referralError } = await supabase
        .from("kennix_referral_codes").select("*").eq("code", referralCode).eq("is_active", true).maybeSingle();
      if (referralError) throw referralError;
      if (!referral) return reply({ error: "This referral code is invalid or inactive." }, 400);
      const referrerPhone = referral.referrer_phone ? normalizePhone(String(referral.referrer_phone)) : null;
      if (referrerPhone && referrerPhone === phone) return reply({ error: "You cannot use your own referral code." }, 400);
      referralRecord = referral;
      const { data: priorReferral, error: priorReferralError } = await supabase
        .from("kennix_referral_rewards").select("id")
        .eq("referral_code", referralCode).eq("referred_phone", phone).maybeSingle();
      if (priorReferralError) throw priorReferralError;
      if (priorReferral) return reply({ error: "This phone number has already used this referral code. Each friend can count only once." }, 409);
    }

    // Allocate both discounts proportionally across eligible order lines.
    let discountRemaining = discountAmount + couponDiscount;
    const eligibleLines = cleanItems.filter((item) => item.promo_eligible);
    for (let index = 0; index < eligibleLines.length; index++) {
      const item = eligibleLines[index];
      const combinedDiscount = discountAmount + couponDiscount;
      const lineDiscount = index === eligibleLines.length - 1
        ? discountRemaining
        : Math.round((combinedDiscount * item.line_total / eligibleSubtotal) * 100) / 100;
      discountRemaining = Math.round((discountRemaining - lineDiscount) * 100) / 100;
      item.line_total = Math.round((item.line_total - lineDiscount) * 100) / 100;
      item.unit_price = Math.round((item.line_total / item.quantity) * 100) / 100;
    }
    for (const item of cleanItems) delete item.promo_eligible;

    const reference = `KNX-${crypto.randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
    const address = [customer.address.trim(), customer.city.trim(), customer.state.trim(),
      typeof customer.landmark === "string" && customer.landmark.trim() ? customer.landmark.trim() : null]
      .filter(Boolean).join(", ");

    const { data: order, error: orderError } = await supabase.from("orders").insert({
      customer_name: customer.name.trim().slice(0, 120),
      customer_phone: phone.slice(0, 30),
      customer_email: customer.email.trim().toLowerCase(),
      delivery_address: address.slice(0, 1000),
      product_name: cleanItems.map((item) => item.product_name).join(", ").slice(0, 1000),
      quantity: totalQuantity,
      unit_price: Math.round((finalTotal / totalQuantity) * 100) / 100,
      discount_amount: discountAmount,
      delivery_fee: 0,
      status: "Pending",
      order_reference: reference,
      payment_reference: reference,
      payment_status: "pending",
      payment_provider: "manual_transfer",
      coupon_code: couponRecord ? couponCode : null,
      referral_code: referralRecord ? referralCode : null,
      coupon_discount: couponDiscount,
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

    if (referralRecord && Number(referralRecord.reward_amount) > 0) {
      const { error: rewardError } = await supabase.from("kennix_referral_rewards").insert({
        referral_code: referralCode, order_id: order.id, referred_phone: phone,
        reward_amount: Number(referralRecord.reward_amount), status: "pending"
      });
      if (rewardError) {
        console.error("Referral reward record failed:", rewardError);
        await supabase.from("orders").delete().eq("id", order.id);
        return reply({ error: "We could not safely record this referral. Please check the code and try again." }, 409);
      }
    }

    // Personal referral codes are issued on the first website visit, not at checkout.
    const customerReferralCode: string | null = null;

    return reply({
      success: true,
      order_id: order.id,
      customer_referral_code: customerReferralCode,
      order_reference: reference,
      amount: finalTotal,
      subtotal: total,
      discount_amount: discountAmount,
      coupon_discount: couponDiscount,
      coupon_code: couponRecord ? couponCode : null,
      referral_code: referralRecord ? referralCode : null,
      first_purchase_offer: isFirstPurchase,
      delivery_fee: 0,
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
