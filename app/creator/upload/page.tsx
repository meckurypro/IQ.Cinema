// app/creator/upload/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Upload, Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { uploadVideoResumable } from "@/lib/supabase/resumableUpload";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";

// ---------------------------------------------------------------------------
// Content-type config: duration cap (seconds) + what an upload "unit" is called
// ---------------------------------------------------------------------------
type ContentType = "short_episode" | "full_episode" | "one_part_film";


const CONTENT_TYPES: {
  value: ContentType;
  label: string;
  unitLabel: string; // "Episode" vs "Part"
  maxDurationSeconds: number;
  maxDurationLabel: string;
}[] = [
  {
    value: "short_episode",
    label: "Short episodes",
    unitLabel: "Episode",
    maxDurationSeconds: 160, // 2:40
    maxDurationLabel: "2m 40s",
  },
  {
    value: "full_episode",
    label: "Full episodes",
    unitLabel: "Episode",
    maxDurationSeconds: 1200, // 20:00
    maxDurationLabel: "20m",
  },
  {
    value: "one_part_film",
    label: "One-part film",
    unitLabel: "Part",
    maxDurationSeconds: 7200, // 120:00
    maxDurationLabel: "120m",
  },
];

function getConfig(ct: ContentType) {
  return CONTENT_TYPES.find((c) => c.value === ct)!;
}

function slugify(s: string) {
  return s
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
function readVideoMetadata(file: File): Promise<{ duration: number; width: number; height: number }> {
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
      reject(new Error("Couldn't read that video file. Try a different file."));
    };
    video.src = url;
  });
}

const ASPECT_TARGET = 9 / 16; // 0.5625, portrait
const ASPECT_TOLERANCE = 0.02;

function validateVideo(
  meta: { duration: number; width: number; height: number },
  contentType: ContentType
): string | null {
  const config = getConfig(contentType);
  if (meta.duration > config.maxDurationSeconds + 1) {
    return `${config.unitLabel}s for "${config.label}" can't be longer than ${config.maxDurationLabel} (this file is ${formatSeconds(
      meta.duration
    )}).`;
  }
  if (meta.height > 0) {
    const ratio = meta.width / meta.height;
    if (Math.abs(ratio - ASPECT_TARGET) > ASPECT_TOLERANCE) {
      return `Video must be 9:16 (portrait). This file is ${meta.width}x${meta.height}.`;
    }
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  processing: "Processing",
  published: "Published",
  suspended: "Suspended",
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
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const existingTitleId = searchParams.get("titleId");
  const requestedEpisodeId = searchParams.get("episodeId");

  const [step, setStep] = useState<"title" | "episode">(existingTitleId ? "episode" : "title");
  const [titleId, setTitleId] = useState<string | null>(existingTitleId);
  const [contentType, setContentType] = useState<ContentType>("full_episode");
  const [titleName, setTitleName] = useState("");

  // title fields (step 1 only)
  const [synopsis, setSynopsis] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [genre, setGenre] = useState("");
  const [contentRating, setContentRating] = useState<ContentRating>("13+");

  // episode/part fields (step 2)
  const [episodeRowId, setEpisodeRowId] = useState<string | null>(null); // set once a row exists
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeName, setEpisodeName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<EpisodeRow["status"] | null>(null);

  const [units, setUnits] = useState<EpisodeRow[]>([]);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<"draft" | "submit" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const config = getConfig(contentType);

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

    const slug = `${slugify(titleName)}-${crypto.randomUUID().slice(0, 6)}`;

    const { data: title, error: insertError } = await supabase
      .from("titles")
      .insert({
        creator_id: user.id,
        title: titleName,
        slug,
        synopsis,
        content_type: contentType,
        poster_url: posterUrl,
        genre: genre || null,
        content_rating: contentRating,
        status: "draft",
      })
      .select()
      .single();

    setSaving(null);

    if (insertError || !title) {
      setError(insertError?.message ?? "Could not create title");
      return;
    }

    setTitleId(title.id);
    setStep("episode");
  }

  async function handleSelectVideo(file: File | null) {
    setVideoFile(file);
    setVideoMeta(null);
    setVideoError(null);
    if (!file) return;

    setCheckingVideo(true);
    try {
      const meta = await readVideoMetadata(file);
      setVideoMeta(meta);
      const err = validateVideo(meta, contentType);
      setVideoError(err);
    } catch (err: any) {
      setVideoError(err.message ?? "Couldn't read that video file.");
    } finally {
      setCheckingVideo(false);
    }
  }

  async function handleSaveEpisode(targetStatus: "draft" | "processing") {
    if (!user || !titleId) return;
    if (targetStatus === "processing" && !videoFile && !existingVideoUrl) {
      setError(`Add a video before finalizing this ${config.unitLabel.toLowerCase()}.`);
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
      setError("Still checking that video — one moment.");
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
        setError(err.message ?? "Upload failed. Check your connection and try again.");
        setSaving(null);
        setUploadProgress(null);
        return;
      }
      setUploadProgress(null);
      videoPath = path;
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
          aria-label="Back"
          className="text-text"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">
          {step === "title" ? "New title" : `Add ${config.unitLabel.toLowerCase()}${titleName ? ` · ${titleName}` : ""}`}
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
                <div>{ct.label}</div>
                <div className="text-[10px] opacity-70">max {ct.maxDurationLabel}/{ct.unitLabel.toLowerCase()}</div>
              </button>
            ))}
          </div>
          <input
            required
            placeholder="Title"
            value={titleName}
            onChange={(e) => setTitleName(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
          />
          <select
            required
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text"
          >
            <option value="" disabled>
              Genre
            </option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            required
            value={contentRating}
            onChange={(e) => setContentRating(e.target.value as ContentRating)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text"
          >
            {CONTENT_RATINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Synopsis"
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-4 py-3 text-[14px] text-text placeholder:text-muted"
          />
          <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-surface px-4 text-[13px] text-muted">
            {posterFile ? posterFile.name : "Poster image (3:4)"}
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
            {saving ? "Creating…" : "Continue"}
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
                {config.unitLabel}s in this project
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
                      {config.unitLabel} {d.episode_number}
                      {d.name ? ` · ${d.name}` : ""}
                    </span>
                    <span className="text-[11px] text-muted">
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </button>
                  {episodeRowId === d.id && (
                    <div className="mt-2 border-t border-border pt-2">
                      {confirmDeleteId === d.id ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-crimson">
                            Delete this {config.unitLabel.toLowerCase()} and its video?
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => handleDeleteEpisode(d.id)}
                              className="rounded-md bg-crimson px-2.5 py-1 text-[11px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.97] active:brightness-95 disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {deleting ? "Deleting…" : "Confirm"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted transition-colors duration-150 hover:bg-border/40 active:scale-[0.97]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(d.id)}
                          className="flex items-center gap-1 text-[12px] font-medium text-crimson transition-colors duration-150 hover:text-crimson/75"
                        >
                          <Trash2 size={13} /> Delete {config.unitLabel.toLowerCase()}
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
            <input
              type="number"
              required
              min={1}
              placeholder={`${config.unitLabel} number`}
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(Number(e.target.value))}
              className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
            />
            <input
              placeholder={`${config.unitLabel} name (optional)`}
              value={episodeName}
              onChange={(e) => setEpisodeName(e.target.value)}
              className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
            />
            <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-surface px-4 text-[13px] text-muted">
              {videoFile
                ? videoFile.name
                : existingVideoUrl
                ? "Video attached — choose a file to replace it"
                : "Video file (MP4/MOV, 9:16)"}
              <Upload size={15} />
              <input
                type="file"
                accept="video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => handleSelectVideo(e.target.files?.[0] ?? null)}
              />
            </label>
            {checkingVideo && <p className="text-[12px] text-muted">Checking video…</p>}
            {videoMeta && !videoError && (
              <p className="text-[12px] text-muted">
                {formatSeconds(videoMeta.duration)} · {videoMeta.width}x{videoMeta.height} ✓
                {existingVideoUrl && videoFile ? " — will replace the current video" : ""}
              </p>
            )}
            {videoError && <p className="text-[13px] text-crimson">{videoError}</p>}
            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-pink transition-[width] duration-200"
                    style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted">
                  Uploading… {Math.round(uploadProgress * 100)}% — you can lock your screen, just don't close the app.
                </p>
              </div>
            )}
            <p className="text-[11px] text-muted">
              {config.label}: max {config.maxDurationLabel} per {config.unitLabel.toLowerCase()}, 9:16 portrait only.
            </p>

            {error && <p className="text-[13px] text-crimson">{error}</p>}

            {justSaved && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-[13px] text-emerald-500">
                <Check size={15} />
                {justSaved === "draft" ? "Saved as draft." : "Finalized — processing now."}
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
                    ? `Uploading ${Math.round(uploadProgress * 100)}%`
                    : "Saving…"
                  : "Save as draft"}
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={videoBusy || !!videoError}>
                {saving === "submit"
                  ? uploadProgress !== null
                    ? `Uploading ${Math.round(uploadProgress * 100)}%`
                    : "Finalizing…"
                  : "Finalize"}
              </Button>
            </div>

            {justSaved && (
              <Button
                type="button"
                onClick={resetForNextUnit}
                variant="ghost"
                className="w-full border border-dashed border-border text-[13px] text-muted hover:border-pink/40 hover:text-text"
              >
                <Plus size={14} /> Add another {config.unitLabel.toLowerCase()}
              </Button>
            )}

            <p className="text-center text-[12px] text-muted">
              A video must finish uploading before it can be saved as a draft or finalized. Finalizing
              starts automatic processing for this {config.unitLabel.toLowerCase()} — the project itself
              only goes live once you submit it for admin review from its management page.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
