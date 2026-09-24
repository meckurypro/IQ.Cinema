"use client";

import { createClient } from "@/lib/supabase/client";

type PurchaseType = "coins" | "subscription";

export async function initializePaystackPurchase(purchaseType: PurchaseType, itemId: string) {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/paystack-initialize`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ purchaseType, itemId }),
    }
  );

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Could not start payment");
  return json as { authorization_url: string; access_code: string; reference: string };
}

/** Redirects the browser to Paystack's hosted checkout. */
export function redirectToPaystackCheckout(authorizationUrl: string) {
  window.location.href = authorizationUrl;
}
