// lib/upload/errorMessages.ts
//
// Maps a typed UploadError to a translated, human sentence. The engine and
// helpers only carry codes (plus an English fallback), so French users get
// French errors too.

import type { MessageKey } from "@/lib/i18n/messages";
import type { UploadError } from "./tusUpload";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const KEY: Record<string, MessageKey> = {
  signed_out: "upload.wiz.err.signedOut",
  forbidden: "upload.wiz.err.forbidden",
  too_large: "upload.wiz.err.tooLarge",
  unsupported_type: "upload.wiz.err.unsupportedType",
  heic_unsupported: "upload.wiz.err.heic",
  network: "upload.wiz.err.network",
  server: "upload.wiz.err.server",
  setup: "upload.wiz.err.setup",
  cancelled: "upload.wiz.err.cancelled",
  unknown: "upload.wiz.err.unknown",
};

export function uploadErrorMessage(e: UploadError, t: T): string {
  const key = KEY[e.code] ?? "upload.wiz.err.unknown";
  return t(key, { status: e.status ?? "" });
}
