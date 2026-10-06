// components/shared/NetworkBanner.tsx
//
// Global "no connection" notice. Without it, a dropped connection shows up as
// spinners that never finish and lists that silently stay empty, which reads
// as a bug. Offline: explains what's wrong and points at the in-app
// Downloads (which work with no network). Back online: a brief confirmation.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Download, Wifi, WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";
import { useI18n } from "@/hooks/useI18n";

export function NetworkBanner() {
  const online = useOnline();
  const pathname = usePathname();
  const { t } = useI18n();
  const [showRestored, setShowRestored] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowRestored(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setShowRestored(true);
    const id = setTimeout(() => setShowRestored(false), 3000);
    return () => clearTimeout(id);
  }, [online]);

  if (online && !showRestored) return null;

  const onDownloads = pathname.startsWith("/downloads");

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] mx-auto flex max-w-md justify-center px-3 desk:left-[72px] desk:max-w-none xl:left-60"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      {online ? (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text shadow-card">
          <Wifi size={16} className="text-emerald-500" />
          {t("net.backOnline")}
        </div>
      ) : (
        <div
          className={clsx(
            "pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-lg border border-crimson/30",
            "bg-crimson-soft px-3.5 py-3 text-crimson shadow-card"
          )}
        >
          <WifiOff size={20} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight">{t("net.offlineTitle")}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug opacity-90">{t("net.offlineBody")}</p>
            {!onDownloads && (
              <Link
                href="/downloads"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-crimson px-3 py-1.5 text-[12.5px] font-semibold text-white transition-[filter] hover:brightness-110 active:brightness-95"
              >
                <Download size={14} />
                {t("net.goDownloads")}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
