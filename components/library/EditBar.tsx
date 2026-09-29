// components/library/EditBar.tsx

"use client";

import { Button } from "@/components/ui/Button";
import { SelectDot } from "./SelectDot";
import { useI18n } from "@/hooks/useI18n";

// Replaces the bottom nav while editing, the same way most mobile
// list-editing UIs swap the tab bar for an action bar.
export function EditBar({
  selectedCount,
  total,
  actionLabel,
  onToggleAll,
  onAction,
}: {
  selectedCount: number;
  total: number;
  actionLabel: string;
  onToggleAll: () => void;
  onAction: () => void;
}) {
  const { t } = useI18n();
  const allSelected = total > 0 && selectedCount === total;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={onToggleAll}
          className="flex items-center gap-2.5 text-[15px] font-medium text-text"
        >
          <SelectDot selected={allSelected} className={allSelected ? "" : "border-muted/60 bg-transparent"} />
          {allSelected ? t("common.deselectAll") : t("common.selectAll")}
        </button>
        <Button variant="danger" size="md" disabled={selectedCount === 0} onClick={onAction}>
          {actionLabel}
          {selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
      </div>
    </div>
  );
}
