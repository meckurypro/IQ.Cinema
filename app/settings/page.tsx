// app/settings/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/Skeleton";
import { WhatsAppLinkSheet } from "@/components/rewards/WhatsAppLinkSheet";

const supabase = createClient();

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "sw", label: "Kiswahili" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yorùbá" },
  { code: "ig", label: "Igbo" },
];

type Settings = {
  language: string;
  autoplay_next: boolean;
  notify_new_episodes: boolean;
  notify_rewards: boolean;
  notify_promos: boolean;
  whatsapp_number: string | null;
};

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [waOpen, setWaOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("language, autoplay_next, notify_new_episodes, notify_rewards, notify_promos, whatsapp_number")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSettings(
          data ?? {
            language: "en",
            autoplay_next: true,
            notify_new_episodes: true,
            notify_rewards: true,
            notify_promos: false,
            whatsapp_number: null,
          }
        );
      });
  }, [user]);

  async function patch(partial: Partial<Settings>) {
    if (!user || !settings) return;
    const next = { ...settings, ...partial };
    setSettings(next);
    await supabase.from("user_settings").upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
  }

  const loading = authLoading || !settings;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/profile" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">Settings</h1>
      </div>

      {loading ? (
        <div className="mt-5 space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <>
          <section id="language" className="mt-6 scroll-mt-6">
            <h2 className="font-display mb-2 text-[14px] font-semibold text-text">Language</h2>
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => patch({ language: l.code })}
                  className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-[14px] text-text last:border-0"
                >
                  {l.label}
                  {settings.language === l.code && <span className="text-pink">✓</span>}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-display mb-2 text-[14px] font-semibold text-text">Playback</h2>
            <Toggle
              label="Autoplay next episode"
              checked={settings.autoplay_next}
              onChange={(v) => patch({ autoplay_next: v })}
            />
          </section>

          <section className="mt-6">
            <h2 className="font-display mb-2 text-[14px] font-semibold text-text">Notifications</h2>
            <div className="space-y-2">
              <Toggle
                label="New episodes"
                checked={settings.notify_new_episodes}
                onChange={(v) => patch({ notify_new_episodes: v })}
              />
              <Toggle
                label="Rewards & offers"
                checked={settings.notify_rewards}
                onChange={(v) => patch({ notify_rewards: v })}
              />
              <Toggle
                label="Promotions"
                checked={settings.notify_promos}
                onChange={(v) => patch({ notify_promos: v })}
              />
            </div>
          </section>

          <section className="mt-6">
            <h2 className="font-display mb-2 text-[14px] font-semibold text-text">WhatsApp</h2>
            <button
              onClick={() => setWaOpen(true)}
              className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-3 text-left text-[14px] text-text"
            >
              {settings.whatsapp_number ?? "Not linked"}
              <span className="text-[12.5px] font-semibold text-pink">
                {settings.whatsapp_number ? "Change" : "Link"}
              </span>
            </button>
          </section>
        </>
      )}

      <WhatsAppLinkSheet
        open={waOpen}
        onClose={() => setWaOpen(false)}
        onLinked={() => {
          setWaOpen(false);
          supabase
            .from("user_settings")
            .select("whatsapp_number")
            .eq("user_id", user!.id)
            .maybeSingle()
            .then(({ data }) => data && patch({ whatsapp_number: data.whatsapp_number }));
        }}
      />
    </div>
  );
}

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
    <label className="flex items-center justify-between rounded-md border border-border bg-surface px-4 py-3">
      <span className="text-[14px] text-text">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-pink" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
