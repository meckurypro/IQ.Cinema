// app/creator/upload/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Upload, Check, Plus } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

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

  const [step, setStep] = useState<"title" | "episode">(existingTitleId ? "episode" : "title");
  const [titleId, setTitleId] = useState<string | null>(existingTitleId);
  const [contentType, setContentType] = useState<ContentType>("full_episode");
  const [titleName, setTitleName] = useState("");

  // title fields (step 1 only)
  const [synopsis, setSynopsis] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);

  // episode/part fields (step 2)
  const [episodeRowId, setEpisodeRowId] = useState<string | null>(null); // set once a draft row exists
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeName, setEpisodeName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<EpisodeRow[]>([]);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<"draft" | "submit" | null>(null);

  const config = getConfig(contentType);

  // When adding to an existing title: load its content_type/name, next episode number, and any drafts.
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
        setDrafts(eps.filter((e) => e.status === "draft") as EpisodeRow[]);
        const maxNumber = eps.reduce((m, e) => Math.max(m, e.episode_number), 0);
        setEpisodeNumber(maxNumber + 1);
      }
    })();
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
      setError(`Add a video before submitting this ${config.unitLabel.toLowerCase()} for review.`);
      return;
    }
    if (videoFile && videoError) {
      setError(videoError);
      return;
    }

    setSaving(targetStatus === "draft" ? "draft" : "submit");
    setError(null);
    setJustSaved(null);

    let videoPath: string | null = existingVideoUrl;
    if (videoFile) {
      const path = `${user.id}/${titleId}/${crypto.randomUUID()}.mp4`;
      const { error: upErr } = await supabase.storage.from("videos").upload(path, videoFile);
      if (upErr) {
        setError(upErr.message);
        setSaving(null);
        return;
      }
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
      status: targetStatus, // "draft" while saving progress, "processing" once submitted for review
    };

    const { data: row, error: epErr } = episodeRowId
      ? await supabase.from("episodes").update(payload).eq("id", episodeRowId).select().single()
      : await supabase.from("episodes").insert(payload).select().single();

    setSaving(null);

    if (epErr) {
      setError(epErr.message);
      return;
    }

    setEpisodeRowId(row.id);
    setExistingVideoUrl(videoPath);
    setJustSaved(targetStatus === "draft" ? "draft" : "submit");
  }

  function resetForNextUnit() {
    setEpisodeRowId(null);
    setEpisodeNumber((n) => n + 1);
    setEpisodeName("");
    setVideoFile(null);
    setVideoMeta(null);
    setVideoError(null);
    setExistingVideoUrl(null);
    setJustSaved(null);
    setError(null);
  }

  function loadDraft(d: EpisodeRow) {
    setEpisodeRowId(d.id);
    setEpisodeNumber(d.episode_number);
    setEpisodeName(d.name ?? "");
    setExistingVideoUrl(d.video_url);
    setVideoFile(null);
    setVideoMeta(null);
    setVideoError(null);
    setJustSaved(null);
    setError(null);
  }

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/creator/dashboard" aria-label="Back" className="text-text">
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
                className={`h-14 flex-1 rounded-md border px-2 text-[12px] font-medium transition-colors ${
                  contentType === ct.value
                    ? "border-pink bg-pink/10 text-pink"
                    : "border-border bg-surface text-muted"
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
          {drafts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
                Drafts to finish
              </p>
              {drafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => loadDraft(d)}
                  className="flex w-full items-center justify-between rounded-md border border-border bg-surface px-4 py-2 text-left text-[13px] text-text"
                >
                  <span>
                    {config.unitLabel} {d.episode_number}
                    {d.name ? ` · ${d.name}` : ""}
                  </span>
                  <span className="text-[11px] text-muted">
                    {d.video_url ? "video attached" : "no video yet"}
                  </span>
                </button>
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
              {videoFile ? videoFile.name : existingVideoUrl ? "Video attached — choose to replace" : "Video file (MP4/MOV, 9:16)"}
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
              </p>
            )}
            {videoError && <p className="text-[13px] text-crimson">{videoError}</p>}
            <p className="text-[11px] text-muted">
              {config.label}: max {config.maxDurationLabel} per {config.unitLabel.toLowerCase()}, 9:16 portrait only.
            </p>

            {error && <p className="text-[13px] text-crimson">{error}</p>}

            {justSaved && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-4 py-2 text-[13px] text-emerald-500">
                <Check size={15} />
                {justSaved === "draft" ? "Saved as draft." : "Submitted for review."}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                size="lg"
                disabled={saving !== null || !!videoError}
                onClick={() => handleSaveEpisode("draft")}
              >
                {saving === "draft" ? "Saving…" : "Save as draft"}
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={saving !== null || !!videoError}>
                {saving === "submit" ? "Submitting…" : "Submit for review"}
              </Button>
            </div>

            {justSaved && (
              <button
                type="button"
                onClick={resetForNextUnit}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-[13px] text-muted"
              >
                <Plus size={14} /> Add another {config.unitLabel.toLowerCase()}
              </button>
            )}

            <p className="text-center text-[12px] text-muted">
              {config.unitLabel}s go through review before publishing.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
