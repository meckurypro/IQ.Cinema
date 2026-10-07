// lib/upload/tusUpload.ts
//
// Resumable (TUS) upload engine. Pure: no Supabase, no React, no globals it
// can't live without — the endpoint, credentials and file are passed in, so the
// same code runs in the browser and under the Node test harness
// (scripts/test-upload.ts).
//
// Why this exists / what it fixes versus the old inline helper:
//   • It can never hang silently. Every async step is guarded; any failure ends
//     in an `error` snapshot AND a rejected `done` promise with a typed,
//     human-meaningful UploadError.
//   • Credentials are fetched fresh before EVERY request, so a long upload that
//     outlives the 1-hour access token no longer dies with a 401 at the end.
//   • Real-time numbers: bytes, fraction, smoothed speed and ETA.
//   • Pause / resume / retry / abort, plus automatic "wait for connection, then
//     carry on" instead of failing after ~40s of being offline.

import * as tus from "tus-js-client";

export type UploadPhase =
  | "idle"
  | "starting"
  | "uploading"
  | "paused"
  | "retrying" // a request failed; the engine is trying again
  | "offline" // no connection; will resume by itself when it returns
  | "done"
  | "error";

export type UploadErrorCode =
  | "signed_out" // no session / token refresh failed / 401
  | "forbidden" // 403: storage policy denied the path
  | "too_large" // 413
  | "unsupported_type" // 415 / 400 mime rejection
  | "heic_unsupported" // iPhone photo format the bucket can't take
  | "network" // couldn't reach the server
  | "server" // 5xx that kept failing
  | "setup" // couldn't even start (bad endpoint, no auth, etc.)
  | "cancelled"
  | "unknown";

export class UploadError extends Error {
  code: UploadErrorCode;
  status?: number;
  constructor(code: UploadErrorCode, message: string, status?: number) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.status = status;
  }
}

export type UploadSnapshot = {
  phase: UploadPhase;
  bytesUploaded: number;
  bytesTotal: number;
  /** 0..1 */
  fraction: number;
  /** Smoothed bytes per second; 0 until enough samples. */
  speedBps: number;
  /** Seconds remaining, or null while unknown. */
  etaSeconds: number | null;
  /** 0 when healthy; n = how many times in a row we've had to retry. */
  retryAttempt: number;
  error: UploadError | null;
};

export type AuthHeaders = { token: string; apikey: string };

export type TusUploadOptions = {
  endpoint: string;
  bucket: string;
  path: string;
  // Browser File/Blob; the Node test harness passes a Buffer.
  file: ConstructorParameters<typeof tus.Upload>[0];
  contentType: string;
  cacheControl?: string;
  /** Called before every request so tokens are always current. */
  getAuth: () => Promise<AuthHeaders>;
  onUpdate?: (s: UploadSnapshot) => void;
  /** Delays between automatic in-engine retries (ms). */
  retryDelays?: number[];
  /** Supabase's TUS endpoint requires exactly 6 MiB. */
  chunkSize?: number;
  /** Max consecutive failed restarts (while "online") before giving up. */
  maxRestarts?: number;
  /**
   * If nothing moves for this long while we believe we're online, treat the
   * connection as stalled and restart it. Browsers put no timeout on an XHR,
   * so without this a half-dead mobile connection looks like "stuck at 37%".
   */
  stallTimeoutMs?: number;
  /** Seam for tests: subscribe to connectivity. Defaults to window events. */
  connectivity?: {
    isOnline: () => boolean;
    onOnline: (cb: () => void) => () => void;
    onOffline: (cb: () => void) => () => void;
  };
  /** Seam for tests: set false to skip persisting resume fingerprints. */
  storeFingerprint?: boolean;
};

const SIX_MIB = 6 * 1024 * 1024;

function browserConnectivity(): NonNullable<TusUploadOptions["connectivity"]> {
  const has = typeof window !== "undefined";
  return {
    isOnline: () => (has && typeof navigator !== "undefined" ? navigator.onLine : true),
    onOnline: (cb) => {
      if (!has) return () => {};
      window.addEventListener("online", cb);
      return () => window.removeEventListener("online", cb);
    },
    onOffline: (cb) => {
      if (!has) return () => {};
      window.addEventListener("offline", cb);
      return () => window.removeEventListener("offline", cb);
    },
  };
}

/** Turns whatever tus (or our own code) threw into a typed UploadError. */
export function describeUploadError(err: unknown): UploadError {
  if (err instanceof UploadError) return err;
  const anyErr = err as any;
  const status: number | undefined =
    typeof anyErr?.originalResponse?.getStatus === "function"
      ? anyErr.originalResponse.getStatus()
      : undefined;

  if (status === 401) return new UploadError("signed_out", "Your session expired. Sign in again, then retry.", 401);
  if (status === 403) return new UploadError("forbidden", "You don't have permission to upload this file here.", 403);
  if (status === 413) return new UploadError("too_large", "This file is too large to upload.", 413);
  if (status === 415) return new UploadError("unsupported_type", "This file type isn't supported. Use an MP4 or MOV video.", 415);
  if (status === 400) {
    const body: string = anyErr?.originalResponse?.getBody?.() ?? "";
    if (/mime|type|unsupported/i.test(body)) {
      return new UploadError("unsupported_type", "This file type isn't supported. Use an MP4 or MOV video.", 400);
    }
    return new UploadError("unknown", "The server rejected the upload (400).", 400);
  }
  if (status !== undefined && status >= 500) {
    return new UploadError("server", `The server had a problem (${status}). Please try again.`, status);
  }
  // No HTTP response at all: connection dropped / DNS / CORS / blocked.
  if (anyErr?.originalRequest && status === undefined) {
    return new UploadError("network", "Couldn't reach the server. Check your connection.");
  }
  const msg = String(anyErr?.message ?? err ?? "");
  if (/failed to fetch|network|timeout|econn|enotfound|socket/i.test(msg)) {
    return new UploadError("network", "Couldn't reach the server. Check your connection.");
  }
  return new UploadError("unknown", msg || "The upload failed for an unknown reason.", status);
}

export type TusUploadHandle = {
  /** Resolves when 100% is on the server; rejects with UploadError. */
  done: Promise<void>;
  pause: () => void;
  resume: () => void;
  /** After an `error` phase: continue from where it stopped. */
  retry: () => void;
  /** Cancel for good. `done` rejects with code "cancelled". */
  abort: () => Promise<void>;
  snapshot: () => UploadSnapshot;
};

export function createTusUpload(opts: TusUploadOptions): TusUploadHandle {
  const conn = opts.connectivity ?? browserConnectivity();
  const maxRestarts = opts.maxRestarts ?? 4;
  const stallTimeoutMs = opts.stallTimeoutMs ?? 60_000;

  let snap: UploadSnapshot = {
    phase: "idle",
    bytesUploaded: 0,
    bytesTotal: Number((opts.file as any)?.size ?? (opts.file as any)?.length ?? 0),
    fraction: 0,
    speedBps: 0,
    etaSeconds: null,
    retryAttempt: 0,
    error: null,
  };

  const emit = (patch: Partial<UploadSnapshot>) => {
    snap = { ...snap, ...patch };
    opts.onUpdate?.(snap);
  };

  let resolveDone!: () => void;
  let rejectDone!: (e: UploadError) => void;
  const done = new Promise<void>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });
  // The caller awaits `done`, but a pause/abort path may reject it with no
  // listener attached yet — never let that become an "unhandled rejection".
  done.catch(() => {});

  let upload: tus.Upload | null = null;
  let finished = false;
  let restarts = 0;
  let userPaused = false;
  // Why the last credentials lookup failed, if it did. tus swallows errors
  // thrown from onBeforeRequest (the upload just stalls), so we capture it
  // here and report the true cause instead.
  let authFailure: UploadError | null = null;
  const cleanups: Array<() => void> = [];

  // --- stall watchdog -----------------------------------------------------
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
  };
  const armWatchdog = () => {
    clearWatchdog();
    if (finished || userPaused) return;
    watchdog = setTimeout(() => {
      if (finished || userPaused || !conn.isOnline()) return;
      try {
        upload?.abort(false);
      } catch {
        /* ignore */
      }
      handleError(new UploadError("network", "The connection stalled."));
    }, stallTimeoutMs);
  };

  // --- smoothed speed -----------------------------------------------------
  let lastT = 0;
  let lastB = 0;
  let ewma = 0;
  const sample = (bytes: number) => {
    const now = Date.now();
    if (lastT === 0) {
      lastT = now;
      lastB = bytes;
      return;
    }
    const dt = (now - lastT) / 1000;
    if (dt < 0.25) return;
    const inst = Math.max(0, (bytes - lastB) / dt);
    ewma = ewma === 0 ? inst : ewma * 0.7 + inst * 0.3;
    lastT = now;
    lastB = bytes;
  };

  const finishOk = () => {
    if (finished) return;
    finished = true;
    clearWatchdog();
    cleanups.forEach((c) => c());
    emit({ phase: "done", bytesUploaded: snap.bytesTotal, fraction: 1, etaSeconds: 0, retryAttempt: 0, error: null });
    resolveDone();
  };

  const finishErr = (e: UploadError) => {
    if (finished) return;
    finished = true;
    clearWatchdog();
    cleanups.forEach((c) => c());
    emit({ phase: e.code === "cancelled" ? "idle" : "error", error: e, etaSeconds: null });
    rejectDone(e);
  };

  // A failed-but-recoverable stop. Keeps `done` pending so retry() can continue.
  let recoverable = false;
  const stopRecoverable = (e: UploadError) => {
    clearWatchdog();
    recoverable = true;
    emit({ phase: "error", error: e, etaSeconds: null });
  };

  const build = (): tus.Upload => {
    const u = new tus.Upload(opts.file, {
      endpoint: opts.endpoint,
      retryDelays: opts.retryDelays ?? [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: opts.storeFingerprint ?? true,
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: opts.contentType,
        cacheControl: opts.cacheControl ?? "3600",
      },
      chunkSize: opts.chunkSize ?? SIX_MIB,
      onBeforeRequest: async (req) => {
        try {
          const { token, apikey } = await opts.getAuth();
          authFailure = null;
          req.setHeader("authorization", `Bearer ${token}`);
          req.setHeader("apikey", apikey);
        } catch (e) {
          // Don't throw: tus would stall. Remember why, send the request
          // without credentials (it will be refused with a 401), and let
          // handleError() report the real cause.
          authFailure = e instanceof UploadError ? e : new UploadError("signed_out", e instanceof Error ? e.message : "Couldn't get credentials.", 401);
        }
      },
      onShouldRetry: (err, retryAttempt, options) => {
        const status = (err as any)?.originalResponse?.getStatus?.();
        // 401/403/413/415 are decisions, not hiccups — don't loop on them.
        if (status === 401 || status === 403 || status === 413 || status === 415) return false;
        const will = tus.defaultOptions.onShouldRetry!(err, retryAttempt, options);
        if (will) emit({ phase: "retrying", retryAttempt: retryAttempt + 1 });
        return will;
      },
      onProgress: (up, total) => {
        armWatchdog();
        sample(up);
        const remaining = total - up;
        emit({
          phase: userPaused ? "paused" : "uploading",
          bytesUploaded: up,
          bytesTotal: total,
          fraction: total ? up / total : 0,
          speedBps: ewma,
          etaSeconds: ewma > 0 ? remaining / ewma : null,
          retryAttempt: 0,
          error: null,
        });
      },
      onSuccess: () => finishOk(),
      onError: (err) => handleError(err),
    });
    return u;
  };

  const startOrContinue = async () => {
    try {
      // Fail fast and loudly on things that can never work, instead of
      // handing them to tus (which would stall without telling anyone).
      try {
        // eslint-disable-next-line no-new
        new URL(opts.endpoint);
      } catch {
        throw new UploadError("setup", "The upload address is invalid.");
      }
      try {
        await opts.getAuth();
        authFailure = null;
      } catch (e) {
        const ue =
          e instanceof UploadError ? e : new UploadError("signed_out", e instanceof Error ? e.message : "Couldn't get credentials.", 401);
        if (ue.code === "signed_out") {
          stopRecoverable(ue); // can retry once they sign back in
          return;
        }
        throw ue;
      }
      upload = upload ?? build();
      // Pick up where an earlier, interrupted attempt of THIS file stopped.
      // Guarded: if browser storage is blocked this must not stall the upload.
      try {
        const previous = await upload.findPreviousUploads();
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      } catch {
        /* storage unavailable — upload from the start */
      }
      recoverable = false;
      emit({ phase: "uploading", error: null });
      armWatchdog();
      upload.start();
    } catch (e) {
      finishErr(describeUploadError(e instanceof Error && !(e as any).originalRequest ? new UploadError("setup", e.message) : e));
    }
  };

  function handleError(err: unknown) {
    if (finished) return;
    // A credentials failure is the root cause even if tus reports a 401 for it.
    const e = authFailure ?? describeUploadError(err);
    clearWatchdog();

    // Connection problems: don't fail — wait for the network and continue.
    if (e.code === "network" || e.code === "server") {
      if (!conn.isOnline()) {
        emit({ phase: "offline", error: null, etaSeconds: null });
        const off = conn.onOnline(() => {
          off();
          restarts = 0;
          void startOrContinue();
        });
        cleanups.push(off);
        return;
      }
      if (restarts < maxRestarts) {
        restarts++;
        emit({ phase: "retrying", retryAttempt: restarts });
        setTimeout(() => void startOrContinue(), Math.min(2000 * restarts, 10000));
        return;
      }
    }
    // Everything else: stop, say exactly why, and let the person retry.
    stopRecoverable(e);
  }

  // Go offline mid-request → show it immediately instead of waiting for tus to
  // exhaust its retries.
  cleanups.push(
    conn.onOffline(() => {
      if (!finished && snap.phase === "uploading") {
        clearWatchdog();
        emit({ phase: "offline", etaSeconds: null });
      }
    })
  );

  emit({ phase: "starting" });
  void startOrContinue();

  return {
    done,
    snapshot: () => snap,
    pause: () => {
      if (finished || !upload) return;
      userPaused = true;
      clearWatchdog();
      upload.abort(false);
      emit({ phase: "paused", etaSeconds: null });
    },
    resume: () => {
      if (finished || !userPaused) return;
      userPaused = false;
      lastT = 0;
      ewma = 0;
      void startOrContinue();
    },
    retry: () => {
      if (finished || !recoverable) return;
      restarts = 0;
      lastT = 0;
      ewma = 0;
      void startOrContinue();
    },
    abort: async () => {
      if (finished) return;
      try {
        await upload?.abort(true);
      } catch {
        /* nothing useful to do */
      }
      finishErr(new UploadError("cancelled", "Upload cancelled."));
    },
  };
}
