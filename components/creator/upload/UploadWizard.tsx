// components/creator/upload/UploadWizard.tsx
//
// Guided upload for every kind of content: series episodes, films, music
// videos and commercials.
//
//   1 Type → 2 Details → 3 Thumbnail → 4 Video → 5 Review & submit
//
// Principles
//   • Everything is a draft until the last step. The project row is created the
//     moment Details is saved; the episode row is created the moment the video
//     finishes uploading. Close the tab at any point and "Continue" from the
//     dashboard picks up at the first unfinished step.
//   • Nothing fails silently. Each step shows its own errors next to its own
//     controls, uploads show real-time progress, and every async path ends in
//     either a success state or a visible, actionable error.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  CloudUpload,
  Film,
  ImagePlus,
  Megaphone,
  Music,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startVideoUpload, resolveVideoContentType } from "@/lib/supabase/resumableUpload";
import { hasFastStart } from "@/lib/mp4Faststart";
import { generateStoryboard, uploadStoryboard, storyboardPath, STORYBOARD_BUCKET } from "@/lib/storyboard";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/Button";
import { TagPicker } from "@/components/creator/TagPicker";
import { CATEGORIES, DEFAULT_CATEGORY, type Category } from "@/lib/categories";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
import { translateRuntimeError } from "@/lib/i18n/runtimeErrors";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  CONTENT_TYPES,
  checkVideoFile,
  checkVideoMeta,
  genresForType,
  getTypeConfig,
  type ContentType,
  type VideoIssue,
  type VideoMeta,
} from "@/lib/uploadTypes";
import { checkImageFile, uploadImageWithProgress } from "@/lib/upload/imageUpload";
import { uploadErrorMessage } from "@/lib/upload/errorMessages";
import { UploadError, type TusUploadHandle, type UploadSnapshot } from "@/lib/upload/tusUpload";
import { readVideoMetadata, VideoReadError } from "@/lib/upload/videoMeta";
import { slugify, withTimeout } from "@/lib/upload/helpers";
import { formatBytes, formatDuration } from "@/lib/upload/format";
import { Notice } from "./Notice";
import { StepIndicator, type StepState } from "./StepIndicator";
import { UploadProgressCard } from "./UploadProgressCard";

type StepId = "type" | "details" | "thumbnail" | "video" | "review";
type TitleStatus = "draft" | "in_review" | "published" | "rejected" | "withdrawn" | string;

type EpisodeRow = {
  id: string;
  episode_number: number;
  name: string | null;
  video_url: string | null;
  status: "draft" | "processing" | "published" | "suspended";
  duration_seconds: number | null;
};

const TYPE_ICON: Record<ContentType, LucideIcon> = {
  short_episode: Clapperboard,
  full_episode: Film,
  one_part_film: Video,
  music_video: Music,
  commercial: Megaphone,
};

const STATUS_KEY: Record<string, MessageKey> = {
  draft: "upload.status.draft",
  processing: "upload.status.processing",
  published: "upload.status.published",
  suspended: "upload.status.suspended",
};

const ACTIVE_PHASES = ["starting", "uploading", "paused", "retrying", "offline", "error"];

// ---- local draft (only needed BEFORE the project row exists) ---------------
type LocalDraft = {
  contentType: ContentType;
  titleName: string;
  creditName: string;
  category: Category;
  genre: string;
  extraTags: string[];
  synopsis: string;
  contentRating: ContentRating;
};
const draftKey = (uid: string) => `iq.upload.draft.v2:${uid}`;
function readLocalDraft(uid: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(uid));
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null; // storage blocked or corrupt — just start fresh
  }
}
function writeLocalDraft(uid: string, d: LocalDraft) {
  try {
    localStorage.setItem(draftKey(uid), JSON.stringify(d));
  } catch {
    /* storage blocked — drafts still save to the database from step 2 */
  }
}
function clearLocalDraft(uid: string) {
  try {
    localStorage.removeItem(draftKey(uid));
  } catch {
    /* ignore */
  }
}

const inputCls =
  "h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted focus:border-pink/60 focus:outline-none";

export function UploadWizard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const existingTitleId = searchParams.get("titleId");
  const requestedEpisodeId = searchParams.get("episodeId");
  const isPromoMode = searchParams.get("promo") === "1";

  // ---- project (title) state ----------------------------------------------
  const [step, setStep] = useState<StepId>(existingTitleId ? "video" : "type");
  const [titleId, setTitleId] = useState<string | null>(existingTitleId);
  const [titleStatus, setTitleStatus] = useState<TitleStatus>("draft");
  const [contentType, setContentType] = useState<ContentType>("full_episode");
  const [titleName, setTitleName] = useState("");
  const [creditName, setCreditName] = useState("");
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [genre, setGenre] = useState("");
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [synopsis, setSynopsis] = useState("");
  const [contentRating, setContentRating] = useState<ContentRating>("13+");
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  // ---- thumbnail step -------------------------------------------------------
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [posterProgress, setPosterProgress] = useState<number | null>(null);

  // ---- video step -----------------------------------------------------------
  const [units, setUnits] = useState<EpisodeRow[]>([]);
  const [episodeRowId, setEpisodeRowId] = useState<string | null>(null);
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeName, setEpisodeName] = useState("");
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<EpisodeRow["status"] | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [videoIssue, setVideoIssue] = useState<string | null>(null);
  const [videoWarning, setVideoWarning] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [videoSnap, setVideoSnap] = useState<UploadSnapshot | null>(null);
  const [buildingPreview, setBuildingPreview] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null); // uploaded, but the row isn't saved yet
  const [justSaved, setJustSaved] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [backfill, setBackfill] = useState<{ id: string; pct: number; msg?: string } | null>(null);
  const handleRef = useRef<TusUploadHandle | null>(null);

  // ---- shared UI state ------------------------------------------------------
  const [loadingExisting, setLoadingExisting] = useState(!!existingTitleId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StepId, string>>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [submitted, setSubmitted] = useState<"submitted" | "finalized" | null>(null);

  const cfg = getTypeConfig(contentType);
  const isSeries = cfg.unit === "episode";
  const loadedIdRef = useRef<string | null>(null);

  const setError = useCallback((id: StepId, msg: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[id] = msg;
      else delete next[id];
      return next;
    });
  }, []);
  const markSaved = () => setSavedAt(new Date());

  const uploading = !!videoSnap && ACTIVE_PHASES.includes(videoSnap.phase);
  const genreOptions = useMemo(() => genresForType(allGenres, contentType), [allGenres, contentType]);

  // ---- genres ---------------------------------------------------------------
  useEffect(() => {
    supabase
      .from("genres")
      .select("name")
      .order("name")
      .then(({ data, error }) => {
        if (error) setError("details", translateRuntimeError(error.message, t));
        setAllGenres((data ?? []).map((g) => g.name));
      });
  }, [supabase, setError, t]);

  // ---- restore an unsaved pre-project draft --------------------------------
  useEffect(() => {
    if (!user || existingTitleId) return;
    const d = readLocalDraft(user.id);
    if (!d || !d.titleName) return;
    setContentType(d.contentType);
    setTitleName(d.titleName);
    setCreditName(d.creditName ?? "");
    setCategory(d.category);
    setGenre(d.genre);
    setExtraTags(d.extraTags ?? []);
    setSynopsis(d.synopsis ?? "");
    setContentRating(d.contentRating ?? "13+");
    setRestoredDraft(true);
  }, [user, existingTitleId]);

  // ...and keep it current while the project row doesn't exist yet.
  useEffect(() => {
    if (!user || titleId) return;
    const id = setTimeout(
      () => writeLocalDraft(user.id, { contentType, titleName, creditName, category, genre, extraTags, synopsis, contentRating }),
      400
    );
    return () => clearTimeout(id);
  }, [user, titleId, contentType, titleName, creditName, category, genre, extraTags, synopsis, contentRating]);

  // ---- open an existing project (resume a draft / add an episode / promo) ---
  useEffect(() => {
    if (!existingTitleId || !user || loadedIdRef.current === existingTitleId) return;
    loadedIdRef.current = existingTitleId;
    (async () => {
      setLoadingExisting(true);
      setLoadError(null);
      try {
        const { data: tRow, error: tErr } = await supabase
          .from("titles")
          .select("id, title, synopsis, genre, category, content_rating, poster_url, content_type, status, creator_id")
          .eq("id", existingTitleId)
          .maybeSingle();
        if (tErr) throw new Error(tErr.message);
        if (!tRow || tRow.creator_id !== user.id) {
          setLoadError(t("upload.wiz.err.notFound"));
          return;
        }
        const ct = tRow.content_type as ContentType;
        setContentType(ct);
        setTitleName(tRow.title);
        // credit_name only exists for music videos / commercials; fetched on its own
        // so projects of other types never depend on that column existing.
        if (getTypeConfig(ct).creditLabelKey) {
          const { data: c } = await supabase.from("titles").select("credit_name").eq("id", existingTitleId).maybeSingle();
          setCreditName((c as { credit_name?: string | null } | null)?.credit_name ?? "");
        }
        setCategory((tRow.category as Category) ?? DEFAULT_CATEGORY);
        setGenre(tRow.genre ?? "");
        setSynopsis(tRow.synopsis ?? "");
        setContentRating((tRow.content_rating as ContentRating) ?? "13+");
        setPosterUrl(tRow.poster_url);
        setTitleStatus(tRow.status);

        const [{ data: tagRows }, { data: eps, error: eErr }] = await Promise.all([
          supabase.from("title_genres").select("genres(name)").eq("title_id", existingTitleId),
          supabase
            .from("episodes")
            .select("id, episode_number, name, video_url, status, duration_seconds")
            .eq("title_id", existingTitleId)
            .order("episode_number", { ascending: false }),
        ]);
        if (eErr) throw new Error(eErr.message);
        setExtraTags(
          ((tagRows ?? []) as any[]).map((r) => (Array.isArray(r.genres) ? r.genres[0]?.name : r.genres?.name)).filter(Boolean)
        );
        const rows = (eps ?? []) as EpisodeRow[];
        setUnits(rows);

        let next: StepId = "video";
        if (isPromoMode) {
          const promo = rows.find((e) => e.episode_number === 0);
          if (promo) loadEpisode(promo);
          else setEpisodeNumber(0);
        } else {
          const requested = requestedEpisodeId ? rows.find((e) => e.id === requestedEpisodeId) : null;
          const maxNumber = rows.reduce((m, e) => Math.max(m, e.episode_number), 0);
          if (requested) loadEpisode(requested);
          else if (getTypeConfig(ct).unit === "part" && rows.length) loadEpisode(rows[0]);
          else setEpisodeNumber(maxNumber + 1);

          // Resume at the first unfinished step.
          const hasVideo = rows.some((e) => e.video_url);
          if (!requested) {
            if (!tRow.genre) next = "details";
            else if (!tRow.poster_url) next = "thumbnail";
            else if (!hasVideo) next = "video";
            else next = getTypeConfig(ct).unit === "part" ? "review" : "video";
          }
        }
        setStep(next);
      } catch (e) {
        setLoadError(translateRuntimeError(e instanceof Error ? e.message : "", t) || t("upload.wiz.err.notFound"));
      } finally {
        setLoadingExisting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTitleId, user, supabase]);

  // ---- keep the screen awake + warn before leaving mid-upload ---------------
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    let lock: any = null;
    (navigator as any).wakeLock?.request?.("screen").then((l: any) => (lock = l)).catch(() => {});
    return () => {
      window.removeEventListener("beforeunload", warn);
      lock?.release?.().catch?.(() => {});
    };
  }, [uploading]);

  // Leaving the page pauses (doesn't discard) a running upload.
  useEffect(() => () => handleRef.current?.pause(), []);

  // ---- poster preview object URL -------------------------------------------
  useEffect(() => {
    if (!posterFile) {
      setPosterPreview(null);
      return;
    }
    const url = URL.createObjectURL(posterFile);
    setPosterPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [posterFile]);

  // ===========================================================================
  // Step 2 — details
  // ===========================================================================
  async function saveDetails() {
    if (!user) return;
    const name = titleName.trim();
    if (!name) return setError("details", t("upload.wiz.err.needTitle"));
    if (!genre) return setError("details", t("upload.wiz.err.needGenre"));
    setBusy("details");
    setError("details", null);
    try {
      const fields = {
        title: name,
        synopsis: synopsis.trim() || null,
        genre,
        category: cfg.fixedCategory ?? category,
        content_rating: contentRating,
        // Only sent for types that have a credit line, so series/films don't
        // depend on the new column.
        ...(cfg.creditLabelKey ? { credit_name: creditName.trim() || null } : {}),
      };
      let id = titleId;
      if (!id) {
        const slug = slugify(name) || crypto.randomUUID().slice(0, 8);
        const { data, error } = await supabase
          .from("titles")
          .insert({ ...fields, creator_id: user.id, slug, content_type: contentType, status: "draft" })
          .select("id, status")
          .single();
        if (error || !data) {
          // A new content type before the database update has been applied.
          if (error && /invalid input value for enum content_type/i.test(error.message)) {
            throw new Error(t("upload.wiz.err.typeNotReady"));
          }
          throw new Error(error?.code === "23505" ? t("upload.err.titleExists") : error?.message ?? t("upload.err.createTitle"));
        }
        id = data.id;
        loadedIdRef.current = id; // we already hold this project's state; don't reload it
        setTitleId(id);
        setTitleStatus(data.status);
        clearLocalDraft(user.id);
        // Reflect the new draft in the URL so refresh / "Continue" resume here.
        window.history.replaceState(null, "", `/creator/upload?titleId=${id}`);
      } else {
        const { error } = await supabase.from("titles").update(fields).eq("id", id);
        if (error) throw new Error(error.code === "23505" ? t("upload.err.titleExists") : error.message);
      }
      // Tags: replace the set (best-effort — the project already exists).
      await supabase.from("title_genres").delete().eq("title_id", id);
      const keep = extraTags.filter((n) => n !== genre);
      if (keep.length) {
        const { data: gRows } = await supabase.from("genres").select("id, name").in("name", keep);
        if (gRows?.length) await supabase.from("title_genres").insert(gRows.map((g) => ({ title_id: id, genre_id: g.id })));
      }
      markSaved();
      setStep("thumbnail");
    } catch (e) {
      setError("details", translateRuntimeError(e instanceof Error ? e.message : String(e), t));
    } finally {
      setBusy(null);
    }
  }

  // ===========================================================================
  // Step 3 — thumbnail
  // ===========================================================================
  function pickPoster(file: File | null) {
    setError("thumbnail", null);
    setPosterProgress(null);
    if (!file) return setPosterFile(null);
    const problem = checkImageFile(file);
    if (problem) {
      setPosterFile(null);
      return setError("thumbnail", uploadErrorMessage(problem, t));
    }
    setPosterFile(file);
  }

  async function savePoster() {
    if (!user || !titleId) return;
    if (!posterFile) return setStep("video"); // nothing new; keep the existing one
    setBusy("thumbnail");
    setError("thumbnail", null);
    setPosterProgress(0);
    try {
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        15_000,
        () => new UploadError("signed_out", "session timeout")
      );
      if (error || !data.session) throw new UploadError("signed_out", "signed out", 401);
      const safe = posterFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const path = `${user.id}/${crypto.randomUUID()}-${safe}`;
      await uploadImageWithProgress({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        token: data.session.access_token,
        bucket: "posters",
        path,
        file: posterFile,
        onProgress: setPosterProgress,
      });
      const url = supabase.storage.from("posters").getPublicUrl(path).data.publicUrl;
      const { error: updErr } = await supabase.from("titles").update({ poster_url: url }).eq("id", titleId);
      if (updErr) throw new Error(updErr.message);
      setPosterUrl(url);
      setPosterFile(null);
      markSaved();
      setStep("video");
    } catch (e) {
      setError(
        "thumbnail",
        e instanceof UploadError ? uploadErrorMessage(e, t) : translateRuntimeError(e instanceof Error ? e.message : String(e), t)
      );
    } finally {
      setPosterProgress(null);
      setBusy(null);
    }
  }

  // ===========================================================================
  // Step 4 — video
  // ===========================================================================
  function describeIssue(issue: VideoIssue): string {
    switch (issue.kind) {
      case "too_long":
        return t("upload.err.tooLong", { label: t(cfg.labelKey), max: issue.max, len: formatDuration(issue.len) });
      case "bad_aspect_portrait":
        return t("upload.err.notPortrait", { w: issue.w, h: issue.h });
      case "bad_aspect_flexible":
        return t("upload.wiz.err.notPortraitOrLandscape", { w: issue.w, h: issue.h });
      case "too_big":
        return t("upload.wiz.err.videoTooBig", { size: formatBytes(issue.bytes) });
    }
  }

  async function pickVideo(file: File | null) {
    setVideoFile(file);
    setVideoMeta(null);
    setVideoIssue(null);
    setVideoWarning(null);
    setError("video", null);
    setJustSaved(false);
    if (!file) return;

    if (!resolveVideoContentType(file)) {
      setVideoIssue(t("upload.wiz.err.unsupportedType", { status: "" }));
      return;
    }
    const big = checkVideoFile(file);
    if (big) {
      setVideoIssue(describeIssue(big));
      return;
    }
    setCheckingVideo(true);
    try {
      const meta = await readVideoMetadata(file);
      setVideoMeta(meta);
      const issue = checkVideoMeta(meta, contentType);
      if (issue) {
        setVideoIssue(describeIssue(issue));
        return;
      }
      if ((await hasFastStart(file)) === false) setVideoWarning(t("upload.warn.fastStart"));
    } catch (e) {
      setVideoIssue(
        e instanceof VideoReadError && e.reason === "timeout" ? t("upload.wiz.err.readTimeout") : t("upload.err.readVideo")
      );
    } finally {
      setCheckingVideo(false);
    }
  }

  async function startUpload() {
    if (!user || !titleId || !videoFile || videoIssue || checkingVideo) return;
    if (!navigator.onLine) return setError("video", t("upload.wiz.err.network", { status: "" }));
    setError("video", null);
    setJustSaved(false);
    const file = videoFile;
    const path = `${user.id}/${titleId}/${crypto.randomUUID()}.mp4`;
    const handle = startVideoUpload({ bucket: "videos", path, file, onUpdate: setVideoSnap });
    handleRef.current = handle;
    try {
      await handle.done;
    } catch (e) {
      handleRef.current = null;
      setVideoSnap(null);
      if (e instanceof UploadError && e.code !== "cancelled") setError("video", uploadErrorMessage(e, t));
      return;
    }
    handleRef.current = null;

    // Scrub-preview strip from the LOCAL file (instant seeks); best-effort.
    setBuildingPreview(true);
    const localUrl = URL.createObjectURL(file);
    try {
      const blob = await generateStoryboard(localUrl);
      await uploadStoryboard(supabase, path, blob);
    } catch {
      /* non-fatal: the player falls back to a plain scrub box */
    } finally {
      URL.revokeObjectURL(localUrl);
      setBuildingPreview(false);
    }

    await persistEpisode(path);
  }

  // Writes the episode row for an already-uploaded video. Split from the upload
  // so that if THIS fails (e.g. a database rule), the person can retry saving
  // without re-uploading gigabytes — and the file is never orphaned.
  async function persistEpisode(videoPath: string) {
    if (!user || !titleId) return;
    setBusy("video");
    setError("video", null);
    try {
      const oldPath = existingVideoUrl;
      const payload = {
        title_id: titleId,
        episode_number: isSeries ? episodeNumber : isPromoMode ? 0 : 1,
        name: episodeName.trim() || null,
        video_url: videoPath,
        duration_seconds: videoMeta ? Math.round(videoMeta.duration) : undefined,
        video_width: videoMeta ? videoMeta.width : undefined,
        video_height: videoMeta ? videoMeta.height : undefined,
        status: "draft" as const,
      };
      const { data: row, error } = episodeRowId
        ? await supabase.from("episodes").update(payload).eq("id", episodeRowId).select().single()
        : await supabase.from("episodes").insert(payload).select().single();
      if (error || !row) throw new Error(error?.message ?? "save failed");

      if (oldPath && oldPath !== videoPath) {
        supabase.storage.from("videos").remove([oldPath]).catch(() => {});
        supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(oldPath)]).catch(() => {});
      }
      setEpisodeRowId(row.id);
      setExistingVideoUrl(videoPath);
      setExistingStatus(row.status);
      setPendingPath(null);
      setVideoFile(null);
      setVideoMeta(null);
      setVideoSnap(null);
      setJustSaved(true);
      setUnits((prev) => [...prev.filter((u) => u.id !== row.id), row as EpisodeRow].sort((a, b) => b.episode_number - a.episode_number));
      markSaved();

      if (isPromoMode) {
        const { data: promo, error: promoErr } = await supabase.rpc("set_promo_episode", { p_title_id: titleId, p_episode_id: row.id });
        if (promoErr || !promo?.ok) setError("video", promoErr?.message || promo?.error || t("upload.err.promoFailed"));
      }
    } catch (e) {
      setPendingPath(videoPath);
      setVideoSnap(null);
      setError("video", translateRuntimeError(e instanceof Error ? e.message : String(e), t));
    } finally {
      setBusy(null);
    }
  }

  async function cancelUpload() {
    await handleRef.current?.abort();
    handleRef.current = null;
    setVideoSnap(null);
  }

  function loadEpisode(d: EpisodeRow) {
    setEpisodeRowId(d.id);
    setEpisodeNumber(d.episode_number);
    setEpisodeName(d.name ?? "");
    setExistingVideoUrl(d.video_url);
    setExistingStatus(d.status);
    setVideoFile(null);
    setVideoMeta(null);
    setVideoIssue(null);
    setVideoWarning(null);
    setPendingPath(null);
    setJustSaved(false);
    setConfirmDeleteId(null);
    setError("video", null);
  }

  function startNextUnit() {
    setEpisodeRowId(null);
    setEpisodeNumber(units.reduce((m, e) => Math.max(m, e.episode_number), 0) + 1);
    setEpisodeName("");
    setExistingVideoUrl(null);
    setExistingStatus(null);
    setVideoFile(null);
    setVideoMeta(null);
    setVideoIssue(null);
    setVideoWarning(null);
    setPendingPath(null);
    setJustSaved(false);
    setError("video", null);
    setStep("video");
  }

  async function deleteEpisode(id: string) {
    setDeleting(true);
    setError("video", null);
    const target = units.find((u) => u.id === id);
    const { error } = await supabase.from("episodes").delete().eq("id", id);
    setDeleting(false);
    if (error) return setError("video", translateRuntimeError(error.message, t));
    if (target?.video_url) {
      supabase.storage.from("videos").remove([target.video_url]).catch(() => {});
      supabase.storage.from(STORYBOARD_BUCKET).remove([storyboardPath(target.video_url)]).catch(() => {});
    }
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setConfirmDeleteId(null);
    if (episodeRowId === id) startNextUnit();
  }

  async function rebuildPreview(d: EpisodeRow) {
    if (!d.video_url) return;
    setBackfill({ id: d.id, pct: 0 });
    try {
      const { data, error } = await supabase.storage.from("videos").createSignedUrl(d.video_url, 60 * 30);
      if (error || !data) throw error ?? new Error("no url");
      const blob = await generateStoryboard(data.signedUrl, { remote: true, onProgress: (pct) => setBackfill({ id: d.id, pct }) });
      await uploadStoryboard(supabase, d.video_url, blob);
      setBackfill({ id: d.id, pct: 1, msg: t("upload.previewReady") });
    } catch {
      setBackfill({ id: d.id, pct: 0, msg: t("upload.previewFailed") });
    }
  }

  // ===========================================================================
  // Step 5 — review & submit
  // ===========================================================================
  const hasVideo = units.some((u) => u.video_url);
  const checklist = [
    { ok: !!titleName.trim() && !!genre, label: t("upload.wiz.check.details"), step: "details" as StepId },
    { ok: !!posterUrl, label: t("upload.wiz.check.thumbnail"), step: "thumbnail" as StepId },
    { ok: hasVideo, label: t("upload.wiz.check.video"), step: "video" as StepId },
  ];
  const ready = checklist.every((c) => c.ok);
  const canSubmit = ["draft", "rejected", "withdrawn"].includes(titleStatus);

  async function finalize() {
    if (!titleId || !ready) return;
    setBusy("review");
    setError("review", null);
    try {
      const draftIds = units.filter((u) => u.status === "draft" && u.video_url).map((u) => u.id);
      if (draftIds.length) {
        const { error } = await supabase.from("episodes").update({ status: "processing" }).in("id", draftIds);
        if (error) throw new Error(error.message);
        setUnits((prev) => prev.map((u) => (draftIds.includes(u.id) ? { ...u, status: "processing" as const } : u)));
      }
      if (canSubmit) {
        const { data, error } = await supabase.rpc("submit_title_for_review", { p_title_id: titleId });
        if (error || !data?.ok) {
          throw new Error(
            data?.error === "no_video"
              ? t(cfg.unit === "part" ? "manage.err.noVideo.part" : "manage.err.noVideo.episode")
              : error?.message || data?.error || t("manage.err.submit")
          );
        }
        setTitleStatus("in_review");
      }
      markSaved();
      setSubmitted(canSubmit ? "submitted" : "finalized");
    } catch (e) {
      setError("review", translateRuntimeError(e instanceof Error ? e.message : String(e), t));
    } finally {
      setBusy(null);
    }
  }

  // ===========================================================================
  // Navigation
  // ===========================================================================
  const stepOrder: StepId[] = titleId ? ["details", "thumbnail", "video", "review"] : ["type", "details", "thumbnail", "video", "review"];
  const stepLabel: Record<StepId, string> = {
    type: t("upload.wiz.step.type"),
    details: t("upload.wiz.step.details"),
    thumbnail: t("upload.wiz.step.thumbnail"),
    video: t("upload.wiz.step.video"),
    review: t("upload.wiz.step.review"),
  };
  const isDone: Record<StepId, boolean> = {
    type: !!titleId,
    details: !!titleId && !!genre,
    thumbnail: !!posterUrl,
    video: hasVideo,
    review: !!submitted,
  };
  const indicator = stepOrder.map((id) => {
    const state: StepState = id === step ? "current" : isDone[id] ? "done" : "todo";
    const reachable = id === "type" ? !titleId : id === "details" ? true : !!titleId;
    return { id, label: stepLabel[id], state, clickable: id !== step && reachable && !uploading && busy === null };
  });

  function go(id: string) {
    setStep(id as StepId);
  }

  // ===========================================================================
  // Render
  // ===========================================================================
  if (loadingExisting) {
    return (
      <div className="px-4 pt-6" aria-busy="true">
        <div className="h-8 w-48 animate-pulse rounded-md bg-surface-raised" />
        <div className="mt-6 h-12 animate-pulse rounded-md bg-surface-raised" />
        <div className="mt-3 h-40 animate-pulse rounded-md bg-surface-raised" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-4 pt-6">
        <Notice tone="error">{loadError}</Notice>
        <Link href="/creator/dashboard" className="mt-4 inline-block text-[13px] font-medium text-pink">
          {t("upload.wiz.backToDashboard")}
        </Link>
      </div>
    );
  }

  const heading = isPromoMode
    ? `${t("upload.promoClip")}${titleName ? ` · ${titleName}` : ""}`
    : titleId
      ? titleName || t("upload.newTitle")
      : t("upload.newTitle");

  return (
    <div className="fade-in px-4 pb-16 pt-5">
      <div className="flex items-center gap-3">
        <Link
          href={titleId ? `/creator/title/${titleId}` : "/creator/dashboard"}
          aria-label={t("common.back")}
          className="text-text"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-text">{heading}</h1>
          {titleId && <p className="text-[12px] text-muted">{t(cfg.labelKey)}</p>}
        </div>
        {savedAt && (
          <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted" aria-live="polite">
            <CheckCircle2 size={13} className="text-emerald-500" />
            {t("upload.wiz.draftSaved", { time: savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
          </span>
        )}
      </div>

      {!submitted && (
        <div className="mt-5">
          <StepIndicator steps={indicator} onSelect={go} />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {submitted ? (
          <SubmittedPanel
            kind={submitted}
            onAnother={() => {
              window.location.assign("/creator/upload");
            }}
            viewHref={`/creator/title/${titleId}`}
            t={t}
          />
        ) : step === "type" ? (
          <>
            {restoredDraft && <Notice tone="info">{t("upload.wiz.restored")}</Notice>}
            <div>
              <h2 className="text-[16px] font-semibold text-text">{t("upload.wiz.type.heading")}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{t("upload.wiz.type.sub")}</p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {CONTENT_TYPES.map((ct) => {
                const Icon = TYPE_ICON[ct.value];
                const active = contentType === ct.value;
                return (
                  <button
                    key={ct.value}
                    type="button"
                    onClick={() => setContentType(ct.value)}
                    aria-pressed={active}
                    className={clsx(
                      "flex items-start gap-3 rounded-lg border p-3.5 text-left transition-colors",
                      active ? "border-pink bg-pink/10" : "border-border bg-surface hover:border-pink/40"
                    )}
                  >
                    <span className={clsx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md", active ? "bg-pink text-white" : "bg-surface-raised text-muted")}>
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className={clsx("block text-[14px] font-semibold", active ? "text-pink" : "text-text")}>{t(ct.labelKey)}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted">{t(ct.descKey)}</span>
                      <span className="mt-1.5 block text-[11px] text-muted">
                        {t("upload.wiz.type.limits", {
                          max: ct.maxDurationLabel,
                          shape: t(ct.orientation === "portrait" ? "upload.wiz.shape.portrait" : "upload.wiz.shape.both"),
                        })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Button size="lg" className="w-full" onClick={() => setStep("details")}>
              {t("upload.wiz.continue")} <ArrowRight size={16} />
            </Button>
          </>
        ) : step === "details" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveDetails();
            }}
            className="space-y-3"
          >
            <input
              required
              maxLength={120}
              placeholder={t("upload.titlePlaceholder")}
              aria-label={t("upload.titlePlaceholder")}
              value={titleName}
              onChange={(e) => setTitleName(e.target.value)}
              className={inputCls}
            />
            {cfg.creditLabelKey && (
              <input
                maxLength={80}
                placeholder={t(cfg.creditLabelKey)}
                aria-label={t(cfg.creditLabelKey)}
                value={creditName}
                onChange={(e) => setCreditName(e.target.value)}
                className={inputCls}
              />
            )}
            {!cfg.fixedCategory && (
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                aria-label={t("library.category")}
                className={inputCls}
              >
                {CATEGORIES.filter((c) => c.value !== "music" && c.value !== "commercial").map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.labelKey)}
                  </option>
                ))}
              </select>
            )}
            <select
              required
              value={genre}
              onChange={(e) => {
                setGenre(e.target.value);
                setExtraTags((prev) => prev.filter((x) => x !== e.target.value));
              }}
              aria-label={t("upload.genre")}
              className={inputCls}
            >
              <option value="" disabled>
                {t("upload.genre")}
              </option>
              {genreOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            {genre && <TagPicker options={genreOptions} primary={genre} selected={extraTags} onChange={setExtraTags} />}
            <textarea
              rows={4}
              maxLength={1000}
              placeholder={t("upload.wiz.synopsisPlaceholder")}
              aria-label={t("upload.wiz.synopsisPlaceholder")}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text placeholder:text-muted focus:border-pink/60 focus:outline-none"
            />
            <div>
              <p className="mb-1.5 text-[12px] text-muted">{t("upload.wiz.rating")}</p>
              <div className="flex flex-wrap gap-2">
                {CONTENT_RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setContentRating(r.value)}
                    aria-pressed={contentRating === r.value}
                    className={clsx(
                      "h-9 rounded-full border px-4 text-[13px] font-medium transition-colors",
                      contentRating === r.value ? "border-pink bg-pink/10 text-pink" : "border-border bg-surface text-muted hover:text-text"
                    )}
                  >
                    {t(r.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            {errors.details && <Notice tone="error">{errors.details}</Notice>}
            <div className="flex gap-2 pt-1">
              {!titleId && (
                <Button type="button" variant="secondary" size="lg" onClick={() => setStep("type")}>
                  <ArrowLeft size={16} />
                </Button>
              )}
              <Button type="submit" size="lg" className="flex-1" disabled={busy === "details"}>
                {busy === "details" ? t("upload.saving") : t("upload.wiz.saveContinue")}
                {busy !== "details" && <ArrowRight size={16} />}
              </Button>
            </div>
          </form>
        ) : step === "thumbnail" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-text">{t("upload.wiz.thumb.heading")}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{t("upload.wiz.thumb.sub")}</p>
            </div>
            <div className="flex items-start gap-4">
              <div className="relative aspect-[9/16] w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-raised">
                {posterPreview || posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={posterPreview ?? posterUrl ?? ""} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    <ImagePlus size={26} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-text transition-colors hover:border-pink/40">
                  <ImagePlus size={16} />
                  <span className="truncate">
                    {posterFile ? posterFile.name : posterUrl ? t("manage.replacePoster") : t("upload.wiz.thumb.choose")}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={busy === "thumbnail"}
                    onChange={(e) => pickPoster(e.target.files?.[0] ?? null)}
                  />
                </label>
                <p className="text-[11.5px] leading-snug text-muted">{t("upload.wiz.thumb.rules")}</p>
              </div>
            </div>
            {posterProgress !== null && (
              <div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(posterProgress * 100)}
                  className="h-2 overflow-hidden rounded-full bg-surface-raised"
                >
                  <div className="h-full rounded-full bg-gradient-to-r from-pink to-crimson transition-[width] duration-150" style={{ width: `${Math.round(posterProgress * 100)}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-muted">{t("upload.wiz.thumb.uploading", { pct: Math.round(posterProgress * 100) })}</p>
              </div>
            )}
            {errors.thumbnail && <Notice tone="error">{errors.thumbnail}</Notice>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="lg" onClick={() => setStep("details")} disabled={busy === "thumbnail"}>
                <ArrowLeft size={16} />
              </Button>
              <Button size="lg" className="flex-1" onClick={() => void savePoster()} disabled={busy === "thumbnail"}>
                {busy === "thumbnail" ? t("upload.saving") : posterFile ? t("upload.wiz.thumb.uploadContinue") : t("upload.wiz.continue")}
                {busy !== "thumbnail" && <ArrowRight size={16} />}
              </Button>
            </div>
            {!posterFile && !posterUrl && (
              <button type="button" onClick={() => setStep("video")} className="w-full text-center text-[12.5px] text-muted underline-offset-2 hover:text-text hover:underline">
                {t("upload.wiz.skipForNow")}
              </button>
            )}
          </div>
        ) : step === "video" ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-text">
                {isPromoMode ? t("upload.promoClip") : t(isSeries ? "upload.wiz.video.heading.episode" : "upload.wiz.video.heading.part")}
              </h2>
              <p className="mt-0.5 text-[13px] text-muted">
                {t("upload.wiz.video.sub", {
                  max: cfg.maxDurationLabel,
                  shape: t(cfg.orientation === "portrait" ? "upload.wiz.shape.portrait" : "upload.wiz.shape.both"),
                })}
              </p>
            </div>

            {isSeries && units.length > 0 && (
              <div className="space-y-2">
                {units.map((d) => (
                  <div key={d.id} className={clsx("rounded-md border px-4 py-2 text-left text-[13px]", episodeRowId === d.id ? "border-pink bg-pink/5" : "border-border bg-surface")}>
                    <button type="button" onClick={() => loadEpisode(d)} className="flex w-full items-center justify-between">
                      <span className="text-text">
                        {d.episode_number === 0 ? t("upload.promoClip") : t("common.episodeN", { n: d.episode_number })}
                        {d.name ? ` · ${d.name}` : ""}
                      </span>
                      <span className="text-[11px] text-muted">{STATUS_KEY[d.status] ? t(STATUS_KEY[d.status]) : d.status}</span>
                    </button>
                    {episodeRowId === d.id && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        {d.video_url && (
                          <div>
                            <button
                              type="button"
                              disabled={backfill?.id === d.id && !backfill.msg}
                              onClick={() => void rebuildPreview(d)}
                              className="text-[12px] font-medium text-pink hover:text-pink/75 disabled:opacity-50"
                            >
                              {backfill?.id === d.id && !backfill.msg ? t("upload.buildingPct", { pct: Math.round(backfill.pct * 100) }) : t("upload.buildPreview")}
                            </button>
                            {backfill?.id === d.id && backfill.msg && <p className="mt-1 text-[11px] text-muted">{backfill.msg}</p>}
                          </div>
                        )}
                        {confirmDeleteId === d.id ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-crimson">{t("upload.deleteConfirm.episode")}</span>
                            <div className="flex gap-2">
                              <button type="button" disabled={deleting} onClick={() => void deleteEpisode(d.id)} className="rounded-md bg-crimson px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
                                {deleting ? t("upload.deleting") : t("upload.confirm")}
                              </button>
                              <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted">
                                {t("common.cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setConfirmDeleteId(d.id)} className="flex items-center gap-1 text-[12px] font-medium text-crimson">
                            <Trash2 size={13} /> {t("upload.deleteUnit.episode")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isSeries && !isPromoMode && (
              <div className="grid grid-cols-[88px_1fr] gap-2">
                <input
                  type="number"
                  min={1}
                  value={episodeNumber}
                  onChange={(e) => setEpisodeNumber(Number(e.target.value))}
                  aria-label={t("upload.unitNumber.episode")}
                  disabled={!!episodeRowId}
                  className={clsx(inputCls, "px-3 disabled:opacity-60")}
                />
                <input
                  placeholder={t("upload.unitName.episode")}
                  aria-label={t("upload.unitName.episode")}
                  value={episodeName}
                  onChange={(e) => setEpisodeName(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            {/* Existing video (saved) */}
            {existingVideoUrl && !videoFile && !videoSnap && (
              <Notice tone="success">
                <span className="font-medium">{t("upload.wiz.video.saved")}</span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  {existingStatus ? (STATUS_KEY[existingStatus] ? t(STATUS_KEY[existingStatus]) : existingStatus) : ""}
                </span>
              </Notice>
            )}

            {/* Picker */}
            {!videoSnap && (
              <label
                className={clsx(
                  "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors",
                  videoFile ? "border-pink/50 bg-pink/5" : "border-border bg-surface hover:border-pink/40"
                )}
              >
                <CloudUpload size={26} className={videoFile ? "text-pink" : "text-muted"} />
                <span className="text-[14px] font-medium text-text">
                  {videoFile ? videoFile.name : existingVideoUrl ? t("upload.wiz.video.replace") : t("upload.wiz.video.choose")}
                </span>
                <span className="text-[12px] text-muted">{t("upload.wiz.video.formats")}</span>
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
                  className="hidden"
                  disabled={busy !== null || checkingVideo}
                  onChange={(e) => {
                    void pickVideo(e.target.files?.[0] ?? null);
                    e.target.value = ""; // lets the same file be picked again after a failure
                  }}
                />
              </label>
            )}

            {checkingVideo && <Notice tone="info">{t("upload.wiz.video.checking")}</Notice>}
            {videoFile && videoMeta && !videoIssue && !videoSnap && (
              <div className="flex flex-wrap gap-2 text-[12px] text-muted">
                <span className="rounded-full border border-border bg-surface px-2.5 py-1">{formatDuration(videoMeta.duration)}</span>
                <span className="rounded-full border border-border bg-surface px-2.5 py-1">
                  {videoMeta.width}×{videoMeta.height}
                </span>
                <span className="rounded-full border border-border bg-surface px-2.5 py-1">{formatBytes(videoFile.size)}</span>
              </div>
            )}
            {videoIssue && <Notice tone="error">{videoIssue}</Notice>}
            {videoWarning && !videoIssue && <Notice tone="warning">{videoWarning}</Notice>}

            {videoSnap && videoFile && (
              <UploadProgressCard
                snapshot={videoSnap}
                fileName={videoFile.name}
                errorText={videoSnap.error ? uploadErrorMessage(videoSnap.error, t) : null}
                onPause={() => handleRef.current?.pause()}
                onResume={() => handleRef.current?.resume()}
                onRetry={() => handleRef.current?.retry()}
                onCancel={() => void cancelUpload()}
              />
            )}
            {buildingPreview && <Notice tone="info">{t("upload.buildingPreview")}</Notice>}

            {errors.video && (
              <Notice
                tone="error"
                action={
                  pendingPath ? (
                    <button type="button" onClick={() => void persistEpisode(pendingPath)} className="shrink-0 rounded-md bg-crimson px-3 py-1.5 text-[12px] font-semibold text-white">
                      {t("upload.wiz.retrySave")}
                    </button>
                  ) : undefined
                }
              >
                {errors.video}
                {pendingPath && <span className="mt-1 block text-[12px] opacity-80">{t("upload.wiz.uploadKept")}</span>}
              </Notice>
            )}

            {justSaved && !errors.video && <Notice tone="success">{t("upload.wiz.video.savedDraft")}</Notice>}

            <div className="flex flex-col gap-2 pt-1">
              {videoFile && !videoSnap && (
                <Button size="lg" className="w-full" onClick={() => void startUpload()} disabled={!!videoIssue || checkingVideo || busy !== null}>
                  <CloudUpload size={16} /> {t("upload.wiz.video.upload")}
                </Button>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="lg" onClick={() => setStep("thumbnail")} disabled={uploading || busy !== null}>
                  <ArrowLeft size={16} />
                </Button>
                <Button
                  size="lg"
                  variant={videoFile || uploading ? "secondary" : "primary"}
                  className="flex-1"
                  onClick={() => setStep("review")}
                  disabled={uploading || busy !== null || !!videoFile}
                >
                  {t("upload.wiz.toReview")} <ArrowRight size={16} />
                </Button>
              </div>
              {isSeries && !isPromoMode && (justSaved || hasVideo) && !videoFile && !uploading && (
                <button type="button" onClick={startNextUnit} className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-pink">
                  <Plus size={14} /> {t("upload.addAnother.episode")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-[16px] font-semibold text-text">{t("upload.wiz.review.heading")}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{t(canSubmit ? "upload.wiz.review.subSubmit" : "upload.wiz.review.subFinalize")}</p>
            </div>

            <div className="flex gap-3 rounded-lg border border-border bg-surface p-3.5">
              <div className="relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-md bg-surface-raised">
                {posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={posterUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-text">{titleName}</p>
                {creditName && <p className="truncate text-[12.5px] text-muted">{creditName}</p>}
                <p className="mt-1 text-[12px] text-muted">
                  {t(cfg.labelKey)} · {genre || "—"} · {contentRating}
                </p>
                {synopsis && <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-text/80">{synopsis}</p>}
                <p className="mt-1.5 text-[12px] text-muted">
                  {units.filter((u) => u.video_url).length}{" "}
                  {t(isSeries ? "upload.wiz.review.episodes" : "upload.wiz.review.videos", { n: units.filter((u) => u.video_url).length })}
                </p>
              </div>
            </div>

            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex items-center gap-2.5 text-[13.5px] text-text">
                    {c.ok ? <Check size={16} className="text-emerald-500" /> : <CircleDashed size={16} className="text-gold" />}
                    {c.label}
                  </span>
                  {!c.ok && (
                    <button type="button" onClick={() => setStep(c.step)} className="text-[12.5px] font-medium text-pink">
                      {t("upload.wiz.review.fix")}
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {errors.review && <Notice tone="error">{errors.review}</Notice>}

            <div className="flex flex-col gap-2">
              <Button size="lg" className="w-full" disabled={!ready || busy === "review"} onClick={() => void finalize()}>
                {busy === "review" ? t("upload.saving") : canSubmit ? t("upload.wiz.review.submit") : t("upload.wiz.review.finalize")}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="lg" onClick={() => setStep("video")} disabled={busy === "review"}>
                  <ArrowLeft size={16} />
                </Button>
                <Button type="button" variant="secondary" size="lg" className="flex-1" disabled={busy === "review"} onClick={() => router.push("/creator/dashboard")}>
                  {t("upload.wiz.review.saveExit")}
                </Button>
              </div>
              {isSeries && !isPromoMode && (
                <button type="button" onClick={startNextUnit} className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-pink">
                  <Plus size={14} /> {t("upload.addAnother.episode")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmittedPanel({
  kind,
  onAnother,
  viewHref,
  t,
}: {
  kind: "submitted" | "finalized";
  onAnother: () => void;
  viewHref: string;
  t: (k: MessageKey, v?: Record<string, string | number>) => string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
        <CheckCircle2 size={30} />
      </span>
      <h2 className="mt-4 font-display text-[20px] font-semibold text-text">
        {t(kind === "submitted" ? "upload.wiz.done.submittedTitle" : "upload.wiz.done.finalizedTitle")}
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-snug text-muted">
        {t(kind === "submitted" ? "upload.wiz.done.submittedBody" : "upload.wiz.done.finalizedBody")}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Link href={viewHref}>
          <Button size="lg" className="w-full">
            {t("upload.wiz.done.view")}
          </Button>
        </Link>
        <Button size="lg" variant="secondary" className="w-full" onClick={onAnother}>
          {t("upload.wiz.done.another")}
        </Button>
      </div>
    </div>
  );
}
