// app/creator/title/[id]/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CONTENT_RATINGS, type ContentRating } from "@/lib/contentRatings";
import { TagPicker } from "@/components/creator/TagPicker";
import clsx from "clsx";

type TitleStatus =
  | "draft"
  | "in_review"
  | "published"
  | "coming_soon"
  | "suspended"
  | "rejected"
  | "withdrawn";

const STATUS_META: Record<TitleStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-surface-raised text-muted" },
  in_review: { label: "In review", className: "bg-gold-soft text-gold" },
  published: { label: "Live", className: "bg-emerald-600/15 text-emerald-500" },
  coming_soon: { label: "Coming soon", className: "bg-gold-soft text-gold" },
  suspended: { label: "Suspended", className: "bg-crimson-soft text-crimson" },
  rejected: { label: "Rejected", className: "bg-crimson-soft text-crimson" },
  withdrawn: { label: "Withdrawn", className: "bg-surface-raised text-muted" },
};

type TitleRow = {
  id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  genre: string | null;
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
};

const UNIT_LABEL: Record<string, string> = {
  short_episode: "Episode",
  full_episode: "Episode",
  one_part_film: "Part",
};

export default function ManageTitlePage() {
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
  const [editContentRating, setEditContentRating] = useState<ContentRating>("13+");
  const [editPosterFile, setEditPosterFile] = useState<File | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  async function load() {
    const [{ data: t }, { data: eps }, { data: tagRows }] = await Promise.all([
      supabase
        .from("titles")
        .select(
          "id, title, slug, synopsis, genre, content_rating, poster_url, content_type, status, creator_id, admin_review_note, reviewed_at, review_ignored_at, total_unique_views"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("episodes")
        .select("id, episode_number, name, status, video_url")
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
        content_rating: editContentRating,
        poster_url: posterUrl,
      })
      .eq("id", title.id);

    if (updErr) {
      setSavingDetails(false);
      setError(updErr.message);
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
          ? `Finalize at least one ${(UNIT_LABEL[title?.content_type ?? ""] ?? "episode").toLowerCase()} (not just save as draft) before submitting.`
          : rpcErr?.message || data?.error || "Could not submit for review.";
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
      setError(rpcErr?.message || data?.error || "Could not withdraw project.");
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
        <p className="text-center text-sm text-muted">Project not found.</p>
      </div>
    );
  }

  const unitLabel = UNIT_LABEL[title.content_type] ?? "Episode";
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
        <Link href="/creator/dashboard" aria-label="Back" className="text-text">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl font-semibold text-text">
          {title.title}
        </h1>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold", meta.className)}>
          {meta.label}
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
          <p className="font-semibold">Declined by admin</p>
          <p className="mt-0.5">{title.admin_review_note}</p>
        </div>
      )}
      {title.review_ignored_at && title.status === "in_review" && (
        <div className="mt-3 rounded-md border border-gold/30 bg-gold-soft px-4 py-3 text-[13px] text-gold">
          Still under review — an admin looked at this and will follow up.
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-crimson">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSubmit && (
          <Button
            size="sm"
            disabled={actionBusy !== null || !hasFinalizedEpisode}
            onClick={submitForReview}
            title={!hasFinalizedEpisode ? `Finalize a ${unitLabel.toLowerCase()} first` : undefined}
          >
            {actionBusy === "submit" ? "Submitting…" : "Submit for admin review"}
          </Button>
        )}
        {canWithdraw && (
          <Button size="sm" variant="secondary" disabled={actionBusy !== null} onClick={withdraw}>
            {actionBusy === "withdraw" ? "Withdrawing…" : "Withdraw / take down"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          <Pencil size={13} /> {editing ? "Cancel edit" : "Edit details"}
        </Button>
      </div>

      {editing && (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-surface p-4">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Title"
            className="h-12 w-full rounded-md border border-border bg-bg px-4 text-[14px] text-text"
          />
          <select
            value={editGenre}
            onChange={(e) => setEditGenre(e.target.value)}
            className="h-12 w-full rounded-md border border-border bg-bg px-4 text-[14px] text-text"
          >
            <option value="">No genre</option>
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
                {r.label}
              </option>
            ))}
          </select>
          <textarea
            value={editSynopsis}
            onChange={(e) => setEditSynopsis(e.target.value)}
            rows={3}
            placeholder="Synopsis"
            className="w-full rounded-md border border-border bg-bg px-4 py-3 text-[14px] text-text"
          />
          <label className="flex h-12 w-full cursor-pointer items-center justify-between rounded-md border border-dashed border-border bg-bg px-4 text-[13px] text-muted">
            {editPosterFile ? editPosterFile.name : "Replace poster (optional)"}
            <Upload size={15} />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setEditPosterFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button className="w-full" disabled={savingDetails} onClick={saveDetails}>
            {savingDetails ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}

      <div className="mt-7 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-semibold text-text">{unitLabel}s</h2>
        <Link href={`/creator/upload?titleId=${title.id}`}>
          <Button size="sm" variant="secondary">
            <Plus size={14} /> Add {unitLabel.toLowerCase()}
          </Button>
        </Link>
      </div>

      <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {episodes.map((ep) => (
          <li key={ep.id}>
            <Link
              href={`/creator/upload?titleId=${title.id}&episodeId=${ep.id}`}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <p className="text-[14px] font-medium text-text">
                  {unitLabel} {ep.episode_number}
                  {ep.name ? ` · ${ep.name}` : ""}
                </p>
                <p className="mt-0.5 text-[12px] capitalize text-muted">{ep.status}</p>
              </div>
              <span className="text-[12px] text-pink">Edit</span>
            </Link>
          </li>
        ))}
        {!episodes.length && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            No {unitLabel.toLowerCase()}s yet.
          </li>
        )}
      </ul>
    </div>
  );
}
