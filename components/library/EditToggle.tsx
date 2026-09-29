// components/library/EditToggle.tsx

import { SquarePen } from "lucide-react";

// Enters and leaves edit mode. Sits beside the category filter, matching its
// height, rather than in the tab row — see LibraryTabs.
export function EditToggle({
  editing,
  disabled,
  onToggle,
}: {
  editing: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !editing}
      aria-label={editing ? "Done editing" : "Edit list"}
      className="grid h-11 min-w-11 shrink-0 place-items-center rounded-full px-1 text-text transition-opacity disabled:opacity-30"
    >
      {editing ? (
        <span className="px-2 text-[15px] font-semibold text-pink">Done</span>
      ) : (
        <SquarePen size={24} strokeWidth={1.75} />
      )}
    </button>
  );
}
