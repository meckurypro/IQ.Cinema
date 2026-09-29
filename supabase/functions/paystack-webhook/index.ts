// supabase/functions/paystack-webhook/index.ts
//
// Receives charge.success events from Paystack. Verifies the HMAC signature
// (never trust an unverified webhook — this moves real money), then credits
// coins or activates a subscription based on the transaction's metadata.
//
// Configure this URL in the Paystack dashboard as your webhook endpoint.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PAYSTACK_SECRET_KEY),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const valid = await verifySignature(rawBody, signature);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (event.event === "charge.success") {
    const { reference, metadata, amount } = event.data;

    // idempotency: skip if this reference was already completed
    const { data: existing } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("reference", reference)
      .single();

    if (!existing || existing.status === "completed") {
      return new Response("ok", { status: 200 });
    }

    const userId = metadata.user_id;
    const amountNaira = amount / 100;

    if (metadata.purchase_type === "coins") {
      await supabase.rpc("credit_coins", {
        p_user_id: userId,
        p_coins: metadata.coins,
        p_amount_naira: amountNaira,
        p_reference: reference,
      });
      await supabase.from("transactions").update({ status: "completed" }).eq("reference", reference);
    } else if (metadata.purchase_type === "subscription") {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", metadata.item_id)
        .single();

      const intervalMap: Record<string, string> = {
        weekly: "7 days",
        monthly: "1 month",
        annual: "1 year",
      };

      const periodEnd = new Date();
      // naive interval add; fine for the scaffold, swap for a date-fns helper in production
      if (plan.interval === "weekly") periodEnd.setDate(periodEnd.getDate() + 7);
      if (plan.interval === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
      if (plan.interval === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);

      await supabase.from("subscriptions").insert({
        user_id: userId,
        plan_id: plan.id,
        status: "active",
        current_period_end: periodEnd.toISOString(),
      });

      await supabase.from("transactions").update({ status: "completed" }).eq("reference", reference);
    }
  }

  return new Response("ok", { status: 200 });
});
