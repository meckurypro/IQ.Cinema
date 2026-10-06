// components/rewards/AdWatchSheet.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// House-ad rewarded flow: start_ad_view picks a promo and returns how long to
// hold the sheet open; the ring counts that down for real (no skipping) and
// complete_ad_view pays out once the time is actually up. A network stall or
// closing early just leaves the task unclaimed for next time — nothing here
// assumes success.
export function AdWatchSheet({
  open,
  taskKey,
  onClose,
  onCredited,
}: {
  open: boolean;
  taskKey: string | null;
  onClose: () => void;
  onCredited: (coins: number) => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<"loading" | "playing" | "done" | "error">("loading");
  const [ad, setAd] = useState<{ title: string; cta_label: string | null; cta_url: string | null } | null>(
    null
  );
  const [duration, setDuration] = useState(15);
  const [remaining, setRemaining] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [credited, setCredited] = useState(0);
  const viewIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !taskKey) return;
    setPhase("loading");
    setError(null);
    setCredited(0);
    supabase.rpc("start_ad_view", { p_task_key: taskKey }).then(({ data, error: rpcError }) => {
      if (rpcError || !data?.ok) {
        setError(data?.error === "daily_cap_reached" ? t("ads.dailyLimit") : t("ads.unavailable"));
        setPhase("error");
        return;
      }
      viewIdRef.current = data.view_id;
      setAd(data.ad);
      setDuration(data.duration_seconds);
      setRemaining(data.duration_seconds);
      setPhase("playing");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskKey]);

  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && remaining === 0 && viewIdRef.current) {
      supabase.rpc("complete_ad_view", { p_view_id: viewIdRef.current }).then(({ data, error: rpcError }) => {
        if (rpcError || !data?.ok) {
          setError(t("ads.confirmFailed"));
          setPhase("error");
          return;
        }
        setCredited(data.credited);
        setPhase("done");
        onCredited(data.credited);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase]);

  const progress = phase === "playing" ? (duration - remaining) / duration : phase === "done" ? 1 : 0;

  return (
    <BottomSheet open={open} onClose={onClose} title={ad?.title ?? t("ads.watchToEarn")}>
      <div className="flex flex-col items-center gap-4 px-5 py-6 text-center">
        {phase === "error" ? (
          <>
            <p className="text-[14px] text-crimson">{error}</p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        ) : phase === "done" ? (
          <>
            <div className="coin-pop flex h-16 w-16 items-center justify-center rounded-full bg-gold-soft">
              <Zap size={28} className="fill-gold text-gold" />
            </div>
            <p className="font-display text-lg font-semibold text-text">+{credited} reward coins</p>
            <Button size="sm" onClick={onClose}>
              Nice
            </Button>
          </>
        ) : (
          <>
            <div className="relative flex h-16 w-16 items-center justify-center">
              <svg width={64} height={64} className="-rotate-90">
                <circle cx={32} cy={32} r={RADIUS} fill="none" strokeWidth={5} className="stroke-border" />
                <circle
                  cx={32}
                  cy={32}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={5}
                  strokeLinecap="round"
                  className="stroke-pink transition-[stroke-dashoffset] duration-1000 ease-linear"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
                />
              </svg>
              <span
                className={clsx(
                  "absolute font-display text-[15px] font-semibold text-text",
                  phase === "loading" && "animate-pulse"
                )}
              >
                {phase === "loading" ? "" : remaining}
              </span>
            </div>
            <p className="text-[13px] text-muted">
              {phase === "loading" ? t("common.loading") : t("ads.stayOnScreen")}
            </p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
