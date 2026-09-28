// lib/links.ts
//
// Canonical, human-readable URLs. The title slug comes from the movie title
// (unique per title), so a shared link reads e.g. /watch/still-standing/ep-2.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function titlePath(slug: string) {
  return `/title/${slug}`;
}

// Falls back to the id-based path until the title's slug is known.
export function episodePath(slug: string | null | undefined, episodeNumber: number, episodeId: string) {
  return slug ? `/watch/${slug}/ep-${episodeNumber}` : `/watch/${episodeId}`;
}

// Slugs created before titles had to be unique ended in a 6-char random
// suffix (still-standing-b34779). Returns the slug without it, or null.
export function stripLegacySlugSuffix(slug: string): string | null {
  const m = slug.match(/^(.+)-[a-z0-9]{6}$/);
  return m ? m[1] : null;
}
