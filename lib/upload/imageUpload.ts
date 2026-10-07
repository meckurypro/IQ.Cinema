// lib/upload/imageUpload.ts
//
// Poster / thumbnail upload with real progress events. supabase-js's
// `.upload()` uses fetch(), which exposes no upload progress; XHR does. Images
// are capped at 5 MB by the bucket, so a single request is right (no TUS).

import { UploadError } from "./tusUpload";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Client-side pre-flight so failures are explained before any bytes move. */
export function checkImageFile(file: File): UploadError | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    return heic
      ? new UploadError("heic_unsupported", "iPhone HEIC photos aren't supported. Use a JPG, PNG or WEBP.")
      : new UploadError("unsupported_type", "Use a JPG, PNG or WEBP image.");
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return new UploadError("too_large", "Image must be under 5 MB.");
  }
  return null;
}

export function uploadImageWithProgress({
  supabaseUrl,
  anonKey,
  token,
  bucket,
  path,
  file,
  onProgress,
  signal,
}: {
  supabaseUrl: string;
  anonKey: string;
  token: string;
  bucket: string;
  path: string;
  file: File;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const pre = checkImageFile(file);
    if (pre) {
      reject(pre);
      return;
    }
    const xhr = new XMLHttpRequest();
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    xhr.open("POST", `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encoded}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      const s = xhr.status;
      if (s === 401) reject(new UploadError("signed_out", "Your session expired. Sign in again, then retry.", s));
      else if (s === 403) reject(new UploadError("forbidden", "You don't have permission to upload this file here.", s));
      else if (s === 413) reject(new UploadError("too_large", "Image must be under 5 MB.", s));
      else if (s === 415) reject(new UploadError("unsupported_type", "Use a JPG, PNG or WEBP image.", s));
      else if (s >= 500) reject(new UploadError("server", `The server had a problem (${s}). Please try again.`, s));
      else reject(new UploadError("unknown", `The upload was rejected (${s}).`, s));
    };
    xhr.onerror = () => reject(new UploadError("network", "Couldn't reach the server. Check your connection."));
    xhr.ontimeout = () => reject(new UploadError("network", "The upload timed out. Check your connection."));
    xhr.onabort = () => reject(new UploadError("cancelled", "Upload cancelled."));
    xhr.timeout = 120_000;
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}
