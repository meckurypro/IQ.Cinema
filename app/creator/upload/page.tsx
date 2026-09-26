// app/creator/upload/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function UploadPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<"title" | "episode">("title");
  const [titleId, setTitleId] = useState<string | null>(null);

  // title fields
  const [name, setName] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [contentType, setContentType] = useState<"movie" | "series">("series");
  const [posterFile, setPosterFile] = useState<File | null>(null);

  // episode fields
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeName, setEpisodeName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateTitle(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    let posterUrl: string | null = null;
    if (posterFile) {
      const path = `${user.id}/${crypto.randomUUID()}-${posterFile.name}`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, posterFile);
      if (upErr) {
        setError(upErr.message);
        setSaving(false);
        return;
      }
      const { data } = supabase.storage.from("posters").getPublicUrl(path);
      posterUrl = data.publicUrl;
    }

    const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;

    const { data: title, error: insertError } = await supabase
      .from("titles")
      .insert({
        creator_id: user.id,
        title: name,
        slug,
        synopsis,
        content_type: contentType,
        poster_url: posterUrl,
        status: "draft",
      })
      .select()
      .single();

    setSaving(false);

    if (insertError || !title) {
      setError(insertError?.message ?? "Could not create title");
      return;
    }

    setTitleId(title.id);
    setStep("episode");
  }

  async function handleUploadEpisode(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !titleId || !videoFile) return;
    setSaving(true);
    setError(null);

    const videoPath = `${user.id}/${titleId}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage.from("videos").upload(videoPath, videoFile);
    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }

    const { error: epErr } = await supabase.from("episodes").insert({
      title_id: titleId,
      episode_number: episodeNumber,
      name: episodeName || null,
      video_url: videoPath,
      status: "processing", // flips to 'published' once transcoding/review completes
    });

    setSaving(false);

    if (epErr) {
      setError(epErr.message);
      return;
    }

    router.push("/creator/dashboard");
  }

  return (
    <div className="fade-in px-4 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link href="/creator/dashboard" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-text">
          {step === "title" ? "New title" : "Add episode"}
        </h1>
      </div>

      {step === "title" ? (
        <form onSubmit={handleCreateTitle} className="mt-6 space-y-3">
          <div className="flex gap-2">
            {(["series", "movie"] as const).map((ct) => (
              <button
                type="button"
                key={ct}
                onClick={() => setContentType(ct)}
                className={`h-10 flex-1 rounded-md border text-[13px] font-medium capitalize transition-colors ${
                  contentType === ct
                    ? "border-pink bg-pink/10 text-pink"
                    : "border-border bg-surface text-muted"
                }`}
              >
                {ct}
              </button>
            ))}
          </div>
          <input
            required
            placeholder="Title"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <Button type="submit" className="w-full" size="lg" disabled={saving}>
            {saving ? "Creating…" : "Continue"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleUploadEpisode} className="mt-6 space-y-3">
          <input
            type="number"
            required
            min={1}
            placeholder="Episode number"
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(Number(e.target.value))}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
          />
          <input
            placeholder="Episode name (optional)"
            value={episodeName}
            onChange={(e) => setEpisodeName(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-[14px] text-text placeholder:text-muted"
          />
          <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-surface px-4 text-[13px] text-muted">
            {videoFile ? videoFile.name : "Video file (MP4, 9:16)"}
            <Upload size={15} />
            <input
              type="file"
              accept="video/mp4,video/quicktime"
              required
              className="hidden"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {error && <p className="text-[13px] text-crimson">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={saving}>
            {saving ? "Uploading…" : "Upload episode"}
          </Button>
          <p className="text-center text-[12px] text-muted">
            Episodes go through review before publishing.
          </p>
        </form>
      )}
    </div>
  );
}
