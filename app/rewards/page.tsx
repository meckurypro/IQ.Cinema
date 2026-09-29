// app/rewards/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Coins, Gem } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRewardsState } from "@/hooks/useRewardsState";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { StreakCalendar } from "@/components/rewards/StreakCalendar";
import { DailyOfferCard } from "@/components/rewards/DailyOfferCard";
import { TaskRow } from "@/components/rewards/TaskRow";
import { AdWatchSheet } from "@/components/rewards/AdWatchSheet";
import { WhatsAppLinkSheet } from "@/components/rewards/WhatsAppLinkSheet";
import type { RewardTask } from "@/lib/rewards";

const supabase = createClient();

export default function RewardsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { state, error, refresh, setError } = useRewardsState();
  const { display: coinsDisplay, changed: coinsChanged } = useAnimatedNumber(state?.balances.coins);
  const { display: rewardDisplay, changed: rewardChanged } = useAnimatedNumber(
    state?.balances.reward_coins
  );

  const [checkingIn, setCheckingIn] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [adTaskKey, setAdTaskKey] = useState<string | null>(null);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);

  function requireAuth() {
    router.push(`/auth/login?next=${encodeURIComponent("/rewards")}`);
  }

  async function handleCheckIn() {
    if (!user) return requireAuth();
    setCheckingIn(true);
    await supabase.rpc("daily_check_in");
    setCheckingIn(false);
    refresh();
  }

  async function handleTask(task: RewardTask) {
    if (!user) return requireAuth();
    if (task.status === "done" || busyTask) return;

    if (task.kind === "ad" || task.kind === "checkin_ad") {
      setAdTaskKey(task.key);
      return;
    }
    if (task.kind === "whatsapp" && task.status === "available") {
      setWhatsAppOpen(true);
      return;
    }
    if (task.kind === "notifications" && task.status === "available") {
      setBusyTask(task.key);
      try {
        const permission =
          typeof Notification !== "undefined" ? await Notification.requestPermission() : "denied";
        await supabase
          .from("user_settings")
          .upsert({ user_id: user.id, push_permission: permission }, { onConflict: "user_id" });
        if (permission === "granted") {
          await supabase.rpc("claim_reward_task", { p_task_key: task.key });
        }
      } finally {
        setBusyTask(null);
        refresh();
      }
      return;
    }
    if (task.kind === "social" && task.status === "available") {
      setBusyTask(task.key);
      await supabase.rpc("mark_social_visit", { p_task_key: task.key });
      if (task.action_url) window.open(task.action_url, "_blank", "noopener,noreferrer");
      setBusyTask(null);
      refresh();
      return;
    }
    if (task.kind === "reserve") {
      router.push("/library");
      return;
    }

    setBusyTask(task.key);
    const { data } = await supabase.rpc("claim_reward_task", { p_task_key: task.key });
    setBusyTask(null);
    if (!data?.ok && data?.error === "email_not_verified") {
      setError("Verify your email first — check your inbox for the confirmation link.");
    }
    refresh();
  }

  const loading = authLoading || !state;
  const weeklyMax = state ? state.streak.schedule.reduce((s, d) => s + d.coins, 0) : 0;
  const visibleTasks = state
    ? state.tasks.filter((t) => (t.kind === "ad" || t.kind === "checkin_ad" ? state.ads_available : true))
    : [];
  const bonusTask = visibleTasks.find((t) => t.key === "checkin_bonus_ad");

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">Rewards</h1>
        <NotificationBell />
      </div>

      <div className="mt-4 flex items-stretch rounded-lg border border-border bg-surface p-4">
        <Link href="/wallet" className="flex flex-1 flex-col items-center gap-1">
          {loading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <span
              className={clsx(
                "font-display text-[22px] font-semibold tabular-nums text-text",
                coinsChanged && "coin-pop"
              )}
            >
              {coinsDisplay.toLocaleString()}
            </span>
          )}
          <span className="text-[12px] text-muted">Coins</span>
        </Link>
        <div className="w-px bg-border" />
        <Link href="/wallet" className="flex flex-1 flex-col items-center gap-1">
          {loading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <span
              className={clsx(
                "font-display text-[22px] font-semibold tabular-nums text-text",
                rewardChanged && "coin-pop"
              )}
            >
              {rewardDisplay.toLocaleString()}
            </span>
          )}
          <span className="text-[12px] text-muted">Reward Coins</span>
        </Link>
      </div>

      <Link
        href="/points"
        className="mt-3 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 transition-colors active:bg-surface-raised"
      >
        <span className="flex items-center gap-2.5 text-[14px] font-medium text-text">
          <Gem size={17} className="text-pink" />
          Member Points
          {!loading && (
            <span className="font-display font-semibold tabular-nums text-pink">
              {state!.balances.points.toLocaleString()}
            </span>
          )}
        </span>
        <ChevronRight size={17} className="text-muted" />
      </Link>

      {error && (
        <p className="mt-3 rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">{error}</p>
      )}

      <section className="mt-6">
        <p className="text-[13px] text-muted">
          You've maintained streak days:{" "}
          <span className="font-semibold text-text">{loading ? "—" : state!.streak.current}</span>
        </p>
        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <StreakCalendar
              schedule={state!.streak.schedule}
              todayIndex={state!.streak.today_index}
              checkedInToday={state!.streak.checked_in_today}
            />
          )}
        </div>

        {!loading &&
          (state!.streak.checked_in_today ? (
            state!.ads_available && bonusTask ? (
              <Button
                className="mt-4 w-full"
                disabled={bonusTask.status === "done" || busyTask === bonusTask.key}
                onClick={() => handleTask(bonusTask)}
              >
                Get Bonus ({bonusTask.done_count}/{bonusTask.daily_cap})
              </Button>
            ) : null
          ) : (
            <Button className="mt-4 w-full" disabled={checkingIn} onClick={handleCheckIn}>
              {checkingIn ? "Checking in…" : "Check in"}
            </Button>
          ))}
        {weeklyMax > 0 && (
          <p className="mt-2 text-center text-[12px] text-muted">Earn up to {weeklyMax} rewards</p>
        )}
      </section>

      {!loading && state!.offers.length > 0 && (
        <section className="mt-7">
          <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">Daily Special Offers</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {state!.offers.map((o) => (
              <DailyOfferCard key={o.id} offer={o} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <h2 className="font-display mb-2.5 text-[16px] font-semibold text-text">Earn Rewards</h2>
        <div className="space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-[62px] w-full" />
              <Skeleton className="h-[62px] w-full" />
              <Skeleton className="h-[62px] w-full" />
            </>
          ) : (
            visibleTasks
              .filter((t) => t.kind !== "checkin_ad")
              .map((t) => (
                <TaskRow key={t.key} task={t} busy={busyTask === t.key} onAction={handleTask} />
              ))
          )}
        </div>
      </section>

      <Link
        href="/wallet"
        className={clsx(
          "mt-8 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-pink to-crimson px-4 py-3",
          "font-display text-[15px] font-semibold text-white transition-opacity active:opacity-80"
        )}
      >
        <Coins size={18} />
        Visit the Store
      </Link>

      <AdWatchSheet
        open={adTaskKey !== null}
        taskKey={adTaskKey}
        onClose={() => {
          setAdTaskKey(null);
          refresh();
        }}
        onCredited={() => refresh()}
      />
      <WhatsAppLinkSheet
        open={whatsAppOpen}
        onClose={() => setWhatsAppOpen(false)}
        onLinked={async () => {
          setWhatsAppOpen(false);
          await supabase.rpc("claim_reward_task", { p_task_key: "link_whatsapp" });
          refresh();
        }}
      />
    </div>
  );
}
