// lib/i18n/runtimeErrors.ts
//
// Some errors are thrown from non-React code (download manager, Paystack
// helper, Supabase client) as plain English strings. This maps the ones we
// own — and any "no network" failure — onto translated messages at the point
// they are shown to the user. Unknown messages (e.g. raw backend text) pass
// through unchanged.

import type { MessageKey } from "./messages";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const RULES: { test: RegExp; key: MessageKey; vars?: (m: RegExpMatchArray) => Record<string, string | number> }[] = [
  { test: /failed to fetch|networkerror|network request failed|load failed|fetch failed/i, key: "net.loadFailed" },
  { test: /^Not signed in\.?$/i, key: "err.notSignedIn" },
  { test: /^Could not start payment$/i, key: "err.paymentStart" },
  { test: /^Sign in to download$/i, key: "err.dlSignIn" },
  { test: /^This browser can't store downloads$/i, key: "err.dlUnsupported" },
  { test: /^Could not prepare download$/i, key: "err.dlPrepare" },
  { test: /^Download failed \((\d+)\)$/i, key: "err.dlStatus", vars: (m) => ({ status: m[1] }) },
  { test: /^Download failed$/i, key: "watch.downloadFailed" },
  { test: /^Connection dropped$/i, key: "err.dlDropped" },
  { test: /^Not enough storage/i, key: "err.dlStorage" },
  { test: /^No video$/i, key: "watch.noVideo" },
];

export function translateRuntimeError(message: string | null | undefined, t: T): string {
  const msg = message ?? "";
  for (const rule of RULES) {
    const m = msg.match(rule.test);
    if (m) return t(rule.key, rule.vars?.(m));
  }
  return msg;
}
