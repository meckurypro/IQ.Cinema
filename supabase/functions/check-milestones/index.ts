// supabase/functions/check-milestones/index.ts
//
// Scheduled job (wire up via Supabase's pg_cron -> Edge Function trigger,
// or an external scheduler hitting this URL daily). Refreshes episode_count
// on creator_metrics (unique_views/watch_hours are kept live by record_play),
// and notifies approved creators who just became partner-eligible so they
// know to apply — hitting the bar never auto-upgrades them (admin approves).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Refresh episode_count + last_upload_at per creator
  const { data: creators } = await supabase
    .from("profiles")
    .select("id")
    .eq("creator_status", "approved");

  for (const creator of creators ?? []) {
    const { count } = await supabase
      .from("episodes")
      .select("id, titles!inner(creator_id)", { count: "exact", head: true })
      .eq("titles.creator_id", creator.id)
      .eq("status", "published");

    const { data: lastEpisode } = await supabase
      .from("episodes")
      .select("published_at, titles!inner(creator_id)")
      .eq("titles.creator_id", creator.id)
      .order("published_at", { ascending: false })
      .limit(1)
      .single();

    await supabase
      .from("creator_metrics")
      .update({
        episode_count: count ?? 0,
        last_upload_at: lastEpisode?.published_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", creator.id);

    const { data: eligibility } = await supabase.rpc("check_partner_eligibility", {
      p_user_id: creator.id,
    });

    if (eligibility?.eligible) {
      // avoid spamming: only notify if no pending/approved partner application already exists
      const { data: existingApp } = await supabase
        .from("partner_applications")
        .select("id")
        .eq("user_id", creator.id)
        .in("status", ["pending", "approved"])
        .maybeSingle();

      if (!existingApp) {
        await supabase.from("notifications").insert({
          user_id: creator.id,
          type: "partner_eligible",
          title: "You're eligible for the Partner Program",
          body: "You've hit the milestone thresholds. Apply from your creator dashboard to unlock payouts.",
        });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: creators?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
