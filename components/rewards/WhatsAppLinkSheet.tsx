// components/rewards/WhatsAppLinkSheet.tsx

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useI18n } from "@/hooks/useI18n";

const supabase = createClient();

export function WhatsAppLinkSheet({
  open,
  onClose,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("link_whatsapp", { p_number: value });
    setBusy(false);
    if (rpcError || !data?.ok) {
      setError(data?.error === "number_in_use" ? t("whatsapp.inUse") : t("whatsapp.invalid"));
      return;
    }
    setValue("");
    onLinked();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("whatsapp.title")}>
      <div className="px-4 pb-4 pt-1">
        <p className="text-[13px] text-muted">
          {t("whatsapp.intro")}
        </p>
        <input
          type="tel"
          inputMode="tel"
          autoFocus
          placeholder="080X XXX XXXX"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-3 h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-text outline-none focus:border-pink"
        />
        {error && <p className="mt-2 text-[12.5px] text-crimson">{error}</p>}
        <Button className="mt-4 w-full" disabled={busy || !value.trim()} onClick={submit}>
          {busy ? t("whatsapp.linking") : t("whatsapp.link")}
        </Button>
      </div>
    </BottomSheet>
  );
}
