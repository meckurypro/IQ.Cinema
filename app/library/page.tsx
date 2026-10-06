// app/library/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyList } from "@/hooks/useMyList";
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { groupByDay, type ListKind } from "@/lib/myList";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { LibraryTabs, type TopTab } from "@/components/library/LibraryTabs";
import { SegmentedControl } from "@/components/library/SegmentedControl";
import { SubscribeBanner } from "@/components/library/SubscribeBanner";
import { PosterCard } from "@/components/library/PosterCard";
import { HistoryRow } from "@/components/library/HistoryRow";
import { EmptyState } from "@/components/library/EmptyState";
import { useI18n } from "@/hooks/useI18n";

type ReminderTab = "released" | "upcoming";

const REMINDER_OPTIONS = [
  { value: "released", label: "Released", labelKey: "library.released" },
  { value: "upcoming", label: "Upcoming", labelKey: "library.upcoming" },
] as const;

const supabase = createClient();

export default function LibraryPage() {
  const { t, lang } = useI18n();
  const { user, loading: authLoading } = useAuth();

  const [top, setTop] = useState<TopTab>("following");
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [reminderTab, setReminderTab] = useState<ReminderTab>("released");

  const kind: ListKind =
    top === "reminders"
      ? reminderTab === "released"
        ? "reminders_released"
        : "reminders_upcoming"
      : top;

  const { items, error, refresh, mutate } = useMyList(
    user?.id,
    kind,
    top === "reminders" ? null : category
  );

  const groups = useMemo(() => (top === "history" && items ? groupByDay(items, t, lang) : []), [top, items, t, lang]);

  function toggleFollow(titleId: string, next: boolean) {
    return mutate(
      (rows) => rows.map((r) => (r.title_id === titleId ? { ...r, is_following: next } : r)),
      () => supabase.rpc("set_titles_follow", { p_title_ids: [titleId], p_follow: next })
    );
  }

  const showSkeleton = (authLoading || (user && items === null)) && !error;

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="fade-in px-4 pt-3 desk:px-0 desk:pt-8">
        <LibraryTabs value={top} onChange={setTop} />

        <div className="mt-1">
          {top === "reminders" ? (
            <SegmentedControl
              ariaLabel={t("library.reminderStatus")}
              options={REMINDER_OPTIONS}
              value={reminderTab}
              onChange={setReminderTab}
            />
          ) : (
            <SegmentedControl
              ariaLabel={t("library.category")}
              options={CATEGORIES}
              value={category}
              onChange={setCategory}
            />
          )}
        </div>

        {top === "following" && user && (
          <div className="mt-4">
            <SubscribeBanner />
          </div>
        )}

        {!user && !authLoading && (
          <EmptyState
            message={t("library.signInPrompt")}
            actionLabel={t("library.signIn")}
            href="/auth/login?next=/library"
          />
        )}

        {showSkeleton && user && (
          <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 desk:grid-cols-5 desk:gap-x-5 desk:gap-y-8 xl:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i}>
                <Skeleton className="aspect-[3/4] w-full rounded-lg" />
                <Skeleton className="mt-2 h-3.5 w-4/5" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {error && user && items === null && (
          <div className="mt-12 text-center">
            <p className="text-sm text-muted">{t("library.loadError")}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {user && items && items.length === 0 && <EmptyState />}

        {user && items && items.length > 0 && (
          <div
            key={`${kind}-${category}`}
            className="fade-in mt-5"
          >
            {top === "history" ? (
              <div className="space-y-6">
                {groups.map((group) => (
                  <section key={group.label}>
                    <h2 className="mb-3 text-[19px] font-medium text-text">{group.label}</h2>
                    <div className="space-y-4">
                      {group.items.map((item) => (
                        <HistoryRow
                          key={item.title_id}
                          item={item}
                          onToggleFollow={() => toggleFollow(item.title_id, !item.is_following)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 desk:grid-cols-5 desk:gap-x-5 desk:gap-y-8 xl:grid-cols-6">
                {items.map((item) => (
                  <PosterCard
                    key={item.title_id}
                    item={item}
                    upcoming={kind === "reminders_upcoming"}
                  />
                ))}
              </div>
            )}

            <p className="mt-8 pb-2 text-center text-[15px] text-muted/70">--The End--</p>
          </div>
        )}

        {error && items !== null && (
          <p className="mt-4 text-center text-[13px] text-crimson">
            Something went wrong: {error}
          </p>
        )}
      </div>

    </PullToRefresh>
  );
}
