// hooks/useI18n.tsx

"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { dictionaries, en, type MessageKey } from "@/lib/i18n/messages";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;
const I18nContext = createContext<{ lang: string; t: T } | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useUserSettings();
  const lang = dictionaries[settings.language] ? settings.language : "en";

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => {
    const dict = dictionaries[lang] ?? en;
    const t: T = (key, vars) => {
      let out: string = dict[key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
      return out;
    };
    return { lang, t };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
