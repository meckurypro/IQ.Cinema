// tests/upload-wizard.test.tsx
//
// Drives the REAL <UploadWizard/> through every step with a fake Supabase and a
// controllable upload engine. Covers the happy path for each content type, the
// resume-from-draft logic, and — importantly — the failure paths that used to
// be silent: they must now produce a visible message and a way forward.

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FakeDb, makeFakeSupabase } from "./fakeSupabase";
import { UploadError, type UploadSnapshot } from "../lib/upload/tusUpload";
import { en, fr, type MessageKey } from "../lib/i18n/messages";
import { formatDuration } from "../lib/upload/format";

// ------------------------------------------------------------------ mocks
const h = vi.hoisted(() => ({
  fake: null as any,
  search: new URLSearchParams(),
  lang: "en" as "en" | "fr",
  push: vi.fn(),
  uploads: [] as any[],
  imageFail: null as null | string,
  tCache: {} as Record<string, any>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
  useSearchParams: () => h.search,
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children) };
});
// Stable identity, like the real hook (a fresh object per render would re-fire effects forever).
vi.mock("@/hooks/useAuth", () => {
  const AUTH = { user: { id: "u1" }, profile: { role: "creator" }, loading: false };
  return { useAuth: () => AUTH };
});
vi.mock("@/hooks/useI18n", async () => {
  const m = await import("../lib/i18n/messages");
  return {
    useI18n: () => {
      // Stable identity per language, like the real provider (effects depend on `t`).
      if (!h.tCache[h.lang]) {
        const dict = (m.dictionaries as any)[h.lang];
        h.tCache[h.lang] = {
          lang: h.lang,
          t: (key: string, vars?: Record<string, string | number>) => {
            let out: string = dict[key] ?? (m.en as any)[key] ?? key;
            if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
            return out;
          },
        };
      }
      return h.tCache[h.lang];
    },
  };
});
vi.mock("@/lib/supabase/client", () => ({ createClient: () => h.fake }));
vi.mock("@/lib/supabase/resumableUpload", () => ({
  resolveVideoContentType: (f: File) => (/\.(mp4|m4v)$/i.test(f.name) ? "video/mp4" : /\.mov$/i.test(f.name) ? "video/quicktime" : null),
  startVideoUpload: vi.fn((opts: any) => makeControllable(opts)),
}));
vi.mock("@/lib/mp4Faststart", () => ({ hasFastStart: async () => true }));
vi.mock("@/lib/storyboard", () => ({
  STORYBOARD_BUCKET: "thumbnails",
  storyboardPath: (p: string) => `${p}.sb.jpg`,
  generateStoryboard: async () => new Blob(["x"]),
  uploadStoryboard: async () => {},
}));
vi.mock("@/lib/upload/videoMeta", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    readVideoMetadata: async (file: File) => {
      if (file.name === "wide.mp4") return { duration: 120, width: 1920, height: 1080 };
      if (file.name === "long.mp4") return { duration: 4000, width: 1080, height: 1920 };
      if (file.name === "square.mp4") return { duration: 60, width: 1080, height: 1080 };
      return { duration: 120, width: 1080, height: 1920 };
    },
  };
});
vi.mock("@/lib/upload/imageUpload", async (orig) => {
  const actual: any = await orig();
  const { UploadError: UE } = await import("../lib/upload/tusUpload");
  return {
    ...actual,
    uploadImageWithProgress: async ({ onProgress }: any) => {
      onProgress?.(0.5);
      if (h.imageFail) throw new UE(h.imageFail as any, "x");
      onProgress?.(1);
    },
  };
});

import { UploadWizard } from "../components/creator/upload/UploadWizard";
import { startVideoUpload } from "@/lib/supabase/resumableUpload";

function makeControllable(opts: any) {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const done = new Promise<void>((res, rej) => {
    resolve = res;
    rej;
    reject = rej;
  });
  done.catch(() => {});
  const total = opts.file.size || 1000;
  const snap = (p: Partial<UploadSnapshot>): UploadSnapshot => ({
    phase: "uploading", bytesUploaded: 0, bytesTotal: total, fraction: 0, speedBps: 0, etaSeconds: null, retryAttempt: 0, error: null, ...p,
  });
  const ctl: any = {
    opts,
    retries: 0,
    emit: (fraction: number, extra: Partial<UploadSnapshot> = {}) =>
      opts.onUpdate(snap({ fraction, bytesUploaded: Math.round(total * fraction), speedBps: 2_000_000, etaSeconds: 10, ...extra })),
    fail: (code: any = "network") => opts.onUpdate(snap({ phase: "error", fraction: 0.3, error: new UploadError(code, "x") })),
    finish: () => {
      opts.onUpdate(snap({ phase: "done", fraction: 1, bytesUploaded: total }));
      resolve();
    },
  };
  h.uploads.push(ctl);
  return {
    done,
    snapshot: () => snap({}),
    pause: vi.fn(),
    resume: vi.fn(),
    retry: vi.fn(() => {
      ctl.retries++;
    }),
    abort: vi.fn(async () => reject(new UploadError("cancelled", "c"))),
  };
}

// ---------------------------------------------------------------- helpers
const T = (key: MessageKey, vars?: Record<string, string | number>, lang: "en" | "fr" = "en") => {
  let out: string = ((lang === "fr" ? fr : en) as any)[key];
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
};
const user = () => userEvent.setup({ applyAccept: false });
const file = (name: string, type: string, size = 2000) => new File(["x".repeat(size)], name, { type });
const fileInput = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const btn = (name: string | RegExp) => screen.getByRole("button", { name });

let db: FakeDb;
beforeEach(() => {
  db = new FakeDb();
  h.fake = makeFakeSupabase(db);
  h.search = new URLSearchParams();
  h.lang = "en";
  h.uploads.length = 0;
  h.imageFail = null;
  h.push.mockClear();
  (startVideoUpload as any).mockClear();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  window.history.replaceState(null, "", "/creator/upload");
});

async function fillDetails(u: ReturnType<typeof user>, opts: { title: string; genre: string; category?: string; credit?: string }) {
  await u.type(screen.getByPlaceholderText(T("upload.titlePlaceholder")), opts.title);
  if (opts.credit) await u.type(screen.getByPlaceholderText(T("upload.credit.artist")), opts.credit);
  if (opts.category) await u.selectOptions(screen.getByLabelText(T("library.category")), opts.category);
  await u.selectOptions(screen.getByLabelText(T("upload.genre")), opts.genre);
  await u.type(screen.getByPlaceholderText(T("upload.wiz.synopsisPlaceholder")), "A story.");
  await u.click(btn(new RegExp(T("upload.wiz.saveContinue"))));
}

async function pickAndUploadVideo(u: ReturnType<typeof user>, c: HTMLElement, f: File) {
  await u.upload(fileInput(c), f);
  await waitFor(() => expect(screen.queryByText(T("upload.wiz.video.checking"))).toBeNull());
  await u.click(btn(new RegExp(T("upload.wiz.video.upload"))));
  await waitFor(() => expect(h.uploads.length).toBe(1));
}

// ======================================================================== tests
describe("series: full happy path (type → details → thumbnail → video → review → submit)", () => {
  it("saves a draft at every step, shows real-time progress, and submits for review", async () => {
    const u = user();
    const { container } = render(<UploadWizard />);

    // 1 Type
    expect(screen.getByText(T("upload.wiz.type.heading"))).toBeTruthy();
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));

    // 2 Details → project row exists as a DRAFT immediately
    await fillDetails(u, { title: "Love Contract", genre: "Drama", category: "drama" });
    await screen.findByText(T("upload.wiz.thumb.heading"));
    expect(db.tables.titles).toHaveLength(1);
    expect(db.tables.titles[0]).toMatchObject({
      creator_id: "u1", title: "Love Contract", slug: "love-contract", status: "draft", content_type: "full_episode", genre: "Drama", category: "drama",
    });
    expect(window.location.search).toBe(`?titleId=${db.tables.titles[0].id}`); // refresh / "Continue" resumes here
    expect(await screen.findByText(/Draft saved/)).toBeTruthy();

    // 3 Thumbnail
    await u.upload(fileInput(container), file("poster.png", "image/png"));
    await u.click(btn(new RegExp(T("upload.wiz.thumb.uploadContinue"))));
    await screen.findByText(T("upload.wiz.video.heading.episode"));
    expect(db.tables.titles[0].poster_url).toMatch(/^https:\/\/cdn\.test\/posters\/u1\//);

    // 4 Video — progress is visible and moves in real time
    await pickAndUploadVideo(u, container, file("portrait.mp4", "video/mp4", 5000));
    const bar = () => screen.getByRole("progressbar", { name: T("upload.wiz.uploadProgress") });
    await act(async () => h.uploads[0].emit(0.25));
    expect(bar().getAttribute("aria-valuenow")).toBe("25");
    expect(screen.getByText("25%")).toBeTruthy();
    await act(async () => h.uploads[0].emit(0.6));
    expect(bar().getAttribute("aria-valuenow")).toBe("60");
    expect(db.tables.episodes).toHaveLength(0); // nothing saved until the upload really finished
    await act(async () => h.uploads[0].finish());

    await screen.findByText(T("upload.wiz.video.savedDraft"));
    expect(db.tables.episodes).toHaveLength(1);
    expect(db.tables.episodes[0]).toMatchObject({
      title_id: db.tables.titles[0].id, episode_number: 1, status: "draft", duration_seconds: 120, video_width: 1080, video_height: 1920,
    });
    expect(db.tables.episodes[0].video_url).toMatch(new RegExp(`^u1/${db.tables.titles[0].id}/.+\\.mp4$`));

    // 5 Review → submit
    // Two buttons are labelled "Review": the step indicator and the bottom button. Use the bottom one.
    const reviewButtons = screen.getAllByRole("button", { name: /Review/ });
    await u.click(reviewButtons[reviewButtons.length - 1]);
    await screen.findByText(T("upload.wiz.review.heading"));
    await u.click(btn(T("upload.wiz.review.submit")));
    await screen.findByText(T("upload.wiz.done.submittedTitle"));
    expect(db.tables.titles[0].status).toBe("in_review");
    expect(db.tables.episodes[0].status).toBe("processing");
  });

  it("rejects a landscape video for a series, visibly, and offers no upload button", async () => {
    db.tables.titles.push({ id: "t1", creator_id: "u1", title: "S", content_type: "full_episode", genre: "Drama", category: "drama", content_rating: "13+", poster_url: "p", status: "draft" });
    h.search = new URLSearchParams("titleId=t1");
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.episode"));
    await u.upload(fileInput(container), file("wide.mp4", "video/mp4"));
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.err.notPortrait", { w: 1920, h: 1080 }));
    expect(screen.queryByRole("button", { name: new RegExp(T("upload.wiz.video.upload")) })).toBeTruthy();
    expect((screen.getByRole("button", { name: new RegExp(T("upload.wiz.video.upload")) }) as HTMLButtonElement).disabled).toBe(true);
    expect(startVideoUpload).not.toHaveBeenCalled();
  });
});

describe("music videos", () => {
  it("has artist credit, a music-only genre list, fixed category, and accepts widescreen", async () => {
    const u = user();
    const { container } = render(<UploadWizard />);
    await u.click(btn(new RegExp(T("upload.type.music"))));
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));

    // no category picker (it's fixed); artist field present; genres are music genres
    expect(screen.queryByLabelText(T("library.category"))).toBeNull();
    const genre = screen.getByLabelText(T("upload.genre"));
    expect(within(genre).queryByRole("option", { name: "Afrobeats" })).toBeTruthy();
    expect(within(genre).queryByRole("option", { name: "Revenge" })).toBeNull();

    await fillDetails(u, { title: "Sunrise", genre: "Afrobeats", credit: "Burna Boy" });
    await screen.findByText(T("upload.wiz.thumb.heading"));
    expect(db.tables.titles[0]).toMatchObject({ content_type: "music_video", category: "music", credit_name: "Burna Boy", genre: "Afrobeats" });

    await u.click(screen.getByText(T("upload.wiz.skipForNow")));
    await screen.findByText(T("upload.wiz.video.heading.part"));
    expect(screen.queryByLabelText(T("upload.unitNumber.episode"))).toBeNull(); // single video: no episode numbering

    await pickAndUploadVideo(u, container, file("wide.mp4", "video/mp4"));
    expect(screen.queryByRole("alert")).toBeNull(); // 16:9 is fine for a music video
    await act(async () => h.uploads[0].finish());
    await screen.findByText(T("upload.wiz.video.savedDraft"));
    expect(db.tables.episodes[0]).toMatchObject({ episode_number: 1, video_width: 1920, video_height: 1080, status: "draft" });
  });

  it("still rejects a square video", async () => {
    db.tables.titles.push({ id: "t1", creator_id: "u1", title: "M", content_type: "music_video", genre: "Pop", category: "music", content_rating: "13+", poster_url: "p", status: "draft" });
    h.search = new URLSearchParams("titleId=t1");
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.part"));
    await u.upload(fileInput(container), file("square.mp4", "video/mp4"));
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.wiz.err.notPortraitOrLandscape", { w: 1080, h: 1080 }));
  });
});

describe("commercials", () => {
  it("uses brand credit + commercial category and enforces the 3 minute limit", async () => {
    const u = user();
    const { container } = render(<UploadWizard />);
    await u.click(btn(new RegExp(T("upload.type.commercial"))));
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));
    expect(screen.getByPlaceholderText(T("upload.credit.brand"))).toBeTruthy();
    const genre = screen.getByLabelText(T("upload.genre"));
    expect(within(genre).queryByRole("option", { name: "Tech" })).toBeTruthy();
    expect(within(genre).queryByRole("option", { name: "Afrobeats" })).toBeNull();

    await u.type(screen.getByPlaceholderText(T("upload.titlePlaceholder")), "Summer Sale");
    await u.type(screen.getByPlaceholderText(T("upload.credit.brand")), "Acme");
    await u.selectOptions(genre, "Tech");
    await u.click(btn(new RegExp(T("upload.wiz.saveContinue"))));
    await screen.findByText(T("upload.wiz.thumb.heading"));
    expect(db.tables.titles[0]).toMatchObject({ content_type: "commercial", category: "commercial", credit_name: "Acme" });

    await u.click(screen.getByText(T("upload.wiz.skipForNow")));
    await screen.findByText(T("upload.wiz.video.heading.part"));
    await u.upload(fileInput(container), file("long.mp4", "video/mp4")); // 4000s
    expect((await screen.findByRole("alert")).textContent).toBe(
      T("upload.err.tooLong", { label: T("upload.type.commercial"), max: "3m", len: formatDuration(4000) })
    );
  });
});

describe("failures are visible and recoverable (these used to be silent)", () => {
  const seedVideoStep = () => {
    db.tables.titles.push({ id: "t1", creator_id: "u1", title: "S", content_type: "full_episode", genre: "Drama", category: "drama", content_rating: "13+", poster_url: "p", status: "draft" });
    h.search = new URLSearchParams("titleId=t1");
  };

  it("a network failure mid-upload shows a message and Retry; retry continues the same upload", async () => {
    seedVideoStep();
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.episode"));
    await pickAndUploadVideo(u, container, file("portrait.mp4", "video/mp4"));
    await act(async () => h.uploads[0].emit(0.3));
    await act(async () => h.uploads[0].fail("network"));

    expect(screen.getAllByText(T("upload.wiz.err.network")).length).toBeGreaterThan(0);
    await u.click(btn(new RegExp(T("upload.wiz.retry"))));
    expect(h.uploads[0].retries).toBe(1);
    expect(startVideoUpload).toHaveBeenCalledTimes(1); // same upload resumed, not restarted

    await act(async () => h.uploads[0].finish());
    await screen.findByText(T("upload.wiz.video.savedDraft"));
  });

  it("if saving the episode row fails AFTER the upload, nothing is re-uploaded and 'Retry saving' works", async () => {
    seedVideoStep();
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.episode"));
    await pickAndUploadVideo(u, container, file("portrait.mp4", "video/mp4"));
    db.fail("episodes.insert", "new row for relation episodes violates check constraint", "23514");
    await act(async () => h.uploads[0].finish());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("violates check constraint");
    expect(alert.textContent).toContain(T("upload.wiz.uploadKept"));
    expect(db.tables.episodes).toHaveLength(0);

    await u.click(btn(T("upload.wiz.retrySave")));
    await screen.findByText(T("upload.wiz.video.savedDraft"));
    expect(db.tables.episodes).toHaveLength(1);
    expect(db.tables.episodes[0]).toMatchObject({ duration_seconds: 120, video_width: 1080 }); // metadata survived the retry
    expect(startVideoUpload).toHaveBeenCalledTimes(1); // the video was NOT uploaded a second time
  });

  it("starting an upload while offline says so instead of doing nothing", async () => {
    seedVideoStep();
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.episode"));
    await u.upload(fileInput(container), file("portrait.mp4", "video/mp4"));
    await waitFor(() => expect(screen.queryByText(T("upload.wiz.video.checking"))).toBeNull());
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await u.click(btn(new RegExp(T("upload.wiz.video.upload"))));
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.wiz.err.network"));
    expect(startVideoUpload).not.toHaveBeenCalled();
  });

  it("an unsupported video type is explained before any bytes move", async () => {
    seedVideoStep();
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.episode"));
    await u.upload(fileInput(container), file("clip.webm", "video/webm"));
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.wiz.err.unsupportedType"));
    expect(startVideoUpload).not.toHaveBeenCalled();
  });

  it("an iPhone HEIC thumbnail is rejected with a specific message and nothing is saved", async () => {
    db.tables.titles.push({ id: "t1", creator_id: "u1", title: "S", content_type: "full_episode", genre: "Drama", category: "drama", content_rating: "13+", poster_url: null, status: "draft" });
    h.search = new URLSearchParams("titleId=t1");
    const u = user();
    const { container } = render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.thumb.heading"));
    await u.upload(fileInput(container), file("IMG_1.HEIC", "image/heic"));
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.wiz.err.heic"));
    expect(db.tables.titles[0].poster_url).toBeNull();
  });

  it("a database error while saving details is shown next to the form", async () => {
    const u = user();
    render(<UploadWizard />);
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));
    db.fail("titles.insert", "duplicate key value", "23505");
    await fillDetails(u, { title: "Dup", genre: "Drama", category: "drama" });
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.err.titleExists"));
    expect(db.tables.titles).toHaveLength(0);
  });

  it("opening a project that isn't yours (or doesn't exist) explains why", async () => {
    db.tables.titles.push({ id: "t9", creator_id: "someone-else", title: "X", content_type: "full_episode", status: "draft" });
    h.search = new URLSearchParams("titleId=t9");
    render(<UploadWizard />);
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.wiz.err.notFound"));
  });
});

describe("safe to deploy before the database migration is applied", () => {
  it("series/film projects never send the new credit_name column", async () => {
    const u = user();
    render(<UploadWizard />);
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));
    await fillDetails(u, { title: "Plain Series", genre: "Drama", category: "drama" });
    await screen.findByText(T("upload.wiz.thumb.heading"));
    expect(Object.keys(db.tables.titles[0])).not.toContain("credit_name");
  });

  it("picking a new content type before the enum exists gives a clear explanation, not a raw database error", async () => {
    const u = user();
    render(<UploadWizard />);
    await u.click(btn(new RegExp(T("upload.type.music"))));
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));
    db.fail("titles.insert", 'invalid input value for enum content_type: "music_video"', "22P02");
    await fillDetails(u, { title: "Early", genre: "Afrobeats", credit: "Someone" });
    expect((await screen.findByRole("alert")).textContent).toBe(T("upload.wiz.err.typeNotReady"));
    expect(db.tables.titles).toHaveLength(0);
  });
});

describe("drafts persist and resume at the right step", () => {
  const title = (over: any = {}) => ({
    id: "t1", creator_id: "u1", title: "My Show", content_type: "full_episode", genre: "Drama", category: "drama",
    content_rating: "13+", poster_url: null, status: "draft", synopsis: null, credit_name: null, ...over,
  });

  it("no thumbnail yet → resumes at Thumbnail", async () => {
    db.tables.titles.push(title());
    h.search = new URLSearchParams("titleId=t1");
    render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.thumb.heading"));
  });

  it("thumbnail but no video → resumes at Video", async () => {
    db.tables.titles.push(title({ poster_url: "p" }));
    h.search = new URLSearchParams("titleId=t1");
    render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.video.heading.episode"));
  });

  it("a finished single-video project (film) → resumes at Review with everything ticked", async () => {
    db.tables.titles.push(title({ content_type: "one_part_film", poster_url: "p" }));
    db.tables.episodes.push({ id: "e1", title_id: "t1", episode_number: 1, name: null, video_url: "u1/t1/a.mp4", status: "draft", duration_seconds: 100 });
    h.search = new URLSearchParams("titleId=t1");
    render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.review.heading"));
    expect(screen.queryByText(T("upload.wiz.review.fix"))).toBeNull(); // nothing left to fix
    expect((btn(T("upload.wiz.review.submit")) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Review blocks submission and points at what's missing", async () => {
    db.tables.titles.push(title({ content_type: "one_part_film" }));
    h.search = new URLSearchParams("titleId=t1");
    const u = user();
    render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.thumb.heading"));
    await u.click(screen.getByRole("button", { name: /Review/ })); // the step indicator
    await screen.findByText(T("upload.wiz.review.heading"));
    expect((btn(T("upload.wiz.review.submit")) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(T("upload.wiz.review.fix")).length).toBe(2); // thumbnail + video
  });

  it("an unsaved pre-project draft is restored from this device after a refresh", async () => {
    localStorage.setItem(
      "iq.upload.draft.v2:u1",
      JSON.stringify({ contentType: "commercial", titleName: "Half typed", creditName: "Acme", category: "drama", genre: "Tech", extraTags: [], synopsis: "", contentRating: "13+" })
    );
    const u = user();
    render(<UploadWizard />);
    expect(await screen.findByText(T("upload.wiz.restored"))).toBeTruthy();
    await u.click(btn(new RegExp(T("upload.wiz.continue"))));
    expect((screen.getByPlaceholderText(T("upload.titlePlaceholder")) as HTMLInputElement).value).toBe("Half typed");
    expect((screen.getByPlaceholderText(T("upload.credit.brand")) as HTMLInputElement).value).toBe("Acme");
  });

  it("Save draft & exit leaves the draft in the database and returns to the dashboard", async () => {
    db.tables.titles.push(title({ content_type: "one_part_film", poster_url: "p" }));
    db.tables.episodes.push({ id: "e1", title_id: "t1", episode_number: 1, video_url: "u1/t1/a.mp4", status: "draft" });
    h.search = new URLSearchParams("titleId=t1");
    const u = user();
    render(<UploadWizard />);
    await screen.findByText(T("upload.wiz.review.heading"));
    await u.click(btn(T("upload.wiz.review.saveExit")));
    expect(h.push).toHaveBeenCalledWith("/creator/dashboard");
    expect(db.tables.titles[0].status).toBe("draft");
    expect(db.tables.episodes[0].status).toBe("draft");
  });
});

describe("French", () => {
  it("the whole wizard renders in French", async () => {
    h.lang = "fr";
    const u = user();
    render(<UploadWizard />);
    expect(screen.getByText(T("upload.wiz.type.heading", undefined, "fr"))).toBeTruthy();
    expect(screen.getAllByText("Détails").length).toBeGreaterThan(0);
    await u.click(screen.getByRole("button", { name: new RegExp(T("upload.wiz.continue", undefined, "fr")) }));
    expect(screen.getByPlaceholderText(T("upload.titlePlaceholder", undefined, "fr"))).toBeTruthy();
  });

  it("every wizard string has a French translation that isn't just the English", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("upload.wiz.") || k.startsWith("upload.typeDesc.") || k.startsWith("upload.credit."));
    expect(keys.length).toBeGreaterThan(80);
    for (const k of keys) {
      expect((fr as any)[k], k).toBeTruthy();
    }
    const same = keys.filter((k) => (fr as any)[k] === (en as any)[k] && /[a-z]{5,}/i.test((en as any)[k]) && !/^\{/.test((en as any)[k]));
    // a couple are legitimately identical (e.g. "Pause", "Type")
    expect(same.filter((k) => !["upload.wiz.pause", "upload.wiz.step.type", "upload.wiz.shape.portrait"].includes(k))).toEqual([]);
  });
});
