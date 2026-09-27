"use client";

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

function storageEndpoint() {
  // NEXT_PUBLIC_SUPABASE_URL looks like https://<ref>.supabase.co — Supabase
  // recommends the dedicated *.storage.supabase.co host for large uploads,
  // since it skips a hop through the API gateway that the main domain takes.
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  const ref = url.hostname.split(".")[0];
  return `https://${ref}.storage.supabase.co/storage/v1/upload/resumable`;
}

// Standard supabase-js `.upload()` is a single non-resumable HTTP request.
// Supabase's own guidance is to use this (TUS) method for anything over
// 6MB — a dropped connection partway through a single-shot upload of a
// multi-hundred-MB file means starting over from 0%, which is exactly the
// failure mode large mobile uploads hit. This resumes instead.
export function uploadVideoResumable({
  bucket,
  path,
  file,
  onProgress,
}: {
  bucket: string;
  path: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        reject(new Error("You've been signed out — sign in again and retry the upload."));
        return;
      }

      const upload = new tus.Upload(file, {
        endpoint: storageEndpoint(),
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: file.type || "video/mp4",
          cacheControl: "3600",
        },
        // Supabase's TUS endpoint currently requires exactly this chunk size.
        chunkSize: 6 * 1024 * 1024,
        onError: reject,
        onProgress: (bytesUploaded, bytesTotal) => {
          onProgress?.(bytesTotal ? bytesUploaded / bytesTotal : 0);
        },
        onSuccess: () => resolve(),
      });

      // If this exact file was left mid-upload (tab closed, connection
      // dropped), continue it instead of re-uploading everything already
      // sent.
      upload.findPreviousUploads().then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      });
    });
  });
}
