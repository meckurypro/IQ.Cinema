// lib/offline/manager.ts
//
// Client-side download manager for in-app offline viewing. One instance per
// tab. It streams a private-bucket video with fetch (never a browser "save
// file" download), stores it chunk by chunk in IndexedDB (see ./db), and
// exposes an external store the UI subscribes to.

import { createClient } from "@/lib/supabase/client";
import {
  clearEpisodeChunks,
  clearStagingChunks,
  deleteEpisode,
  deleteTitle,
  getAllEpisodes,
  getAllTitles,
  offlineStorageSupported,
  promoteStagingChunks,
  putChunkAndProgress,
  putEpisode,
  putStagingChunk,
  putTitle,
  readEpisodeBlob,
  type OfflineEpisode,
  type OfflineTitle,
} from "./db";
import { watermarkVideo, WatermarkUnsupportedError } from "./watermark";

const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVE = 2;
const EMIT_EVERY_MS = 250;
const LAST_USER_KEY = "iq-offline-uid";

export type OfflineSnapshot = {
  ready: boolean;
  userId: string | null;
  titles: OfflineTitle[];
  episodes: OfflineEpisode[];
};

export type EpisodeDownloadInput = {
  episodeId: string;
  titleId: string;
  episodeNumber: number;
  name: string | null;
  durationSeconds: number | null;
  videoPath: string;
};

export type TitleDownloadInput = {
  titleId: string;
  slug: string | null;
  title: string;
  synopsis: string | null;
  contentRating: string | null;
  posterUrl: string | null;
};

const EMPTY: OfflineSnapshot = { ready: false, userId: null, titles: [], episodes: [] };

class OfflineManager {
  private snapshot: OfflineSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private controllers = new Map<string, AbortController>();
  private userId: string | null = null;
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private wired = false;

  // ---- external store -----------------------------------------------------

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => EMPTY;

  private set(next: Partial<OfflineSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.emit(true);
  }

  // Byte-progress ticks are throttled so a fast connection doesn't re-render
  // the whole list hundreds of times a second.
  private emit(force = false) {
    const now = Date.now();
    if (force || now - this.lastEmit >= EMIT_EVERY_MS) {
      this.lastEmit = now;
      if (this.emitTimer) {
        clearTimeout(this.emitTimer);
        this.emitTimer = null;
      }
      this.listeners.forEach((l) => l());
    } else if (!this.emitTimer) {
      this.emitTimer = setTimeout(() => this.emit(true), EMIT_EVERY_MS);
    }
  }

  // ---- lifecycle ----------------------------------------------------------

  // Called with the signed-in user id. When there is none (signed out, or the
  // session can't be refreshed while offline) we fall back to the last user on
  // this device so their downloads stay watchable without a connection.
  async init(uid: string | null | undefined) {
    if (typeof window === "undefined" || !offlineStorageSupported()) {
      this.set({ ready: true });
      return;
    }
    let effective = uid ?? null;
    try {
      if (effective) localStorage.setItem(LAST_USER_KEY, effective);
      else effective = localStorage.getItem(LAST_USER_KEY);
    } catch {
      // storage blocked — proceed with whatever we have
    }
    if (!this.wired) {
      this.wired = true;
      window.addEventListener("online", () => this.resumePaused());
    }
    if (effective === this.userId && this.snapshot.ready) return;
    this.userId = effective;
    if (!effective) {
      this.set({ ready: true, userId: null, titles: [], episodes: [] });
      return;
    }
    try {
      const [titles, episodes] = await Promise.all([getAllTitles(effective), getAllEpisodes(effective)]);
      // Anything that was mid-flight when the tab died is resumable, not
      // lost. A dead "processing" episode already has a complete, playable
      // original download sitting untouched (the watermark re-encode only
      // ever swaps it out once fully staged) — see finalize() — so it just
      // becomes "complete" without its burned-in watermark rather than
      // getting treated as an interrupted network download.
      const settled = episodes.map((e) => {
        if (e.status === "downloading" || e.status === "queued") return { ...e, status: "paused" as const };
        if (e.status === "processing") return { ...e, status: "complete" as const, processProgress: undefined };
        return e;
      });
      this.set({ ready: true, userId: effective, titles, episodes: settled });
      if (navigator.onLine) this.pump();
    } catch {
      this.set({ ready: true, userId: effective, titles: [], episodes: [] });
    }
  }

  // ---- queries ------------------------------------------------------------

  episode(episodeId: string) {
    return this.snapshot.episodes.find((e) => e.episodeId === episodeId);
  }

  async objectUrlFor(episodeId: string): Promise<string | null> {
    const ep = this.episode(episodeId);
    if (!ep || ep.status !== "complete") return null;
    const blob = await readEpisodeBlob(episodeId, ep.chunkCount);
    return blob ? URL.createObjectURL(blob) : null;
  }

  // ---- commands -----------------------------------------------------------

  async download(episode: EpisodeDownloadInput, title: TitleDownloadInput) {
    const uid = this.userId;
    if (!uid) throw new Error("Sign in to download");
    if (!offlineStorageSupported()) throw new Error("This browser can't store downloads");

    const existing = this.episode(episode.episodeId);
    if (existing) {
      if (existing.status === "paused" || existing.status === "error") this.resume(episode.episodeId);
      return;
    }

    // Ask the browser not to evict our downloads under storage pressure.
    try {
      await navigator.storage?.persist?.();
    } catch {
      // best effort
    }

    const now = Date.now();
    const ep: OfflineEpisode = {
      ...episode,
      userId: uid,
      totalBytes: 0,
      receivedBytes: 0,
      chunkCount: 0,
      status: "queued",
      error: null,
      addedAt: now,
      completedAt: null,
    };
    await putEpisode(ep);

    // Folder record + poster, once per movie.
    if (!this.snapshot.titles.some((t) => t.titleId === title.titleId)) {
      const poster = await fetchBlob(title.posterUrl);
      const row: OfflineTitle = {
        titleId: title.titleId,
        userId: uid,
        slug: title.slug,
        title: title.title,
        synopsis: title.synopsis,
        contentRating: title.contentRating,
        poster,
        updatedAt: now,
      };
      await putTitle(row);
      this.set({ titles: [...this.snapshot.titles, row], episodes: [...this.snapshot.episodes, ep] });
    } else {
      this.set({ episodes: [...this.snapshot.episodes, ep] });
    }
    this.pump();
  }

  pause(episodeId: string) {
    this.controllers.get(episodeId)?.abort("pause");
    const ep = this.episode(episodeId);
    if (ep && (ep.status === "queued" || ep.status === "downloading")) {
      this.patch(episodeId, { status: "paused" }, true);
    }
  }

  resume(episodeId: string) {
    const ep = this.episode(episodeId);
    if (!ep || (ep.status !== "paused" && ep.status !== "error")) return;
    this.patch(episodeId, { status: "queued", error: null }, true);
    this.pump();
  }

  async removeEpisode(episodeId: string) {
    this.controllers.get(episodeId)?.abort("remove");
    const ep = this.episode(episodeId);
    if (!ep) return;
    this.set({ episodes: this.snapshot.episodes.filter((e) => e.episodeId !== episodeId) });
    await deleteEpisode(episodeId);
    await this.dropEmptyTitle(ep.titleId);
    this.pump();
  }

  async removeTitle(titleId: string) {
    const eps = this.snapshot.episodes.filter((e) => e.titleId === titleId);
    for (const e of eps) this.controllers.get(e.episodeId)?.abort("remove");
    this.set({
      episodes: this.snapshot.episodes.filter((e) => e.titleId !== titleId),
      titles: this.snapshot.titles.filter((t) => t.titleId !== titleId),
    });
    for (const e of eps) await deleteEpisode(e.episodeId);
    await deleteTitle(titleId);
    this.pump();
  }

  private async dropEmptyTitle(titleId: string) {
    if (this.snapshot.episodes.some((e) => e.titleId === titleId)) return;
    this.set({ titles: this.snapshot.titles.filter((t) => t.titleId !== titleId) });
    await deleteTitle(titleId);
  }

  // ---- engine -------------------------------------------------------------

  private patch(episodeId: string, fields: Partial<OfflineEpisode>, force = false) {
    this.snapshot = {
      ...this.snapshot,
      episodes: this.snapshot.episodes.map((e) => (e.episodeId === episodeId ? { ...e, ...fields } : e)),
    };
    this.emit(force);
  }

  private resumePaused() {
    for (const e of this.snapshot.episodes) {
      if (e.status === "paused" && e.error === "offline") this.patch(e.episodeId, { status: "queued", error: null }, true);
    }
    this.pump();
  }

  private pump() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    let active = this.snapshot.episodes.filter((e) => e.status === "downloading").length;
    for (const e of this.snapshot.episodes) {
      if (active >= MAX_ACTIVE) break;
      if (e.status === "queued" && !this.controllers.has(e.episodeId)) {
        active++;
        void this.run(e.episodeId);
      }
    }
  }

  private async run(episodeId: string) {
    const controller = new AbortController();
    this.controllers.set(episodeId, controller);
    this.patch(episodeId, { status: "downloading", error: null }, true);

    try {
      let ep = this.episode(episodeId);
      if (!ep) return;

      const supabase = createClient();
      const { data, error } = await supabase.storage.from("videos").createSignedUrl(ep.videoPath, 60 * 60);
      if (error || !data?.signedUrl) throw new Error("Could not prepare download");

      // Resume from the last fully-stored chunk. If the server ignores Range
      // we restart from zero instead of appending the wrong bytes.
      let offset = ep.receivedBytes;
      const res = await fetch(data.signedUrl, {
        signal: controller.signal,
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
      });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      if (offset > 0 && res.status !== 206) {
        await clearEpisodeChunks(episodeId);
        offset = 0;
        ep = { ...ep, receivedBytes: 0, chunkCount: 0 };
      }

      const total = totalFromResponse(res, offset);
      if (total > 0) {
        await this.ensureRoom(total - offset);
        ep = { ...ep, totalBytes: total };
        this.patch(episodeId, { totalBytes: total, receivedBytes: offset, chunkCount: ep.chunkCount }, true);
      }

      const reader = res.body.getReader();
      let parts: Uint8Array[] = [];
      let buffered = 0;
      let index = ep.chunkCount;
      let received = offset;

      const flush = async () => {
        if (!buffered) return;
        const blob = new Blob(parts as BlobPart[], { type: "video/mp4" });
        received = ep!.receivedBytes + buffered;
        ep = { ...ep!, receivedBytes: received, chunkCount: index + 1, totalBytes: total || received };
        await putChunkAndProgress(ep, index, blob);
        index++;
        parts = [];
        buffered = 0;
        this.patch(episodeId, { receivedBytes: ep.receivedBytes, chunkCount: ep.chunkCount }, true);
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        buffered += value.byteLength;
        // Show bytes-in-flight between chunk writes so the ring moves smoothly.
        this.patch(episodeId, { receivedBytes: ep.receivedBytes + buffered });
        if (buffered >= CHUNK_BYTES) await flush();
      }
      await flush();

      if (total > 0 && received < total) throw new Error("Connection dropped");

      await this.finalize(episodeId, { ...ep, totalBytes: total || received, receivedBytes: received });
    } catch (err) {
      const reason = controller.signal.reason;
      if (controller.signal.aborted && (reason === "remove" || reason === "pause")) {
        // pause(): state already patched. remove(): row already gone.
      } else {
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        const message = err instanceof Error ? err.message : "Download failed";
        const ep = this.episode(episodeId);
        if (ep) {
          // Keep bytes already stored so Retry/auto-resume continues, not restarts.
          const next = offline
            ? { status: "paused" as const, error: "offline" }
            : { status: "error" as const, error: message };
          const receivedBytes = await this.persistedBytes(ep);
          await putEpisode({ ...ep, ...next, receivedBytes }).catch(() => {});
          this.patch(episodeId, { ...next, receivedBytes }, true);
        }
      }
    } finally {
      this.controllers.delete(episodeId);
      this.pump();
    }
  }

  // The video is fully downloaded — now burn the watermark into it before
  // calling it "complete". The re-encoded output is written to a staging
  // area first and only swapped in once every chunk of it is confirmed on
  // disk (see promoteStagingChunks), so a crash or quota error mid-encode
  // leaves the original, still-playable download untouched.
  //
  // Best-effort by design: if this browser can't run the WASM encoder, or
  // the encode/promote step fails for any reason, the viewer still ends up
  // with a playable offline copy rather than losing the download over it —
  // it just won't carry the burned-in mark, same as before this feature
  // existed.
  private async finalize(episodeId: string, downloaded: OfflineEpisode) {
    // Persisted (not just in-memory): if the tab dies mid-encode, init()
    // recognizes "processing" on restart and falls back to the already-
    // complete original bytes rather than misreading it as an interrupted
    // download and trying to re-fetch a file that finished long ago.
    await putEpisode({ ...downloaded, status: "processing" });
    this.patch(episodeId, { status: "processing", processProgress: 0 }, true);
    try {
      const rawBlob = await readEpisodeBlob(episodeId, downloaded.chunkCount);
      if (!rawBlob) throw new Error("Downloaded video missing from storage");

      const watermarked = await watermarkVideo(rawBlob, (p) =>
        this.patch(episodeId, { processProgress: p })
      );

      const chunks = chunkBlob(watermarked, CHUNK_BYTES);
      for (let i = 0; i < chunks.length; i++) await putStagingChunk(episodeId, i, chunks[i]);
      await promoteStagingChunks(episodeId, chunks.length);

      const finished: OfflineEpisode = {
        ...downloaded,
        receivedBytes: watermarked.size,
        totalBytes: watermarked.size,
        chunkCount: chunks.length,
        status: "complete",
        error: null,
        completedAt: Date.now(),
        processProgress: undefined,
      };
      await putEpisode(finished);
      this.patch(episodeId, finished, true);
    } catch (err) {
      if (!(err instanceof WatermarkUnsupportedError)) {
        console.error("watermark encode failed, keeping unwatermarked download", err);
      }
      await clearStagingChunks(episodeId).catch(() => {});
      const finished: OfflineEpisode = {
        ...downloaded,
        status: "complete",
        error: null,
        completedAt: Date.now(),
        processProgress: undefined,
      };
      await putEpisode(finished);
      this.patch(episodeId, finished, true);
    }
  }

  // In-flight (unflushed) bytes are lost on failure; the resumable point is
  // whatever whole chunks were committed.
  private async persistedBytes(ep: OfflineEpisode) {
    const stored = (await getAllEpisodes(ep.userId)).find((e) => e.episodeId === ep.episodeId);
    return stored?.receivedBytes ?? 0;
  }

  private async ensureRoom(needed: number) {
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.quota != null && est.usage != null && needed > est.quota - est.usage) {
        throw new Error("Not enough storage on this device");
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Not enough")) throw e;
    }
  }
}

function totalFromResponse(res: Response, offset: number) {
  const range = res.headers.get("Content-Range");
  const m = range?.match(/\/(\d+)$/);
  if (m) return Number(m[1]);
  const len = Number(res.headers.get("Content-Length") ?? 0);
  return len > 0 ? len + (res.status === 206 ? offset : 0) : 0;
}

function chunkBlob(blob: Blob, size: number): Blob[] {
  const chunks: Blob[] = [];
  for (let offset = 0; offset < blob.size; offset += size) {
    chunks.push(blob.slice(offset, Math.min(offset + size, blob.size), blob.type));
  }
  return chunks.length ? chunks : [blob];
}

async function fetchBlob(url: string | null): Promise<Blob | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    return r.ok ? await r.blob() : null;
  } catch {
    return null;
  }
}

export const offlineManager = new OfflineManager();
