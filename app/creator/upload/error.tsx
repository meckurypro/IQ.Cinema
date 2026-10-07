// app/creator/upload/error.tsx
//
// Safety net: if anything in the upload flow throws while rendering, show a
// clear message with a way forward instead of a blank screen.

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/hooks/useI18n";

export default function UploadError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("Upload page crashed:", error);
  }, [error]);

  return (
    <div className="px-4 pt-8">
      <div role="alert" className="rounded-lg border border-crimson/30 bg-crimson-soft p-5 text-crimson">
        <p className="text-[15px] font-semibold">{t("upload.wiz.crash.title")}</p>
        <p className="mt-1 text-[13px] opacity-90">{t("upload.wiz.crash.body")}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reset} className="h-10 rounded-md bg-crimson px-4 text-[13px] font-semibold text-white">
            {t("upload.wiz.retry")}
          </button>
          <Link href="/creator/dashboard" className="flex h-10 items-center rounded-md border border-crimson/30 px-4 text-[13px] font-medium">
            {t("upload.wiz.backToDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
