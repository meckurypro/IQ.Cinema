// app/library/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyList } from "@/hooks/useMyList";
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { groupByDay, type ListKind } from "@/lib/myList";
import { PullToRefresh } from "@/components/shared/PullToRefresh";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { LibraryTabs, type TopTab } from "@/components/library/LibraryTabs";
import { SegmentedControl } from "@/components/library/SegmentedControl";
import { SubscribeBanner } from "@/components/library/SubscribeBanner";
import { PosterCard } from "@/components/library/PosterCard";
import { HistoryRow } from "@/components/library/HistoryRow";
import { EmptyState } from "@/components/library/EmptyState";
import { EditBar } from "@/components/library/EditBar";

type ReminderTab = "released" | "upcoming";

const REMINDER_OPTIONS = [
  { value: "released", label: "Released" },
  { value: "upcoming", label: "Upcoming" },
] as const;

const supabase = createClient();

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();

  const [top, setTop] = useState<TopTab>("following");
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [reminderTab, setReminderTab] = useState<ReminderTab>("released");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  // Changing view always leaves edit mode; a selection only makes sense
  // against the list it was made on.
  useEffect(() => {
    setEditing(false);
    setSelected(new Set());
  }, [kind, category]);

  const groups = useMemo(() => (top === "history" && items ? groupByDay(items) : []), [top, items]);
  const total = items?.length ?? 0;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!items) return;
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.title_id))
    );
  }

  function toggleEdit() {
    setEditing((v) => !v);
    setSelected(new Set());
  }

  async function removeSelected() {
    const ids = Array.from(selected);
    setConfirmOpen(false);
    if (!ids.length) return;

    const run =
      top === "following"
        ? () => supabase.rpc("set_titles_follow", { p_title_ids: ids, p_follow: false })
        : top === "history"
          ? () => supabase.rpc("remove_from_history", { p_title_ids: ids })
          : () => supabase.rpc("set_title_reminders", { p_title_ids: ids, p_on: false });

    const ok = await mutate((rows) => rows.filter((r) => !ids.includes(r.title_id)), run);
    if (ok) {
      setSelected(new Set());
      setEditing(false);
    }
  }

  function toggleFollow(titleId: string, next: boolean) {
    return mutate(
      (rows) => rows.map((r) => (r.title_id === titleId ? { ...r, is_following: next } : r)),
      () => supabase.rpc("set_titles_follow", { p_title_ids: [titleId], p_follow: next })
    );
  }

  const actionLabel = top === "following" ? "Unfollow" : top === "history" ? "Delete" : "Remove";
  const confirmCopy =
    top === "following"
      ? { title: "Unfollow", body: "They'll leave Following and your saved episodes for them will be cleared." }
      : top === "history"
        ? { title: "Delete from history", body: "Your watch progress for them will be cleared." }
        : { title: "Remove reminders", body: "You won't be notified when they release." };

  const showSkeleton = (authLoading || (user && items === null)) && !error;

  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="fade-in px-4 pt-5">
        <LibraryTabs
          value={top}
          onChange={setTop}
          editing={editing}
          editDisabled={!total}
          onToggleEdit={toggleEdit}
        />

        <div className="mt-1">
          {top === "reminders" ? (
            <SegmentedControl
              ariaLabel="Reminder status"
              options={REMINDER_OPTIONS}
              value={reminderTab}
              onChange={setReminderTab}
            />
          ) : (
            <SegmentedControl
              ariaLabel="Category"
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
            message="Sign in to keep track of what you follow and watch."
            actionLabel="Sign in"
            href="/auth/login?next=/library"
          />
        )}

        {showSkeleton && user && (
          <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5">
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
            <p className="text-sm text-muted">Couldn&apos;t load your list.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
              Try again
            </Button>
          </div>
        )}

        {user && items && items.length === 0 && <EmptyState />}

        {user && items && items.length > 0 && (
          <div
            key={`${kind}-${category}`}
            className="fade-in mt-5"
            style={{ paddingBottom: editing ? "4.5rem" : 0 }}
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
                          editing={editing}
                          selected={selected.has(item.title_id)}
                          onToggleSelect={() => toggleSelect(item.title_id)}
                          onToggleFollow={() => toggleFollow(item.title_id, !item.is_following)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-x-3 gap-y-5">
                {items.map((item) => (
                  <PosterCard
                    key={item.title_id}
                    item={item}
                    editing={editing}
                    selected={selected.has(item.title_id)}
                    onToggleSelect={() => toggleSelect(item.title_id)}
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

      {editing && (
        <EditBar
          selectedCount={selected.size}
          total={total}
          actionLabel={actionLabel}
          onToggleAll={toggleAll}
          onAction={() => setConfirmOpen(true)}
        />
      )}

      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={confirmCopy.title}>
        <div className="px-5 pb-5">
          <p className="text-[14px] leading-relaxed text-muted">
            {selected.size === 1 ? "1 title" : `${selected.size} titles`}. {confirmCopy.body}
          </p>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={removeSelected}>
              {actionLabel}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </PullToRefresh>
  );
}
