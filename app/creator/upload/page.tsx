// app/creator/upload/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Upload, Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { uploadVideoResumable } from "@/lib/supabase/resumableUpload";
import { hasFastStart } from "@/lib/mp4Faststart";
import {
  generateStoryboard,
  uploadStoryboard,
  storyboardPath,
  STORYBOARD_BUCKET,
} from "@/lib/storyboard";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
import { useI18n } from "@/hooks/useI18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { TagPicker } from "@/components/creator/TagPicker";

// ---------------------------------------------------------------------------
// Content-type config: duration cap (seconds) + what an upload "unit" is called
// ---------------------------------------------------------------------------
type ContentType = "short_episode" | "full_episode" | "one_part_film";


const CONTENT_TYPES: {
  value: ContentType;
  label: string;
  labelKey: MessageKey;
  unit: "episode" | "part";
  maxDurationSeconds: number;
  maxDurationLabel: string;
}[] = [
  {
    value: "short_episode",
    label: "Short episodes",
    labelKey: "upload.type.short",
    unit: "episode",
    maxDurationSeconds: 160, // 2:40
    maxDurationLabel: "2m 40s",
  },
  {
    value: "full_episode",
    label: "Full episodes",
    labelKey: "upload.type.full",
    unit: "episode",
    maxDurationSeconds: 1200, // 20:00
    maxDurationLabel: "20m",
  },
  {
    value: "one_part_film",
    label: "One-part film",
    labelKey: "upload.type.film",
    unit: "part",
    maxDurationSeconds: 7200, // 120:00
    maxDurationLabel: "120m",
  },
];

type UnitKeys = {
  maxPer: MessageKey; addUnit: MessageKey; inProject: MessageKey; deleteConfirm: MessageKey;
  deleteUnit: MessageKey; promoNotNumbered: MessageKey; unitNumber: MessageKey; unitName: MessageKey;
  limits: MessageKey; addAnother: MessageKey; footer: MessageKey; addVideo: MessageKey;
};
const UNIT_KEYS: Record<"episode" | "part", UnitKeys> = {
  episode: {
    maxPer: "upload.maxPer.episode", addUnit: "upload.addUnit.episode", inProject: "upload.inProject.episode",
    deleteConfirm: "upload.deleteConfirm.episode", deleteUnit: "upload.deleteUnit.episode",
    promoNotNumbered: "upload.promoNotNumbered.episode", unitNumber: "upload.unitNumber.episode",
    unitName: "upload.unitName.episode", limits: "upload.limits.episode", addAnother: "upload.addAnother.episode",
    footer: "upload.footer.episode", addVideo: "upload.err.addVideo.episode",
  },
  part: {
    maxPer: "upload.maxPer.part", addUnit: "upload.addUnit.part", inProject: "upload.inProject.part",
    deleteConfirm: "upload.deleteConfirm.part", deleteUnit: "upload.deleteUnit.part",
    promoNotNumbered: "upload.promoNotNumbered.part", unitNumber: "upload.unitNumber.part",
    unitName: "upload.unitName.part", limits: "upload.limits.part", addAnother: "upload.addAnother.part",
    footer: "upload.footer.part", addVideo: "upload.err.addVideo.part",
  },
};

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function getConfig(ct: ContentType) {
  return CONTENT_TYPES.find((c) => c.value === ct)!;
}

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${sec}s`;
  return `${m}m ${sec}s`;
}

// Reads a video file's duration + pixel dimensions in-browser, without uploading it.
function readVideoMetadata(file: File, t: Translate): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const { duration, videoWidth: width, videoHeight: height } = video;
      URL.revokeObjectURL(url);
      resolve({ duration, width, height });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t("upload.err.readVideo")));
    };
    video.src = url;
  });
}

const ASPECT_TARGET = 9 / 16; // 0.5625, portrait
const ASPECT_TOLERANCE = 0.02;

function validateVideo(
  meta: { duration: number; width: number; height: number },
  contentType: ContentType,
  t: Translate
): string | null {
  const config = getConfig(contentType);
  if (meta.duration > config.maxDurationSeconds + 1) {
    return t("upload.err.tooLong", {
      label: t(config.labelKey),
      max: config.maxDurationLabel,
      len: formatSeconds(meta.duration),
    });
  }
  if (meta.height > 0) {
    const ratio = meta.width / meta.height;
    if (Math.abs(ratio - ASPECT_TARGET) > ASPECT_TOLERANCE) {
      return t("upload.err.notPortrait", { w: meta.width, h: meta.height });
    }
  }
  return null;
}

const STATUS_KEY: Record<string, MessageKey> = {
  draft: "upload.status.draft",
  processing: "upload.status.processing",
  published: "upload.status.published",
  suspended: "upload.status.suspended",
};

type EpisodeRow = {
  id: string;
  episode_number: number;
  name: string | null;
  video_url: string | null;
  status: "draft" | "processing" | "published" | "suspended";
  duration_seconds: number | null;
};

export default function UploadPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const existingTitleId = searchParams.get("titleId");
  const requestedEpisodeId = searchParams.get("episodeId");
  // A dedicated promo clip isn't part of the 1..N numbering — it's created
  // with episode_number 0 and flagged is_promo via set_promo_episode below,
  // reusing this exact same form instead of a parallel upload flow.
  const isPromoMode = searchParams.get("promo") === "1";

  const [step, setStep] = useState<"title" | "episode">(existingTitleId ? "episode" : "title");
  const [titleId, setTitleId] = useState<string | null>(existingTitleId);
  const [contentType, setContentType] = useState<ContentType>("full_episode");
  const [titleName, setTitleName] = useState("");

  // title fields (step 1 only)
  const [synopsis, setSynopsis] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [genre, setGenre] = useState("");
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [contentRating, setContentRating] = useState<ContentRating>("13+");

  // episode/part fields (step 2)
  const [episodeRowId, setEpisodeRowId] = useState<string | null>(null); // set once a row exists
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeName, setEpisodeName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  // Non-blocking: the file will upload, but seeking in it will be slow.
  const [videoWarning, setVideoWarning] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<EpisodeRow["status"] | null>(null);

  const [units, setUnits] = useState<EpisodeRow[]>([]);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const [backfill, setBackfill] = useState<{ id: string; pct: number; msg?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<"draft" | "submit" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const config = getConfig(contentType);
  const uk = UNIT_KEYS[config.unit];

  useEffect(() => {
    supabase
      .from("genres")
      .select("name")
      .order("name")
      .then(({ data }) => setGenres((data ?? []).map((g) => g.name)));
  }, [supabase]);

  // When adding to an existing title: load its content_type/name, next episode number, and every unit.
  useEffect(() => {
    if (!existingTitleId) return;
    (async () => {
      const { data: t } = await supabase
        .from("titles")
        .select("title, content_type")
        .eq("id", existingTitleId)
        .single();
      if (t) {
        setTitleName(t.title);
        setContentType(t.content_type as ContentType);
      }
      const { data: eps } = await supabase
        .from("episodes")
        .select("id, episode_number, name, video_url, status, duration_seconds")
        .eq("title_id", existingTitleId)
        .order("episode_number", { ascending: false });
      if (eps) {
        setUnits(eps as EpisodeRow[]);
        if (isPromoMode) {
          // At most one dedicated (episode_number 0) clip per title — edit
          // it if it already exists, otherwise start a fresh one at 0.
          const existingPromo = eps.find((e) => e.episode_number === 0);
          if (existingPromo) loadEpisode(existingPromo as EpisodeRow);
          else setEpisodeNumber(0);
          return;
        }
        const maxNumber = eps.reduce((m, e) => Math.max(m, e.episode_number), 0);
        const requested = requestedEpisodeId ? eps.find((e) => e.id === requestedEpisodeId) : null;
        if (requested) {
          loadEpisode(requested as EpisodeRow);
        } else {
          setEpisodeNumber(maxNumber + 1);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTitleId, supabase]);

  async function handleCreateTitle(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving("submit");
    setError(null);

    let posterUrl: string | null = null;
    if (posterFile) {
      const path = `${user.id}/${crypto.randomUUID()}-${posterFile.name}`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, posterFile);
      if (upErr) {
        setError(upErr.message);
        setSaving(null);
        return;
      }
      const { data } = supabase.storage.from("posters").getPublicUrl(path);
      posterUrl = data.publicUrl;
    }

    // Clean slug from the title alone: it is the public link (/title/<slug>).
    // The database re-derives it and enforces that titles are unique.
    const slug = slugify(titleName) || crypto.randomUUID().slice(0, 8);

    const { data: title, error: insertError } = await supabase
      .from("titles")
      .insert({
        creator_id: user.id,
        title: titleName.trim(),
        slug,
        synopsis,
        content_type: contentType,
        poster_url: posterUrl,
        genre: genre || null,
        category,
        content_rating: contentRating,
        status: "draft",
      })
      .select()
      .single();

    setSaving(null);

    if (insertError || !title) {
      setError(
        insertError?.code === "23505"
          ? t("upload.err.titleExists")
          : insertError?.message ?? t("upload.err.createTitle")
      );
      return;
    }

    // Extra tags are best-effort: the title already exists, so a tag hiccup
    // shouldn't block the creator from moving on — they can re-pick later
    // from Edit details.
    if (extraTags.length) {
      const { data: gRows } = await supabase.from("genres").select("id, name").in("name", extraTags);
      if (gRows?.length) {
        await supabase
          .from("title_genres")
          .insert(gRows.map((g) => ({ title_id: title.id, genre_id: g.id })));
      }
    }

    setTitleId(title.id);
    setStep("episode");
  }

  // One-off backfill for episodes uploaded before storyboards existed.
  // Reads the stored video from the creator's device (slow, network-bound),
  // so it is explicit and shows progress rather than running for viewers.
  async function rebuildPreview(d: EpisodeRow) {
    if (!d.video_url) return;
    setBackfill({ id: d.id, pct: 0 });
    try {
      const { data, error: urlErr } = await supabase.storage
        .from("videos")
        .createSignedUrl(d.video_url, 60 * 30);
      if (urlErr || !data) throw urlErr ?? new Error("No URL");
      const blob = await generateStoryboard(data.signedUrl, {
        remote: true,
        onProgress: (pct) => setBackfill({ id: d.id, pct }),
      });
      await uploadStoryboard(supabase, d.video_url, blob);
      setBackfill({ id: d.id, pct: 1, msg: t("upload.previewReady") });
    } catch {
      setBackfill({
        id: d.id,
        pct: 0,
        msg: t("upload.previewFailed"),
      });
    }
  }

  async function handleSelectVideo(file: File | null) {
    setVideoFile(file);
    setVideoMeta(null);
    setVideoError(null);
    setVideoWarning(null);
    if (!file) return;

    setCheckingVideo(true);
    try {
      const meta = await readVideoMetadata(file, t);
      setVideoMeta(meta);
      const err = validateVideo(meta, contentType, t);
      setVideoError(err);
      if (!err && (await hasFastStart(file)) === false) {
        setVideoWarning(t("upload.warn.fastStart"));
      }
    } catch (err: any) {
      setVideoError(err.message ?? t("upload.err.readVideoShort"));
    } finally {
      setCheckingVideo(false);
    }
  }

  async function handleSaveEpisode(targetStatus: "draft" | "processing") {
    if (!user || !titleId) return;
    if (targetStatus === "processing" && !videoFile && !existingVideoUrl) {
      setError(t(uk.addVideo));
      return;
    }
    if (videoFile && videoError) {
      setError(videoError);
      return;
    }
    // Belt-and-suspenders: metadata check for the currently-selected file
    // must have actually finished before we let either button through, so
    // a video can never be saved (or start "uploading") before it's been
    // validated — and, further down, before the upload itself has fully
    // completed.
    if (videoFile && checkingVideo) {
      setError(t("upload.err.stillChecking"));
      return;
    }

    setSaving(targetStatus === "draft" ? "draft" : "submit");
    setError(null);
    setJustSaved(null);

    let videoPath: string | null = existingVideoUrl;
    const oldVideoPath = existingVideoUrl;
    const isReplacingVideo = !!videoFile;

    if (videoFile) {
      const path = `${user.id}/${titleId}/${crypto.randomUUID()}.mp4`;
      setUploadProgress(0);
      try {
        // Video must be FULLY uploaded before the row is written as a draft
        // or finalized — this await is what guarantees that; the insert/
        // update below never runs until uploadVideoResumable's promise
        // resolves (100% uploaded), and the resumable client itself only
        // resolves on tus's onSuccess.
        await uploadVideoResumable({
          bucket: "videos",
          path,
          file: videoFile,
          onProgress: setUploadProgress,
        });
      } catch (err: any) {
        setError(err.message ?? t("upload.err.uploadFailed"));
        setSaving(null);
        setUploadProgress(null);
        return;
      }
      setUploadProgress(null);
      videoPath = path;

      // Scrub-preview strip: built from the LOCAL file (instant seeks, no
      // network reads) and stored as one small image, so viewers scrub
      // against an image instead of the video. Best-effort — the episode
      // still saves without it.
      setBuildingPreview(true);
      const localUrl = URL.createObjectURL(videoFile);
      try {
        const blob = await generateStoryboard(localUrl);
        await uploadStoryboard(supabase, path, blob);
      } catch {
        /* non-fatal: player falls back to a plain scrub box */
      } finally {
        URL.revokeObjectURL(localUrl);
        setBuildingPreview(false);
      }
    }

    const payload = {
      title_id: titleId,
      episode_number: episodeNumber,
      name: episodeName || null,
      video_url: videoPath,
      duration_seconds: videoMeta ? Math.round(videoMeta.duration) : undefined,
      video_width: videoMeta ? videoMeta.width : undefined,
      video_height: videoMeta ? videoMeta.height : undefined,
      status: targetStatus, // "draft" while saving progress, "processing" once finalized
    };

    const { data: row, error: epErr } = episodeRowId
      ? await supabase.from("episodes").update(payload).eq("id", episodeRowId).select().single()
      : await supabase.from("episodes").insert(payload).select().single();

    setSaving(null);

    if (epErr) {
      setError(epErr.message);
      return;
    }

    // A freshly-uploaded file that replaced an old one leaves the old
    // storage object orphaned — clean it up now that the row points at the
    // new path. Best-effort: a failure here shouldn't block the save the
    // creator just successfully made.
    if (isReplacingVideo && oldVideoPath && oldVideoPath !== videoPath) {
      supabase.storage.from("videos").remove([oldVideoPath]).catch(() => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(oldVideoPath)]).catch(() => {});
    }

    setEpisodeRowId(row.id);
    setExistingVideoUrl(videoPath);
    setExistingStatus(row.status);
    // Clear the picked File now that it's safely uploaded and saved — if
    // this stayed set, clicking Save/Finalize again later (e.g. draft now,
    // finalize in a minute) would silently re-upload the exact same file a
    // second time. existingVideoUrl already carries the reference forward.
    setVideoFile(null);
    setVideoMeta(null);
    setJustSaved(targetStatus === "draft" ? "draft" : "submit");
    setUnits((prev) => {
      const others = prev.filter((u) => u.id !== row.id);
      return [...others, row as EpisodeRow].sort((a, b) => b.episode_number - a.episode_number);
    });

    if (isPromoMode) {
      const { data: promoResult, error: promoErr } = await supabase.rpc("set_promo_episode", {
        p_title_id: titleId,
        p_episode_id: row.id,
      });
      if (promoErr || !promoResult?.ok) {
        setError(promoErr?.message || promoResult?.error || t("upload.err.promoFailed"));
      }
    }
  }

  async function handleDeleteEpisode(id: string) {
    setDeleting(true);
    setError(null);
    const target = units.find((u) => u.id === id);
    const { error: delErr } = await supabase.from("episodes").delete().eq("id", id);
    setDeleting(false);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    if (target?.video_url) {
      supabase.storage.from("videos").remove([target.video_url]).catch(() => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(target.video_url)]).catch(() => {});
    }
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setConfirmDeleteId(null);
    if (episodeRowId === id) {
      resetForNextUnit();
    }
  }

  function resetForNextUnit() {
    setEpisodeRowId(null);
    setEpisodeNumber((n) => n + 1);
    setEpisodeName("");
    setVideoFile(null);
    setVideoMeta(null);
    setVideoError(null);
    setExistingVideoUrl(null);
    setExistingStatus(null);
    setJustSaved(null);
    setError(null);
  }

  function loadEpisode(d: EpisodeRow) {
    setEpisodeRowId(d.id);
    setEpisodeNumber(d.episode_number);
    setEpisodeName(d.name ?? "");
    setExistingVideoUrl(d.video_url);
    setExistingStatus(d.status);
    setVideoFile(null);
    setVideoMeta(null);
    setVideoError(null);
    setJustSaved(null);
    setError(null);
    setConfirmDeleteId(null);
  }

  const videoBusy = checkingVideo || saving !== null;

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href={titleId ? `/creator/title/${titleId}` : "/creator/dashboard"}
          aria-label={t("common.back")}
          className="text-text"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">
          {step === "title"
            ? t("upload.newTitle")
            : isPromoMode
              ? `${t("upload.promoClip")}${titleName ? ` · ${titleName}` : ""}`
              : `${t(uk.addUnit)}${titleName ? ` · ${titleName}` : ""}`}
        </h1>
      </div>

      {step === "title" ? (
        <form onSubmit={handleCreateTitle} className="mt-6 space-y-3">
          <div className="flex gap-2">
            {CONTENT_TYPES.map((ct) => (
              <button
                type="button"
                key={ct.value}
                onClick={() => setContentType(ct.value)}
                className={`h-14 flex-1 rounded-md border px-2 text-[12px] font-medium transition-all duration-150 active:scale-[0.98] ${
                  contentType === ct.value
                    ? "border-pink bg-pink/10 text-pink"
                    : "border-border bg-surface text-muted hover:border-pink/30 hover:text-text"
                }`}
              >
                <div>{t(ct.labelKey)}</div>
                <div className="text-[10px] opacity-70">{t(UNIT_KEYS[ct.unit].maxPer, { max: ct.maxDurationLabel })}</div>
              </button>
            ))}
          </div>
          <input
            required
            placeholder={t("upload.titlePlaceholder")}
            value={titleName}
            onChange={(e) => setTitleName(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
          />
          <select
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            aria-label={t("library.category")}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>
          <select
            required
            value={genre}
            onChange={(e) => {
              setGenre(e.target.value);
              setExtraTags((prev) => prev.filter((x) => x !== e.target.value));
            }}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text"
          >
            <option value="" disabled>
              {t("upload.genre")}
            </option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {genre && (
            <TagPicker options={genres} primary={genre} selected={extraTags} onChange={setExtraTags} />
          )}
          <select
            required
            value={contentRating}
            onChange={(e) => setContentRating(e.target.value as ContentRating)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text"
          >
            {CONTENT_RATINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.labelKey)}
              </option>
            ))}
          </select>
          <textarea
            placeholder={t("upload.synopsis")}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text placeholder:text-muted"
          />
          <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-surface px-4 text-[13px] text-muted">
            {posterFile ? posterFile.name : t("upload.poster")}
            <Upload size={15} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPosterFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {error && <p className="text-[13px] text-crimson">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={saving !== null}>
            {saving ? t("upload.creating") : t("upload.continue")}
          </Button>
        </form>
      ) : (
        <div className="mt-6 space-y-5">
          {titleId && (
            <Link
              href={`/creator/title/${titleId}`}
              className="block text-[12px] font-medium text-pink underline underline-offset-2"
            >
              Manage project (details, submit for review, withdraw)
            </Link>
          )}

          {units.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
                {t(uk.inProject)}
              </p>
              {units.map((d) => (
                <div
                  key={d.id}
                  className={`rounded-md border px-4 py-2 text-left text-[13px] ${
                    episodeRowId === d.id ? "border-pink bg-pink/5" : "border-border bg-surface"
                  }`}
                >
                  <button
                    onClick={() => loadEpisode(d)}
                    className="flex w-full items-center justify-between"
                  >
                    <span className="text-text">
                      {d.episode_number === 0
                        ? t("upload.promoClip")
                        : t(config.unit === "part" ? "upload.partN" : "common.episodeN", { n: d.episode_number })}
                      {d.name ? ` · ${d.name}` : ""}
                    </span>
                    <span className="text-[11px] text-muted">
                      {STATUS_KEY[d.status] ? t(STATUS_KEY[d.status]) : d.status}
                    </span>
                  </button>
                  {episodeRowId === d.id && (
                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                      {d.video_url && (
                        <div>
                          <button
                            type="button"
                            disabled={backfill?.id === d.id && !backfill.msg}
                            onClick={() => rebuildPreview(d)}
                            className="text-[12px] font-medium text-pink transition-colors duration-150 hover:text-pink/75 disabled:opacity-50"
                          >
                            {backfill?.id === d.id && !backfill.msg
                              ? t("upload.buildingPct", { pct: Math.round(backfill.pct * 100) })
                              : t("upload.buildPreview")}
                          </button>
                          {backfill?.id === d.id && backfill.msg && (
                            <p className="mt-1 text-[11px] text-muted">{backfill.msg}</p>
                          )}
                        </div>
                      )}
                      {confirmDeleteId === d.id ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-crimson">
                            {t(uk.deleteConfirm)}
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDeleteEpisode(d.id)}
                              className="rounded-md bg-crimson px-2.5 py-1 text-[11px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.97] active:brightness-95 disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {deleting ? t("upload.deleting") : t("upload.confirm")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted transition-colors duration-150 hover:bg-border/40 active:scale-[0.97]"
                            >
                              {t("common.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(d.id)}
                          className="flex items-center gap-1 text-[12px] font-medium text-crimson transition-colors duration-150 hover:text-crimson/75"
                        >
                          <Trash2 size={13} /> {t(uk.deleteUnit)}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveEpisode("processing");
            }}
            className="space-y-3"
          >
            {isPromoMode ? (
              <div className="flex h-12 w-full items-center rounded-md border border-dashed border-border bg-surface px-4 text-[14px] text-muted">
                {t(uk.promoNotNumbered)}
              </div>
            ) : (
              <input
                type="number"
                required
                min={1}
                placeholder={t(uk.unitNumber)}
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(Number(e.target.value))}
                className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
              />
            )}
            <input
              placeholder={t(uk.unitName)}
              value={episodeName}
              onChange={(e) => setEpisodeName(e.target.value)}
              className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
            />
            <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-surface px-4 text-[13px] text-muted">
              {videoFile
                ? videoFile.name
                : existingVideoUrl
                ? t("upload.videoAttached")
                : t("upload.videoFile")}
              <Upload size={15} />
              <input
                type="file"
                accept="video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => handleSelectVideo(e.target.files?.[0] ?? null)}
              />
            </label>
            {checkingVideo && <p className="text-[12px] text-muted">{t("upload.checkingVideo")}</p>}
            {videoMeta && !videoError && (
              <p className="text-[12px] text-muted">
                {formatSeconds(videoMeta.duration)} · {videoMeta.width}x{videoMeta.height} ✓
                {existingVideoUrl && videoFile ? t("upload.willReplace") : ""}
              </p>
            )}
            {videoError && <p className="text-[13px] text-crimson">{videoError}</p>}
            {!videoError && videoWarning && <p className="text-[13px] text-gold">{videoWarning}</p>}
            {buildingPreview && (
              <p className="text-[12px] text-muted">{t("upload.buildingPreview")}</p>
            )}
            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-pink transition-[width] duration-200"
                    style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted">
                  {t("upload.uploadingHint", { pct: Math.round(uploadProgress * 100) })}
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted">
              {t(uk.limits, { label: t(config.labelKey), max: config.maxDurationLabel })}
            </p>

            {error && <p className="text-[13px] text-crimson">{error}</p>}

            {justSaved && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-[13px] text-emerald-500">
                <Check size={15} />
                {justSaved === "draft" ? t("upload.savedDraft") : t("upload.finalized")}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                size="lg"
                disabled={videoBusy || !!videoError}
                onClick={() => handleSaveEpisode("draft")}
              >
                {saving === "draft"
                  ? uploadProgress !== null
                    ? t("upload.uploadingPct", { pct: Math.round(uploadProgress * 100) })
                    : t("upload.saving")
                  : t("upload.saveDraft")}
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={videoBusy || !!videoError}>
                {saving === "submit"
                  ? uploadProgress !== null
                    ? t("upload.uploadingPct", { pct: Math.round(uploadProgress * 100) })
                    : t("upload.finalizing")
                  : t("upload.finalize")}
              </Button>
            </div>

            {justSaved && !isPromoMode && (
              <Button
                type="button"
                onClick={resetForNextUnit}
                variant="ghost"
                className="w-full border border-dashed border-border text-[13px] text-muted hover:border-pink/40 hover:text-text"
              >
                <Plus size={14} /> {t(uk.addAnother)}
              </Button>
            )}

            <p className="text-center text-[12px] text-muted">
              {t(uk.footer)}
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
