// lib/categories.ts

// Mirrors the CHECK constraint on public.titles.category.
export const CATEGORIES = [
  { value: "drama", label: "Drama" },
  { value: "story", label: "Story" },
  { value: "anime", label: "Anime" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export const DEFAULT_CATEGORY: Category = "drama";
