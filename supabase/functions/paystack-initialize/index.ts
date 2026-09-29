// supabase/functions/paystack-initialize/index.ts
//
// Called from the client when the user taps "Buy" on a coin pack or
// subscription plan. Verifies the pack/plan server-side (never trusts a
// client-supplied amount), then asks Paystack to initialize a transaction
// and returns the checkout URL / access_code to the client.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve the calling user from their JWT.
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) throw new Error("Invalid session");
    const user = userData.user;

    const { purchaseType, itemId } = await req.json(); // purchaseType: 'coins' | 'subscription'

    let amountNaira: number;
    let metadata: Record<string, unknown> = { user_id: user.id, purchase_type: purchaseType, item_id: itemId };

    if (purchaseType === "coins") {
      const { data: pack, error } = await supabase
        .from("coin_packs")
        .select("*")
        .eq("id", itemId)
        .eq("is_active", true)
        .single();
      if (error || !pack) throw new Error("Coin pack not found");
      amountNaira = Number(pack.price_naira);
      metadata = { ...metadata, coins: pack.coins + pack.bonus_coins };
    } else if (purchaseType === "subscription") {
      const { data: plan, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", itemId)
        .eq("is_active", true)
        .single();
      if (error || !plan) throw new Error("Subscription plan not found");
      amountNaira = Number(plan.price_naira);
      metadata = { ...metadata, plan_interval: plan.interval };
    } else {
      throw new Error("Invalid purchase type");
    }

    const reference = `iqc_${purchaseType}_${crypto.randomUUID()}`;

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: Math.round(amountNaira * 100), // kobo
        reference,
        currency: "NGN",
        metadata,
      }),
    });

    const paystackJson = await paystackRes.json();
    if (!paystackRes.ok || !paystackJson.status) {
      throw new Error(paystackJson.message || "Paystack initialization failed");
    }

    // Record a pending transaction so the webhook has something to reconcile.
    await supabase.from("transactions").insert({
      user_id: user.id,
      type: purchaseType === "coins" ? "coin_purchase" : "subscription_purchase",
      status: "pending",
      amount_naira: amountNaira,
      reference,
      metadata,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        authorization_url: paystackJson.data.authorization_url,
        access_code: paystackJson.data.access_code,
        reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
