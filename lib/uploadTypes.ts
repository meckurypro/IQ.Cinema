// lib/uploadTypes.ts
//
// The kinds of content a creator can upload, and the rules for each. Mirrors
// public.max_duration_seconds_for() and public.validate_episode_media() in the
// database (see supabase/migrations/20261007120100_*): the client checks first
// for instant feedback, the database is the backstop.

import type { MessageKey } from "@/lib/i18n/messages";
import type { Category } from "@/lib/categories";

export type ContentType =
  | "short_episode"
  | "full_episode"
  | "one_part_film"
  | "music_video"
  | "commercial";

/** "episode" = a numbered series; "part" = a single standalone video. */
export type Unit = "episode" | "part";

export type Orientation = "portrait" | "portrait_or_landscape";

export type ContentTypeConfig = {
  value: ContentType;
  labelKey: MessageKey;
  descKey: MessageKey;
  unit: Unit;
  maxDurationSeconds: number;
  maxDurationLabel: string;
  orientation: Orientation;
  /** Fixed category for this type, or null to let the creator choose. */
  fixedCategory: Category | null;
  /** Label for the optional credit line (artist / brand), if the type has one. */
  creditLabelKey: MessageKey | null;
};

export const CONTENT_TYPES: ContentTypeConfig[] = [
  {
    value: "short_episode",
    labelKey: "upload.type.short",
    descKey: "upload.typeDesc.short",
    unit: "episode",
    maxDurationSeconds: 160,
    maxDurationLabel: "2m 40s",
    orientation: "portrait",
    fixedCategory: null,
    creditLabelKey: null,
  },
  {
    value: "full_episode",
    labelKey: "upload.type.full",
    descKey: "upload.typeDesc.full",
    unit: "episode",
    maxDurationSeconds: 1200,
    maxDurationLabel: "20m",
    orientation: "portrait",
    fixedCategory: null,
    creditLabelKey: null,
  },
  {
    value: "one_part_film",
    labelKey: "upload.type.film",
    descKey: "upload.typeDesc.film",
    unit: "part",
    maxDurationSeconds: 7200,
    maxDurationLabel: "120m",
    orientation: "portrait",
    fixedCategory: null,
    creditLabelKey: null,
  },
  {
    value: "music_video",
    labelKey: "upload.type.music",
    descKey: "upload.typeDesc.music",
    unit: "part",
    maxDurationSeconds: 600,
    maxDurationLabel: "10m",
    orientation: "portrait_or_landscape",
    fixedCategory: "music",
    creditLabelKey: "upload.credit.artist",
  },
  {
    value: "commercial",
    labelKey: "upload.type.commercial",
    descKey: "upload.typeDesc.commercial",
    unit: "part",
    maxDurationSeconds: 180,
    maxDurationLabel: "3m",
    orientation: "portrait_or_landscape",
    fixedCategory: "commercial",
    creditLabelKey: "upload.credit.brand",
  },
];

export function getTypeConfig(ct: string | null | undefined): ContentTypeConfig {
  return CONTENT_TYPES.find((c) => c.value === ct) ?? CONTENT_TYPES[1];
}

export function unitOf(ct: string | null | undefined): Unit {
  return getTypeConfig(ct).unit;
}

// ---------------------------------------------------------------------------
// Video checks (pure, so they're unit-tested in scripts/test-upload.ts)
// ---------------------------------------------------------------------------

export const VIDEO_MAX_BYTES = 5 * 1024 * 1024 * 1024; // `videos` bucket limit (5 GiB)

const PORTRAIT = 9 / 16;
const LANDSCAPE = 16 / 9;
const PORTRAIT_TOL = 0.02;
const LANDSCAPE_TOL = 0.04;

export type VideoMeta = { duration: number; width: number; height: number };

export type VideoIssue =
  | { kind: "too_long"; max: string; len: number }
  | { kind: "bad_aspect_portrait"; w: number; h: number }
  | { kind: "bad_aspect_flexible"; w: number; h: number }
  | { kind: "too_big"; bytes: number };

export function checkVideoFile(file: { size: number }): VideoIssue | null {
  return file.size > VIDEO_MAX_BYTES ? { kind: "too_big", bytes: file.size } : null;
}

export function checkVideoMeta(meta: VideoMeta, ct: ContentType): VideoIssue | null {
  const cfg = getTypeConfig(ct);
  // duration_seconds is stored rounded, and the database trigger compares the
  // rounded value — so round here too, or a 160.6s clip would pass the browser
  // and then be refused by the database.
  if (Math.round(meta.duration) > cfg.maxDurationSeconds) {
    return { kind: "too_long", max: cfg.maxDurationLabel, len: meta.duration };
  }
  if (meta.height > 0) {
    const ratio = meta.width / meta.height;
    const portrait = Math.abs(ratio - PORTRAIT) <= PORTRAIT_TOL;
    const landscape = Math.abs(ratio - LANDSCAPE) <= LANDSCAPE_TOL;
    if (cfg.orientation === "portrait" && !portrait) {
      return { kind: "bad_aspect_portrait", w: meta.width, h: meta.height };
    }
    if (cfg.orientation === "portrait_or_landscape" && !(portrait || landscape)) {
      return { kind: "bad_aspect_flexible", w: meta.width, h: meta.height };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Genres per content type. All genres live in one table; this just decides
// which ones to offer so a music video isn't asked to pick "Revenge".
// ---------------------------------------------------------------------------

const MUSIC_GENRES = ["Afrobeats", "Hip-Hop", "R&B", "Pop", "Gospel", "Amapiano", "Highlife", "Dancehall", "Alternative"];
const COMMERCIAL_GENRES = ["Fashion & Beauty", "Food & Drink", "Tech", "Finance", "Automotive", "Lifestyle"];

export function genresForType(all: string[], ct: ContentType): string[] {
  const special = new Set([...MUSIC_GENRES, ...COMMERCIAL_GENRES]);
  const pick =
    ct === "music_video"
      ? all.filter((g) => MUSIC_GENRES.includes(g))
      : ct === "commercial"
        ? all.filter((g) => COMMERCIAL_GENRES.includes(g))
        : all.filter((g) => !special.has(g));
  // If the genre migration hasn't been applied yet, don't leave the creator
  // with an empty dropdown — fall back to everything available.
  return pick.length ? pick : all;
}
