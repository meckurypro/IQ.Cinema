// app/creator/title/[id]/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
import clsx from "clsx";
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { TagPicker } from "@/components/creator/TagPicker";

type TitleStatus =
  | "draft"
  | "in_review"
  | "published"
  | "coming_soon"
  | "suspended"
  | "rejected"
  | "withdrawn";

const STATUS_META: Record<TitleStatus, { labelKey: MessageKey; className: string }> = {
  draft: { labelKey: "creator.status.draft", className: "bg-surface-raised text-muted" },
  in_review: { labelKey: "creator.status.in_review", className: "bg-gold-soft text-gold" },
  published: { labelKey: "creator.status.published", className: "bg-emerald-600/15 text-emerald-500" },
  coming_soon: { labelKey: "creator.status.coming_soon", className: "bg-gold-soft text-gold" },
  suspended: { labelKey: "creator.status.suspended", className: "bg-crimson-soft text-crimson" },
  rejected: { labelKey: "creator.status.rejected", className: "bg-crimson-soft text-crimson" },
  withdrawn: { labelKey: "creator.status.withdrawn", className: "bg-surface-raised text-muted" },
};

// Episode-level statuses reuse the upload page's labels.
const EP_STATUS_KEY: Record<string, MessageKey> = {
  draft: "upload.status.draft",
  processing: "upload.status.processing",
  published: "upload.status.published",
  suspended: "upload.status.suspended",
};

type TitleRow = {
  id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  genre: string | null;
  category: string | null;
  content_rating: ContentRating | null;
  poster_url: string | null;
  content_type: string;
  status: TitleStatus;
  creator_id: string;
  admin_review_note: string | null;
  reviewed_at: string | null;
  review_ignored_at: string | null;
  total_unique_views: number;
};

type EpisodeRow = {
  id: string;
  episode_number: number;
  name: string | null;
  status: "draft" | "processing" | "published" | "suspended";
  video_url: string | null;
  is_promo: boolean;
};

const unitOf = (contentType: string | undefined): "episode" | "part" =>
  contentType === "one_part_film" ? "part" : "episode";

export default function ManageTitlePage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState<TitleRow | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRow[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Edit-details form state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSynopsis, setEditSynopsis] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editCategory, setEditCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [editContentRating, setEditContentRating] = useState<ContentRating>("13+");
  const [editPosterFile, setEditPosterFile] = useState<File | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  async function load() {
    const [{ data: t }, { data: eps }, { data: tagRows }] = await Promise.all([
      supabase
        .from("titles")
        .select(
          "id, title, slug, synopsis, genre, category, content_rating, poster_url, content_type, status, creator_id, admin_review_note, reviewed_at, review_ignored_at, total_unique_views"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("episodes")
        .select("id, episode_number, name, status, video_url, is_promo")
        .eq("title_id", id)
        .order("episode_number", { ascending: true }),
      supabase.from("title_genres").select("genres(name)").eq("title_id", id),
    ]);
    setTitle((t as TitleRow) ?? null);
    setEpisodes((eps as EpisodeRow[]) ?? []);
    if (t) {
      setEditTitle(t.title);
      setEditSynopsis(t.synopsis ?? "");
      setEditGenre(t.genre ?? "");
      setEditTags(
        ((tagRows ?? []) as unknown as { genres: { name: string } | null }[])
          .map((r) => r.genres?.name)
          .filter((n): n is string => !!n)
      );
      setEditCategory((t.category as Category) ?? DEFAULT_CATEGORY);
      setEditContentRating((t.content_rating as ContentRating) ?? "13+");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!id) return;
    load();
    supabase
      .from("genres")
      .select("name")
      .order("name")
      .then(({ data }) => setGenres((data ?? []).map((g) => g.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveDetails() {
    if (!title) return;
    setSavingDetails(true);
    setError(null);

    let posterUrl = title.poster_url;
    if (editPosterFile && user) {
      const path = `${user.id}/${crypto.randomUUID()}-${editPosterFile.name}`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, editPosterFile);
      if (upErr) {
        setError(upErr.message);
        setSavingDetails(false);
        return;
      }
      const { data } = supabase.storage.from("posters").getPublicUrl(path);
      posterUrl = data.publicUrl;
    }

    const { error: updErr } = await supabase
      .from("titles")
      .update({
        title: editTitle,
        synopsis: editSynopsis || null,
        genre: editGenre || null,
        category: editCategory,
        content_rating: editContentRating,
        poster_url: posterUrl,
      })
      .eq("id", title.id);

    if (updErr) {
      setSavingDetails(false);
      setError(
        updErr.code === "23505"
          ? t("upload.err.titleExists")
          : updErr.message
      );
      return;
    }

    // Replace the extra-tag set: clear, then insert the current picks.
    const keep = editTags.filter((n) => n !== editGenre);
    const { error: clearErr } = await supabase.from("title_genres").delete().eq("title_id", title.id);
    if (!clearErr && keep.length) {
      const { data: gRows } = await supabase.from("genres").select("id, name").in("name", keep);
      if (gRows?.length) {
        const { error: tagErr } = await supabase
          .from("title_genres")
          .insert(gRows.map((g) => ({ title_id: title.id, genre_id: g.id })));
        if (tagErr) setError(tagErr.message);
      }
    }
    setSavingDetails(false);
    setEditing(false);
    setEditPosterFile(null);
    load();
  }

  async function submitForReview() {
    setActionBusy("submit");
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("submit_title_for_review", {
      p_title_id: id,
    });
    setActionBusy(null);
    if (rpcErr || !data?.ok) {
      const reason =
        data?.error === "no_video"
          ? t(unitOf(title?.content_type) === "part" ? "manage.err.noVideo.part" : "manage.err.noVideo.episode")
          : rpcErr?.message || data?.error || t("manage.err.submit");
      setError(reason);
      return;
    }
    load();
  }

  async function withdraw() {
    setActionBusy("withdraw");
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("withdraw_title", { p_title_id: id });
    setActionBusy(null);
    if (rpcErr || !data?.ok) {
      setError(rpcErr?.message || data?.error || t("manage.err.withdraw"));
      return;
    }
    load();
  }

  async function setPromo(episodeId: string) {
    setActionBusy(`promo-${episodeId}`);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("set_promo_episode", {
      p_title_id: id,
      p_episode_id: episodeId,
    });
    setActionBusy(null);
    if (rpcErr || !data?.ok) {
      setError(rpcErr?.message || data?.error || t("manage.err.promo"));
      return;
    }
    load();
  }

  if (loading) {
    return (
      <div className="fade-in px-4 pt-5 pb-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }

  if (!title || (user && title.creator_id !== user.id)) {
    return (
      <div className="fade-in px-4 pt-5 pb-10">
        <p className="text-center text-sm text-muted">{t("manage.notFound")}</p>
      </div>
    );
  }

  const unit = unitOf(title.content_type);
  const isPart = unit === "part";
  const unitN = (n: number) => t(isPart ? "upload.partN" : "common.episodeN", { n });
  const numberedEpisodes = episodes.filter((e) => e.episode_number > 0);
  const promoClip = episodes.find((e) => e.episode_number === 0) ?? null;
  // Only an episode that's been finalized (sent into the transcode
  // pipeline or already published) counts — a video_url can exist on a
  // still-draft episode mid-edit, which used to let a project get
  // submitted (and approved) with nothing actually playable.
  const hasFinalizedEpisode = episodes.some((e) => e.status === "processing" || e.status === "published");
  const meta = STATUS_META[title.status];
  const canSubmit = ["draft", "rejected", "withdrawn"].includes(title.status);
  const canWithdraw = ["in_review", "published"].includes(title.status);

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/creator/dashboard" aria-label={t("common.back")} className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold text-text">
          {title.title}
        </h1>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold", meta.className)}>
          {t(meta.labelKey)}
        </span>
        {title.content_rating && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted">
            {title.content_rating}
          </span>
        )}
        {title.genre && <span className="text-[12px] text-muted">{title.genre}</span>}
      </div>

      {title.status === "rejected" && title.admin_review_note && (
        <div className="mt-3 rounded-md border border-crimson/30 bg-crimson-soft px-4 py-3 text-[13px] text-crimson">
          <p className="font-semibold">{t("manage.declined")}</p>
          <p className="mt-0.5">{title.admin_review_note}</p>
        </div>
      )}
      {title.review_ignored_at && title.status === "in_review" && (
        <div className="mt-3 rounded-md border border-gold/30 bg-gold-soft px-4 py-3 text-[13px] text-gold">
          {t("manage.stillInReview")}
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-crimson">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSubmit && (
          <Button
            size="sm"
            disabled={actionBusy !== null || !hasFinalizedEpisode}
            onClick={submitForReview}
            title={!hasFinalizedEpisode ? t(isPart ? "manage.finalizeFirst.part" : "manage.finalizeFirst.episode") : undefined}
          >
            {actionBusy === "submit" ? t("creator.submitting") : t("manage.submitForReview")}
          </Button>
        )}
        {canWithdraw && (
          <Button size="sm" variant="secondary" disabled={actionBusy !== null} onClick={withdraw}>
            {actionBusy === "withdraw" ? t("manage.withdrawing") : t("manage.withdraw")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          <Pencil size={13} /> {editing ? t("manage.cancelEdit") : t("manage.editDetails")}
        </Button>
      </div>

      {editing && (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-surface p-4">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder={t("upload.titlePlaceholder")}
            className="h-12 w-full rounded-md border border-border bg-bg px-4 text-[14px] text-text"
          />
          <select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value as Category)}
            aria-label={t("library.category")}
            className="h-12 w-full rounded-md border border-border bg-bg px-4 text-[14px] text-text"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
          <select
            value={editGenre}
            onChange={(e) => setEditGenre(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-bg px-4 text-[14px] text-text"
          >
            <option value="">{t("manage.noGenre")}</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {editGenre && (
            <TagPicker options={genres} primary={editGenre} selected={editTags} onChange={setEditTags} />
          )}
          <select
            value={editContentRating}
            onChange={(e) => setEditContentRating(e.target.value as ContentRating)}
            className="h-12 w-full rounded-md border border-border bg-bg px-4 text-[14px] text-text"
          >
            {CONTENT_RATINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.labelKey)}
              </option>
            ))}
          </select>
          <textarea
            value={editSynopsis}
            onChange={(e) => setEditSynopsis(e.target.value)}
            rows={3}
            placeholder={t("upload.synopsis")}
            className="w-full rounded-md border border-border bg-bg px-4 py-3 text-[14px] text-text"
          />
          <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-bg px-4 text-[13px] text-muted">
            {editPosterFile ? editPosterFile.name : t("manage.replacePoster")}
            <Upload size={15} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setEditPosterFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button className="w-full" disabled={savingDetails} onClick={saveDetails}>
            {savingDetails ? t("upload.saving") : t("manage.saveChanges")}
          </Button>
        </div>
      )}

      <div className="mt-7 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-semibold text-text">{t(isPart ? "manage.unitHeading.part" : "manage.unitHeading.episode")}</h2>
        <Link href={`/creator/upload?titleId=${title.id}`}>
          <Button size="sm" variant="secondary">
            <Plus size={14} /> {t(isPart ? "upload.addUnit.part" : "upload.addUnit.episode")}
          </Button>
        </Link>
      </div>

      <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {numberedEpisodes.map((ep) => (
          <li key={ep.id}>
            <Link
              href={`/creator/upload?titleId=${title.id}&episodeId=${ep.id}`}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-[14px] font-medium text-text">
                  {unitN(ep.episode_number)}
                  {ep.name ? ` · ${ep.name}` : ""}
                </p>
                <p className="mt-0.5 text-[12px] capitalize text-muted">{EP_STATUS_KEY[ep.status] ? t(EP_STATUS_KEY[ep.status]) : ep.status}</p>
              </div>
              <span className="text-[12px] text-pink">{t("manage.edit")}</span>
            </Link>
          </li>
        ))}
        {!numberedEpisodes.length && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            {t(isPart ? "manage.noUnits.part" : "manage.noUnits.episode")}
          </li>
        )}
      </ul>

      {/* Promo episode: what shows on the For You feed. Either an existing
          published episode flagged as the promo, or a dedicated clip
          uploaded outside the 1..N numbering — same underlying table, no
          separate structure. */}
      <div className="mt-7 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-semibold text-text">{t("manage.promoEpisode")}</h2>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        {t(isPart ? "manage.promoHint.part" : "manage.promoHint.episode")}
      </p>

      <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {promoClip && (
          <li className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[14px] font-medium text-text">
                {t("manage.dedicatedPromoClip")}{promoClip.name ? ` · ${promoClip.name}` : ""}
              </p>
              <p className="mt-0.5 text-[12px] capitalize text-muted">
                {EP_STATUS_KEY[promoClip.status] ? t(EP_STATUS_KEY[promoClip.status]) : promoClip.status}
                {promoClip.is_promo ? t("manage.currentlyPromo") : ""}
              </p>
            </div>
            <Link href={`/creator/upload?titleId=${title.id}&promo=1`} className="text-[12px] text-pink">
              {t("manage.edit")}
            </Link>
          </li>
        )}
        {numberedEpisodes.map((ep) => (
          <li key={ep.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[14px] font-medium text-text">
                {unitN(ep.episode_number)}
                {ep.name ? ` · ${ep.name}` : ""}
              </p>
              {ep.is_promo && (
                <p className="mt-0.5 text-[12px] font-semibold text-pink">{t("manage.currentlyPromoEpisode")}</p>
              )}
            </div>
            {ep.is_promo ? (
              <span className="text-[12px] text-muted">{t("manage.promo")}</span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={actionBusy !== null || ep.status !== "published"}
                onClick={() => setPromo(ep.id)}
                title={ep.status !== "published" ? t("manage.publishFirst") : undefined}
              >
                {actionBusy === `promo-${ep.id}` ? t("manage.settingPromo") : t("manage.setAsPromo")}
              </Button>
            )}
          </li>
        ))}
        {!numberedEpisodes.length && !promoClip && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            {t(isPart ? "manage.noUnitsPromo.part" : "manage.noUnitsPromo.episode")}
          </li>
        )}
      </ul>

      {!promoClip && (
        <Link
          href={`/creator/upload?titleId=${title.id}&promo=1`}
          className="mt-2 inline-block text-[12px] font-medium text-pink underline underline-offset-2"
        >
          {t("manage.uploadPromoInstead")}
        </Link>
      )}
    </div>
  );
}
