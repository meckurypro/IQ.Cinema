// hooks/useUserSettings.tsx

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_SETTINGS, SETTINGS_COLUMNS, type SettingsPatch, type UserSettings } from "@/lib/settings";

const supabase = createClient();
const LANG_KEY = "iq-lang";

type Ctx = {
  settings: UserSettings;
  loaded: boolean;
  error: string | null;
  update: (patch: SettingsPatch) => Promise<boolean>;
  reload: () => Promise<void>;
};

const SettingsContext = createContext<Ctx | undefined>(undefined);

// One fetch + one write path for the whole app, so the settings page, the
// player (autoplay) and the i18n layer can never disagree with each other or
// with the database.
export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Language is remembered locally too so the first paint (and guests) use it.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored) setSettings((s) => ({ ...s, language: stored }));
    } catch {}
  }, []);

  const reload = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select(SETTINGS_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setSettings({ ...DEFAULT_SETTINGS, ...(data as UserSettings) });
      try {
        localStorage.setItem(LANG_KEY, (data as UserSettings).language);
      } catch {}
    }
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    reload();
  }, [user, authLoading, reload]);

  const update = useCallback(
    async (patch: SettingsPatch) => {
      const previous = settingsRef.current;
      setSettings({ ...previous, ...patch });
      setError(null);
      if (patch.language) {
        try {
          localStorage.setItem(LANG_KEY, patch.language);
        } catch {}
      }
      if (!user) return true; // guests: local only
      const { error: dbError } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
      if (dbError) {
        setSettings(previous); // never leave the UI claiming something the DB doesn't have
        setError(dbError.message);
        return false;
      }
      return true;
    },
    [user]
  );

  const value = useMemo(() => ({ settings, loaded, error, update, reload }), [settings, loaded, error, update, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useUserSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useUserSettings must be used inside <UserSettingsProvider>");
  return ctx;
}
