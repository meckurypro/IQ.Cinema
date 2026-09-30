// lib/device.ts

// A stable per-browser id for anonymous view/progress tracking (record_play
// accepts a null user_id but still wants a device id to dedupe by). The server
// only accepts ids of 8-64 characters.
const STORAGE_KEY = "iq-device-id";
let memoryId: string | null = null;

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  if (memoryId) return memoryId;
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id || id.length < 8 || id.length > 64) {
      id = newId();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    memoryId = id;
  } catch {
    // Storage blocked (private mode / strict settings): keep a per-page id so
    // playback reporting still works instead of throwing.
    memoryId = newId();
  }
  return memoryId;
}
