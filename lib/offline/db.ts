// lib/offline/db.ts
//
// In-app offline storage. Downloaded episodes live in the browser's private
// IndexedDB for this app's origin — nothing is written to the user's Downloads
// folder or gallery, and nothing shows up as a file. Video bytes are stored as
// ~4 MB Blob chunks so a big episode is never held in memory in one piece and a
// half-finished download can resume from the last complete chunk.

// "processing" is legacy (old on-device watermark encode, removed); new
// downloads go straight from "downloading" to "complete".
export type OfflineStatus = "queued" | "downloading" | "paused" | "processing" | "complete" | "error";

export type OfflineTitle = {
  titleId: string;
  userId: string;
  slug: string | null;
  title: string;
  synopsis: string | null;
  contentRating: string | null;
  // Poster is saved too so the Downloads screen looks right with no network.
  poster: Blob | null;
  updatedAt: number;
};

export type OfflineEpisode = {
  episodeId: string;
  titleId: string;
  userId: string;
  episodeNumber: number;
  name: string | null;
  durationSeconds: number | null;
  videoPath: string;
  totalBytes: number;
  receivedBytes: number;
  chunkCount: number;
  status: OfflineStatus;
  error: string | null;
  addedAt: number;
  completedAt: number | null;
  // Transient — 0..1 progress of the post-download watermark encode. Never
  // persisted (not meaningful across a page reload); only set in memory
  // while status is "processing".
  processProgress?: number;
};

type ChunkRow = { key: string; episodeId: string; index: number; data: Blob };

const DB_NAME = "iq-cinema-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function offlineStorageSupported() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("titles", { keyPath: "titleId" });
      const eps = db.createObjectStore("episodes", { keyPath: "episodeId" });
      eps.createIndex("titleId", "titleId");
      const chunks = db.createObjectStore("chunks", { keyPath: "key" });
      chunks.createIndex("episodeId", "episodeId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAllTitles(userId: string): Promise<OfflineTitle[]> {
  const db = await openDb();
  const rows = await wrap<OfflineTitle[]>(db.transaction("titles").objectStore("titles").getAll());
  return rows.filter((t) => t.userId === userId);
}

export async function getAllEpisodes(userId: string): Promise<OfflineEpisode[]> {
  const db = await openDb();
  const rows = await wrap<OfflineEpisode[]>(db.transaction("episodes").objectStore("episodes").getAll());
  return rows.filter((e) => e.userId === userId);
}

export async function getEpisode(episodeId: string): Promise<OfflineEpisode | undefined> {
  const db = await openDb();
  return wrap<OfflineEpisode | undefined>(db.transaction("episodes").objectStore("episodes").get(episodeId));
}

export async function putTitle(title: OfflineTitle) {
  const db = await openDb();
  const tx = db.transaction("titles", "readwrite");
  tx.objectStore("titles").put(title);
  await done(tx);
}

export async function putEpisode(ep: OfflineEpisode) {
  const db = await openDb();
  const tx = db.transaction("episodes", "readwrite");
  tx.objectStore("episodes").put(ep);
  await done(tx);
}

// Chunk + episode progress are written in ONE transaction so the resume point
// (`receivedBytes`/`chunkCount`) can never disagree with what is on disk.
export async function putChunkAndProgress(ep: OfflineEpisode, index: number, data: Blob) {
  const db = await openDb();
  const tx = db.transaction(["chunks", "episodes"], "readwrite");
  const row: ChunkRow = { key: `${ep.episodeId}:${index}`, episodeId: ep.episodeId, index, data };
  tx.objectStore("chunks").put(row);
  tx.objectStore("episodes").put(ep);
  await done(tx);
}

async function deleteChunks(db: IDBDatabase, episodeId: string) {
  const tx = db.transaction("chunks", "readwrite");
  const idx = tx.objectStore("chunks").index("episodeId");
  const keys = await wrap<IDBValidKey[]>(idx.getAllKeys(IDBKeyRange.only(episodeId)));
  for (const k of keys) tx.objectStore("chunks").delete(k);
  await done(tx);
}

export async function clearEpisodeChunks(episodeId: string) {
  const db = await openDb();
  await deleteChunks(db, episodeId);
}

// --- staging area for the watermark re-encode -------------------------------
//
// The watermarked replacement is written under a synthetic id (never a real
// episodeId, so it can't collide with `deleteChunks`/`readEpisodeBlob` for
// the real episode) until every chunk is confirmed on disk. Only then do we
// drop the original and promote the stage — so a crash or quota error
// mid-encode leaves the original playable copy untouched instead of a
// hybrid of old and new bytes under the same keys.
function stagingId(episodeId: string) {
  return `${episodeId}#staging`;
}

export async function putStagingChunk(episodeId: string, index: number, data: Blob) {
  const db = await openDb();
  const stage = stagingId(episodeId);
  const tx = db.transaction("chunks", "readwrite");
  const row: ChunkRow = { key: `${stage}:${index}`, episodeId: stage, index, data };
  tx.objectStore("chunks").put(row);
  await done(tx);
}

export async function clearStagingChunks(episodeId: string) {
  const db = await openDb();
  await deleteChunks(db, stagingId(episodeId));
}

// Drops the original chunks, then copies every staged chunk into the real
// episode's chunk keys and clears the stage. Assumes the caller already
// confirmed all `count` staged chunks were written successfully.
export async function promoteStagingChunks(episodeId: string, count: number) {
  const db = await openDb();
  const stage = stagingId(episodeId);
  await deleteChunks(db, episodeId);
  const readTx = db.transaction("chunks");
  const store = readTx.objectStore("chunks");
  const rows = await Promise.all(
    Array.from({ length: count }, (_, i) => wrap<ChunkRow | undefined>(store.get(`${stage}:${i}`)))
  );
  const writeTx = db.transaction("chunks", "readwrite");
  for (let i = 0; i < count; i++) {
    const row = rows[i];
    if (!row) throw new Error(`Missing staged chunk ${i}`);
    writeTx.objectStore("chunks").put({ key: `${episodeId}:${i}`, episodeId, index: i, data: row.data });
  }
  await done(writeTx);
  await deleteChunks(db, stage);
}

export async function deleteEpisode(episodeId: string) {
  const db = await openDb();
  await deleteChunks(db, episodeId);
  const tx = db.transaction("episodes", "readwrite");
  tx.objectStore("episodes").delete(episodeId);
  await done(tx);
}

export async function deleteTitle(titleId: string) {
  const db = await openDb();
  const tx = db.transaction("titles", "readwrite");
  tx.objectStore("titles").delete(titleId);
  await done(tx);
}

// Stitches the stored chunks back into one Blob for playback. Blobs read from
// IndexedDB are file-backed by the browser, so this does not pull the whole
// video into memory.
export async function readEpisodeBlob(episodeId: string, chunkCount: number): Promise<Blob | null> {
  const db = await openDb();
  const store = db.transaction("chunks").objectStore("chunks");
  // Issue every read up front so they all belong to the same live transaction.
  const rows = await Promise.all(
    Array.from({ length: chunkCount }, (_, i) => wrap<ChunkRow | undefined>(store.get(`${episodeId}:${i}`)))
  );
  const parts: Blob[] = [];
  for (const row of rows) {
    if (!row) return null;
    parts.push(row.data);
  }
  return new Blob(parts, { type: "video/mp4" });
}
