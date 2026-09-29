// components/rewards/TaskRow.tsx

"use client";

import {
  Bell,
  BellRing,
  CalendarClock,
  Check,
  Clock,
  Facebook,
  Gift,
  Instagram,
  Mail,
  MessageCircle,
  Play,
  Youtube,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import type { RewardTask } from "@/lib/rewards";
import { taskCtaLabel, taskProgressLabel } from "@/lib/rewards";

const ICONS: Record<string, React.ElementType> = {
  login_reward: Gift,
  link_email: Mail,
  link_whatsapp: MessageCircle,
  enable_notifications: BellRing,
  reserve_drama: CalendarClock,
  follow_youtube: Youtube,
  follow_tiktok: MessageCircle,
  follow_facebook: Facebook,
  follow_instagram: Instagram,
  watch_10: Clock,
  watch_15: Clock,
  watch_20: Clock,
  watch_ad: Play,
  checkin_bonus_ad: Play,
};

export function TaskRow({
  task,
  busy,
  onAction,
}: {
  task: RewardTask;
  busy: boolean;
  onAction: (task: RewardTask) => void;
}) {
  const Icon = ICONS[task.key] ?? Bell;
  const done = task.status === "done";
  const label = taskCtaLabel(task);
  const progressLabel = taskProgressLabel(task);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3">
      <div
        className={clsx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          done ? "bg-surface-raised text-muted" : "bg-pink/10 text-pink"
        )}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-text">
          {task.title} {progressLabel && <span className="text-muted">{progressLabel}</span>}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-gold">
          <Zap size={12} className="fill-gold" />+{task.reward_coins}
          {task.kind === "watch_time" && task.progress_seconds != null && task.threshold_seconds && !done && (
            <span className="ml-1 text-muted">
              ({Math.min(task.progress_seconds, task.threshold_seconds)}s/{task.threshold_seconds}s)
            </span>
          )}
        </p>
      </div>
      <Button
        size="sm"
        variant={done ? "secondary" : "primary"}
        disabled={done || busy}
        onClick={() => onAction(task)}
        className={clsx("shrink-0", done && "text-muted")}
      >
        {done ? <Check size={14} /> : null}
        {label}
      </Button>
    </div>
  );
}
