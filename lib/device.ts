// lib/device.ts

// A stable per-browser id for anonymous view/progress tracking (record_play
// accepts a null user_id but still wants a device fingerprint to dedupe by).
export function getDeviceId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("iq-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("iq-device-id", id);
  }
  return id;
}
