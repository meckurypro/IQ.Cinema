// lib/i18n/authErrors.ts
// Supabase Auth returns English error strings. Map the common ones to i18n keys
// so they follow the selected language; anything unrecognised falls through
// unchanged (better an English message than a wrong translation).

import type { MessageKey } from "@/lib/i18n/messages";

const RULES: { test: RegExp; key: MessageKey }[] = [
  { test: /invalid login credentials/i, key: "authError.invalidCredentials" },
  { test: /email not confirmed/i, key: "authError.emailNotConfirmed" },
  { test: /already registered|already been registered|user already exists/i, key: "authError.userExists" },
  { test: /rate limit|too many requests|after \d+ seconds?/i, key: "authError.rateLimit" },
  { test: /weak|at least \d+ characters|should be at least/i, key: "authError.weakPassword" },
  { test: /different from the old password|same as the old/i, key: "authError.samePassword" },
  { test: /failed to fetch|network/i, key: "authError.network" },
];

export function translateAuthError(
  message: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  const hit = RULES.find((r) => r.test.test(message));
  return hit ? t(hit.key) : message;
}
