// supabase/functions/process-withdrawal/index.ts
//
// Called by the admin dashboard when an admin approves a withdrawal request.
// Initiates a Paystack transfer to the creator's bank account and updates
// the withdrawal record. Requires the caller to be an admin (checked via
// the profiles table, service-role client bypasses RLS so we check manually).

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
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) throw new Error("Invalid session");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "admin") throw new Error("Admin access required");

    const { withdrawalId } = await req.json();

    const { data: withdrawal, error: wErr } = await supabase
      .from("withdrawal_requests")
      .select("*")
      .eq("id", withdrawalId)
      .single();
    if (wErr || !withdrawal) throw new Error("Withdrawal request not found");
    if (withdrawal.status !== "requested") throw new Error("Withdrawal already processed");

    // 1. Create a Paystack transfer recipient
    const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "nuban",
        name: withdrawal.bank_account_name,
        account_number: withdrawal.bank_account_number,
        bank_code: withdrawal.bank_code,
        currency: "NGN",
      }),
    });
    const recipientJson = await recipientRes.json();
    if (!recipientRes.ok || !recipientJson.status) {
      throw new Error(recipientJson.message || "Failed to create transfer recipient");
    }

    // 2. Initiate the transfer
    const transferRes = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: Math.round(Number(withdrawal.amount_naira) * 100),
        recipient: recipientJson.data.recipient_code,
        reason: `IQ Cinema payout — withdrawal ${withdrawal.id}`,
      }),
    });
    const transferJson = await transferRes.json();
    if (!transferRes.ok || !transferJson.status) {
      throw new Error(transferJson.message || "Transfer failed");
    }

    await supabase
      .from("withdrawal_requests")
      .update({
        status: "paid",
        paystack_transfer_code: transferJson.data.transfer_code,
        reviewed_by: userData.user.id,
        reviewed_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId);

    await supabase.from("notifications").insert({
      user_id: withdrawal.user_id,
      type: "withdrawal_paid",
      title: "Withdrawal paid",
      body: `Your withdrawal of ₦${withdrawal.amount_naira} has been paid out.`,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
