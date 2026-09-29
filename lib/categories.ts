// lib/categories.ts

// Mirrors the CHECK constraint on public.titles.category.
export const CATEGORIES = [
  { value: "drama", label: "Drama", labelKey: "category.drama" },
  { value: "story", label: "Story", labelKey: "category.story" },
  { value: "anime", label: "Anime", labelKey: "category.anime" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export const DEFAULT_CATEGORY: Category = "drama";
