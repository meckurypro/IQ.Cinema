// lib/supabase/resumableUpload.ts
//
// Supabase wiring for the TUS engine in lib/upload/tusUpload.ts. Standard
// supabase-js `.upload()` is a single non-resumable request; Supabase's own
// guidance is TUS for anything over 6 MB, and a dropped connection partway
// through a multi-hundred-MB video would otherwise mean starting from 0%.

"use client";

import { createClient } from "@/lib/supabase/client";
import {
  createTusUpload,
  UploadError,
  type TusUploadHandle,
  type UploadSnapshot,
} from "@/lib/upload/tusUpload";

const supabase = createClient();

function storageEndpoint() {
  // NEXT_PUBLIC_SUPABASE_URL looks like https://<ref>.supabase.co. Supabase
  // recommends the dedicated *.storage.supabase.co host for large uploads (it
  // skips a hop through the API gateway).
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) throw new UploadError("setup", "The app isn't configured for uploads (missing Supabase URL).");
  const ref = new URL(raw).hostname.split(".")[0];
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}

// getSession() can stall (e.g. while another tab holds the auth lock). A
// stalled promise is exactly how an upload "breaks silently", so bound it.
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

async function getAuth() {
  const { data, error } = await withTimeout(
    supabase.auth.getSession(),
    15_000,
    () => new UploadError("signed_out", "Couldn't check your session. Reload the page and try again.")
  );
  const session = data?.session;
  if (error || !session) {
    throw new UploadError("signed_out", "You've been signed out. Sign in again, then retry the upload.", 401);
  }
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!apikey) throw new UploadError("setup", "The app isn't configured for uploads (missing key).");
  return { token: session.access_token, apikey };
}

/** The only video types the `videos` bucket accepts. */
export function resolveVideoContentType(file: File): string | null {
  const t = (file.type || "").toLowerCase();
  if (t === "video/mp4" || t === "video/quicktime") return t;
  const name = file.name.toLowerCase();
  if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
  if (name.endsWith(".mov")) return "video/quicktime";
  return null;
}

/**
 * Starts a resumable upload and returns a controllable handle (progress,
 * pause/resume/retry/abort). Never throws synchronously and never hangs:
 * failures surface through `handle.done` and the `onUpdate` snapshots.
 */
export function startVideoUpload({
  bucket,
  path,
  file,
  onUpdate,
}: {
  bucket: string;
  path: string;
  file: File;
  onUpdate?: (s: UploadSnapshot) => void;
}): TusUploadHandle {
  const contentType = resolveVideoContentType(file);
  try {
    if (!contentType) {
      throw new UploadError("unsupported_type", "This file type isn't supported. Use an MP4 or MOV video.");
    }
    return createTusUpload({
      endpoint: storageEndpoint(),
      bucket,
      path,
      file,
      contentType,
      getAuth,
      onUpdate,
    });
  } catch (e) {
    const err = e instanceof UploadError ? e : new UploadError("setup", e instanceof Error ? e.message : "Couldn't start the upload.");
    const snap: UploadSnapshot = {
      phase: "error",
      bytesUploaded: 0,
      bytesTotal: file.size,
      fraction: 0,
      speedBps: 0,
      etaSeconds: null,
      retryAttempt: 0,
      error: err,
    };
    onUpdate?.(snap);
    const done = Promise.reject(err);
    done.catch(() => {});
    return { done, snapshot: () => snap, pause() {}, resume() {}, retry() {}, abort: async () => {} };
  }
}

/** Back-compat: promise-style helper (used by older call sites). */
export function uploadVideoResumable(args: {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  return startVideoUpload({
    bucket: args.bucket,
    path: args.path,
    file: args.file,
    onUpdate: (s) => args.onProgress?.(s.fraction),
  }).done;
}
