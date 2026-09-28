// Content rating is a film-level attribute (lives on `titles`, not
// `episodes`). Creators pick it when creating a title and can change it
// later from the project's management page. Keep in sync with the
// titles_content_rating_check constraint in the database.
export type ContentRating = "G" | "13+" | "16+" | "18+";

export const CONTENT_RATINGS: { value: ContentRating; label: string }[] = [
  { value: "G", label: "G — General audiences" },
  { value: "13+", label: "13+ — Teens and up" },
  { value: "16+", label: "16+ — Mature teens" },
  { value: "18+", label: "18+ — Adults only" },
];
