// app/settings/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useI18n } from "@/hooks/useI18n";
import { Skeleton } from "@/components/ui/Skeleton";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { WhatsAppLinkSheet } from "@/components/rewards/WhatsAppLinkSheet";
import { enablePush, getPushState, type PushState } from "@/lib/push";
import type { SettingsPatch } from "@/lib/settings";

const supabase = createClient();

type Language = { code: string; native_label: string };

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { settings, loaded, error, update, reload } = useUserSettings();
  const { isOn, loaded: flagsLoaded } = useFeatureFlags();
  const { t } = useI18n();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [waOpen, setWaOpen] = useState(false);
  const [pushState, setPushState] = useState<PushState>("default");
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("app_languages")
      .select("code, native_label")
      .eq("enabled", true)
      .order("sort_order")
      .then(({ data }) => setLanguages((data as Language[]) ?? []));
  }, []);

  useEffect(() => {
    setPushState(getPushState());
  }, [settings.push_permission]);

  async function turnOnPush() {
    if (!user) return;
    setPushBusy(true);
    try {
      setPushState(await enablePush(supabase, user.id));
      await reload();
    } finally {
      setPushBusy(false);
    }
  }

  const loading = authLoading || !loaded || !flagsLoaded;
  const patch = (p: SettingsPatch) => update(p);
  const pushOn = pushState === "granted";

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label={t("common.back")} className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">{t("settings.title")}</h1>
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-crimson-soft px-3 py-2 text-[13px] text-crimson">{t("settings.saveError")}</p>
      )}

      {loading ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          {isOn("settings_appearance") && (
            <section className="mt-6">
              <h2 className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.appearance")}</h2>
              <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
                <span className="text-[14px] text-text">{t("settings.appearance")}</span>
                <ThemeToggle />
              </div>
            </section>
          )}

          {isOn("settings_language") && languages.length > 0 && (
            <section id="language" className="mt-6 scroll-mt-6">
              <h2 className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.language")}</h2>
              <div className="overflow-hidden rounded-md border border-border bg-surface">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => patch({ language: l.code })}
                    className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-[14px] text-text last:border-0"
                  >
                    {l.native_label}
                    {settings.language === l.code && <span className="text-pink">✓</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {isOn("settings_playback") && (
            <section className="mt-6">
              <h2 className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.playback")}</h2>
              <Toggle
                label={t("settings.autoplay")}
                checked={settings.autoplay_next}
                onChange={(v) => patch({ autoplay_next: v })}
              />
            </section>
          )}

          {isOn("settings_notifications") && (
            <section className="mt-6">
              <h2 className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.notifications")}</h2>
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-surface px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-text">{t("settings.push")}</span>
                    {pushOn ? (
                      <span className="text-[12.5px] font-semibold text-pink">{t("settings.pushOn")}</span>
                    ) : pushState === "default" ? (
                      <button
                        onClick={turnOnPush}
                        disabled={pushBusy}
                        className="text-[12.5px] font-semibold text-pink disabled:opacity-60"
                      >
                        {t("settings.pushTurnOn")}
                      </button>
                    ) : (
                      <span className="text-[12.5px] text-muted">{t("settings.pushOff")}</span>
                    )}
                  </div>
                  {pushState === "denied" && (
                    <p className="mt-1.5 text-[12px] text-muted">{t("settings.pushBlocked")}</p>
                  )}
                  {pushState === "unsupported" && (
                    <p className="mt-1.5 text-[12px] text-muted">{t("settings.pushUnsupported")}</p>
                  )}
                </div>
                <Toggle
                  label={t("settings.newEpisodes")}
                  checked={settings.notify_new_episodes}
                  onChange={(v) => patch({ notify_new_episodes: v })}
                />
                <Toggle
                  label={t("settings.rewards")}
                  checked={settings.notify_rewards}
                  onChange={(v) => patch({ notify_rewards: v })}
                />
                <Toggle
                  label={t("settings.promos")}
                  checked={settings.notify_promos}
                  onChange={(v) => patch({ notify_promos: v })}
                />
              </div>
            </section>
          )}

          {isOn("settings_whatsapp") && (
            <section className="mt-6">
              <h2 className="font-display mb-2 text-[14px] font-semibold text-text">{t("settings.whatsapp")}</h2>
              <button
                onClick={() => setWaOpen(true)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-left text-[14px] text-text"
              >
                {settings.whatsapp_number ?? t("settings.notLinked")}
                <span className="text-[12.5px] font-semibold text-pink">
                  {settings.whatsapp_number ? t("settings.change") : t("settings.link")}
                </span>
              </button>
            </section>
          )}
        </>
      )}

      <WhatsAppLinkSheet
        open={waOpen}
        onClose={() => setWaOpen(false)}
        onLinked={() => {
          setWaOpen(false);
          reload();
        }}
      />
    </div>
  );
}

// The knob is positioned by flex + padding (not `absolute` with no left/right
// anchor), so it can't drift outside the track. Travel = track (44) - knob (20)
// - padding (2 × 2) = 20px = translate-x-5.
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
      <span className="pr-3 text-[14px] text-text">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx(
          "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-pink" : "bg-border"
        )}
      >
        <span
          className={clsx(
            "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
