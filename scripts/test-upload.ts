// scripts/test-upload.ts
//
// End-to-end tests for the upload engine (lib/upload/tusUpload.ts) against a
// REAL local TUS server (@tus/server), plus the pure validators. Run:
//
//   npm run test:upload
//
// What's covered: real-time progress, fresh credentials per request (token
// rotation), 401/403/413/415 are reported (not retried or hung), transient 5xx
// and dropped sockets recover, offline → auto-resume, pause/resume integrity
// (byte-for-byte), abort, setup failures never hang, blocked browser storage
// never hangs, and the video/image/aspect/duration rules.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Server } from "@tus/server";
import { FileStore } from "@tus/file-store";
import * as tus from "tus-js-client";
import { createTusUpload, describeUploadError, UploadError, type UploadSnapshot } from "../lib/upload/tusUpload";
import { checkImageFile } from "../lib/upload/imageUpload";
import { checkVideoMeta, checkVideoFile, VIDEO_MAX_BYTES, getTypeConfig, unitOf } from "../lib/uploadTypes";

// ---------------------------------------------------------------- harness
let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: unknown, name: string, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MiB = 1024 * 1024;

type Rule = (req: http.IncomingMessage, res: http.ServerResponse, n: number) => boolean; // true = handled
type Mock = {
  url: string;
  log: { method: string; auth: string | undefined }[];
  setRule: (r: Rule | null) => void;
  setDelay: (ms: number) => void;
  dir: string;
  stop: () => Promise<void>;
  start: () => Promise<void>;
  files: () => string[];
  closeAll: () => void;
};

async function mockServer(port = 0): Promise<Mock> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tus-test-"));
  const tusServer = new Server({
    path: "/files",
    datastore: new FileStore({ directory: dir }),
    // behave like a reverse proxy would
    respectForwardedHeaders: true,
  });
  let rule: Rule | null = null;
  let n = 0;
  let delay = 0;
  const log: Mock["log"] = [];
  const server = http.createServer((req, res) => {
    n++;
    log.push({ method: req.method ?? "", auth: req.headers.authorization as string | undefined });
    if (rule && rule(req, res, n)) return;
    if (delay && req.method === "PATCH") setTimeout(() => tusServer.handle(req, res), delay);
    else tusServer.handle(req, res);
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  let boundPort = (server.address() as any).port as number;
  const self: Mock = {
    url: `http://127.0.0.1:${boundPort}/files`,
    log,
    dir,
    setRule: (r) => {
      rule = r;
      n = 0;
    },
    setDelay: (ms) => {
      delay = ms;
    },
    stop: () => new Promise((r) => (server.closeAllConnections(), server.close(() => r()))),
    start: async () => {
      await new Promise<void>((r) => server.listen(boundPort, "127.0.0.1", r));
    },
    files: () => fs.readdirSync(dir).filter((f) => !f.endsWith(".json")),
    closeAll: () => server.closeAllConnections(),
  };
  return self;
}

const online = { isOnline: () => true, onOnline: () => () => {}, onOffline: () => () => {} };
function mkFile(size: number): Buffer {
  return crypto.randomBytes(size);
}
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

function run(mock: Mock, buf: Buffer, extra: Partial<Parameters<typeof createTusUpload>[0]> = {}) {
  const snaps: UploadSnapshot[] = [];
  const handle = createTusUpload({
    endpoint: mock.url,
    bucket: "videos",
    path: "u/t/x.mp4",
    file: buf as any,
    contentType: "video/mp4",
    getAuth: async () => ({ token: "tok", apikey: "key" }),
    onUpdate: (s) => snaps.push(s),
    retryDelays: [0, 50, 100],
    connectivity: online,
    storeFingerprint: false,
    ...extra,
  });
  return { handle, snaps };
}

function serverFileFor(mock: Mock): Buffer | null {
  const f = mock.files()[0];
  return f ? fs.readFileSync(path.join(mock.dir, f)) : null;
}

function reset(mock: Mock) {
  mock.setRule(null);
  mock.setDelay(0);
  mock.log.length = 0;
  for (const f of fs.readdirSync(mock.dir)) fs.rmSync(path.join(mock.dir, f), { force: true });
}

// ------------------------------------------------------------------ tests
async function main() {
  const mock = await mockServer();
  console.log(`mock TUS server on ${mock.url}\n`);

  console.log("1. Happy path + real-time progress");
  {
    const buf = mkFile(20 * MiB);
    mock.setDelay(400); // loopback is instant; slow it so speed/ETA can be sampled
    const { handle, snaps } = run(mock, buf);
    await handle.done;
    mock.setDelay(0);
    const uploading = snaps.filter((s) => s.phase === "uploading" && s.bytesUploaded > 0);
    const fractions = uploading.map((s) => s.fraction);
    ok(snaps.at(-1)?.phase === "done", "ends in phase=done");
    ok(snaps.at(-1)?.fraction === 1, "ends at 100%");
    ok(uploading.length >= 3, "emits several progress updates (not just start/end)", `got ${uploading.length}`);
    ok(fractions.every((f, i) => i === 0 || f >= fractions[i - 1]), "progress never goes backwards");
    ok(uploading.some((s) => s.fraction > 0 && s.fraction < 1), "has intermediate values between 0 and 1");
    ok(snaps.some((s) => s.speedBps > 0), "reports a speed");
    ok(snaps.some((s) => s.etaSeconds !== null), "reports an ETA");
    const got = serverFileFor(mock);
    ok(got && sha(got) === sha(buf), "server received the file byte-for-byte", got ? `${got.length}/${buf.length}` : "no file");
  }

  console.log("\n2. Fresh credentials before EVERY request (long uploads outlive the token)");
  {
    reset(mock);
    const buf = mkFile(20 * MiB);
    let calls = 0;
    const { handle } = run(mock, buf, {
      getAuth: async () => {
        calls++;
        return { token: `token-${calls}`, apikey: "key" };
      },
    });
    await handle.done;
    const tokens = new Set(mock.log.map((l) => l.auth));
    ok(calls >= 3, "getAuth is called repeatedly", `calls=${calls}`);
    ok(tokens.size >= 3, "different tokens reached the server over time", `${tokens.size} distinct`);
    ok(mock.log.at(-1)?.auth === `Bearer token-${calls}`, "last request used the newest token");
  }

  console.log("\n3. 401 → clear error, not a loop, and retry() recovers");
  {
    reset(mock);
    const buf = mkFile(8 * MiB);
    let deny = true;
    mock.setRule((req, res) => {
      if (!deny) return false;
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "expired" }));
      return true;
    });
    const { handle, snaps } = run(mock, buf);
    await sleep(600);
    const last = snaps.at(-1)!;
    ok(last.phase === "error" && last.error?.code === "signed_out", "reports signed_out", `${last.phase}/${last.error?.code}`);
    ok(mock.log.length <= 2, "did not hammer the server on 401", `requests=${mock.log.length}`);
    deny = false;
    handle.retry();
    await handle.done;
    ok(snaps.at(-1)?.phase === "done", "retry() after signing in again completes the upload");
    const got = serverFileFor(mock);
    ok(got && sha(got) === sha(buf), "…and the data is intact");
  }

  console.log("\n4. 415 / 413 / 403 are reported, once, without retry storms");
  for (const [status, code] of [
    [415, "unsupported_type"],
    [413, "too_large"],
    [403, "forbidden"],
  ] as const) {
    reset(mock);
    mock.setRule((req, res) => {
      res.writeHead(status);
      res.end("nope");
      return true;
    });
    const { handle, snaps } = run(mock, mkFile(1 * MiB));
    await sleep(500);
    const last = snaps.at(-1)!;
    ok(last.phase === "error" && last.error?.code === code, `${status} → ${code}`, `${last.phase}/${last.error?.code}`);
    ok(mock.log.length === 1, `${status}: exactly one request`, `requests=${mock.log.length}`);
    await handle.abort();
  }

  console.log("\n5. Transient 500s are retried and the upload still completes");
  {
    reset(mock);
    const buf = mkFile(10 * MiB);
    mock.setRule((req, res, n) => {
      if (n <= 2) {
        res.writeHead(500);
        res.end("boom");
        return true;
      }
      return false;
    });
    const { handle, snaps } = run(mock, buf);
    await handle.done;
    ok(snaps.some((s) => s.phase === "retrying"), "UI sees a 'retrying' phase");
    const got = serverFileFor(mock);
    ok(got && sha(got) === sha(buf), "upload completed byte-for-byte after 500s");
  }

  console.log("\n6. Dropped connection mid-upload recovers");
  {
    reset(mock);
    const buf = mkFile(14 * MiB);
    let dropped = false;
    mock.setRule((req, res) => {
      if (req.method === "PATCH" && !dropped) {
        dropped = true;
        req.socket.destroy();
        return true;
      }
      return false;
    });
    const { handle, snaps } = run(mock, buf);
    await handle.done;
    ok(dropped, "a connection was actually dropped");
    ok(snaps.at(-1)?.phase === "done", "still finished");
    const got = serverFileFor(mock);
    ok(got && sha(got) === sha(buf), "data intact after the drop");
  }

  console.log("\n7. Offline → waits, then resumes by itself when the network returns");
  {
    reset(mock);
    const buf = mkFile(10 * MiB);
    let onlineNow = false;
    const fireRef: { fn: (() => void) | null } = { fn: null };
    const conn = {
      isOnline: () => onlineNow,
      onOnline: (cb: () => void) => {
        fireRef.fn = cb;
        return () => {
          fireRef.fn = null;
        };
      },
      onOffline: () => () => {},
    };
    mock.setRule((req) => {
      req.socket.destroy(); // unreachable
      return true;
    });
    const { handle, snaps } = run(mock, buf, { connectivity: conn });
    await sleep(900);
    ok(snaps.at(-1)?.phase === "offline", "shows 'offline' instead of failing", `phase=${snaps.at(-1)?.phase}`);
    ok(!snaps.some((s) => s.phase === "error"), "never entered a terminal error while offline");
    mock.setRule(null);
    onlineNow = true;
    fireRef.fn?.();
    await handle.done;
    ok(snaps.at(-1)?.phase === "done", "completed automatically after reconnect");
    const got = serverFileFor(mock);
    ok(got && sha(got) === sha(buf), "data intact");
  }

  console.log("\n8. Pause / resume keeps data intact");
  {
    reset(mock);
    const buf = mkFile(24 * MiB);
    let paused = false;
    const { handle, snaps } = run(mock, buf, {
      onUpdate: undefined,
    });
    // re-run with a hook so we can pause at a known point
    await handle.abort().catch(() => {});
    reset(mock);
    const snaps2: UploadSnapshot[] = [];
    const h = createTusUpload({
      endpoint: mock.url,
      bucket: "videos",
      path: "u/t/p.mp4",
      file: buf as any,
      contentType: "video/mp4",
      getAuth: async () => ({ token: "t", apikey: "k" }),
      retryDelays: [0, 50],
      connectivity: online,
      storeFingerprint: true,
      onUpdate: (s) => {
        snaps2.push(s);
        if (!paused && s.phase === "uploading" && s.bytesUploaded >= 6 * MiB) {
          paused = true;
          h.pause();
        }
      },
    });
    await sleep(1200);
    const atPause = snaps2.at(-1)!;
    ok(atPause.phase === "paused", "enters 'paused'", `phase=${atPause.phase}`);
    const frozen = atPause.bytesUploaded;
    await sleep(500);
    ok(snaps2.at(-1)!.bytesUploaded === frozen, "no bytes move while paused");
    h.resume();
    await h.done;
    ok(snaps2.at(-1)?.phase === "done", "resume completes");
    const got = serverFileFor(mock);
    ok(got && got.length === buf.length && sha(got) === sha(buf), "resumed upload is byte-for-byte identical (no gaps/duplicates)");
  }

  console.log("\n9. abort() cancels cleanly");
  {
    reset(mock);
    const { handle, snaps } = run(mock, mkFile(30 * MiB));
    await sleep(100);
    await handle.abort();
    let code = "";
    await handle.done.catch((e) => (code = e.code));
    ok(code === "cancelled", "done rejects with code=cancelled", code);
    ok(snaps.at(-1)?.phase === "idle", "returns to idle (not an error)");
  }

  console.log("\n10. Setup failures can never hang (the old silent-failure mode)");
  {
    reset(mock);
    const a = run(mock, mkFile(1 * MiB), {
      getAuth: async () => {
        throw new UploadError("signed_out", "no session", 401);
      },
    });
    const outA = await Promise.race([a.handle.done.then(() => "resolved", (e) => e.code), sleep(3000).then(() => "HUNG")]);
    ok(outA === "signed_out" || a.snaps.at(-1)?.phase === "error", "getAuth() throwing surfaces an error instead of hanging", String(outA));

    const b = run(mock, mkFile(1 * MiB), { endpoint: "not a url" });
    const outB = await Promise.race([b.handle.done.then(() => "resolved", () => "rejected"), sleep(3000).then(() => "HUNG")]);
    ok(outB !== "HUNG", "a bad endpoint surfaces an error instead of hanging", String(outB));

    // Browser storage blocked: findPreviousUploads() rejects. Old code never
    // handled this → upload never started, stuck at 0%.
    const orig = tus.Upload.prototype.findPreviousUploads;
    tus.Upload.prototype.findPreviousUploads = () => Promise.reject(new Error("SecurityError: storage blocked"));
    reset(mock);
    const buf = mkFile(8 * MiB);
    const c = run(mock, buf);
    const outC = await Promise.race([c.handle.done.then(() => "done", () => "rejected"), sleep(8000).then(() => "HUNG")]);
    tus.Upload.prototype.findPreviousUploads = orig;
    ok(outC === "done", "blocked browser storage no longer stalls the upload", String(outC));
  }

  console.log("\n10b. A server that accepts the connection but never answers can't hang us (stall watchdog)");
  {
    reset(mock);
    mock.setRule(() => true); // swallow the request: no response, no close
    const { handle, snaps } = run(mock, mkFile(2 * MiB), { stallTimeoutMs: 400, maxRestarts: 1 });
    const out = await Promise.race([
      handle.done.then(() => "resolved", () => "rejected"),
      new Promise<string>((r) => {
        const t = setInterval(() => {
          if (snaps.at(-1)?.phase === "error") {
            clearInterval(t);
            r("error-phase");
          }
        }, 50);
      }),
      sleep(8000).then(() => "HUNG"),
    ]);
    ok(out !== "HUNG", "stalled connection ends in an error state instead of spinning forever", String(out));
    ok(snaps.at(-1)?.error?.code === "network", "reported as a network problem", String(snaps.at(-1)?.error?.code));
    mock.closeAll();
  }

  console.log("\n11. describeUploadError");
  {
    const mk = (status?: number, body = "") => ({
      originalResponse: status ? { getStatus: () => status, getBody: () => body } : undefined,
      originalRequest: {},
      message: "x",
    });
    ok(describeUploadError(mk(401)).code === "signed_out", "401 → signed_out");
    ok(describeUploadError(mk(400, "mime type not supported")).code === "unsupported_type", "400 w/ mime body → unsupported_type");
    ok(describeUploadError(mk(503)).code === "server", "503 → server");
    ok(describeUploadError(mk(undefined)).code === "network", "no response → network");
    ok(describeUploadError(new Error("Failed to fetch")).code === "network", "'Failed to fetch' → network");
  }

  await mock.stop();

  console.log("\n12. Validation rules (client mirrors the DB trigger)");
  {
    const m = (duration: number, width: number, height: number) => ({ duration, width, height });
    ok(checkVideoMeta(m(100, 1080, 1920), "short_episode") === null, "short episode 9:16 100s OK");
    ok(checkVideoMeta(m(160.4, 1080, 1920), "short_episode") === null, "160.4s rounds to 160 → OK (matches DB)");
    ok(checkVideoMeta(m(160.6, 1080, 1920), "short_episode")?.kind === "too_long", "160.6s rounds to 161 → too long (DB would reject)");
    ok(checkVideoMeta(m(161, 1080, 1920), "short_episode")?.kind === "too_long", "short episode 161s too long");
    ok(checkVideoMeta(m(100, 1920, 1080), "short_episode")?.kind === "bad_aspect_portrait", "series rejects landscape");
    ok(checkVideoMeta(m(7200, 1080, 1920), "one_part_film") === null, "film at 120m OK");
    ok(checkVideoMeta(m(600, 1920, 1080), "music_video") === null, "music video landscape 10m OK");
    ok(checkVideoMeta(m(600, 1080, 1920), "music_video") === null, "music video portrait OK");
    ok(checkVideoMeta(m(601.5, 1920, 1080), "music_video")?.kind === "too_long", "music video > 10m too long");
    ok(checkVideoMeta(m(300, 1080, 1080), "music_video")?.kind === "bad_aspect_flexible", "music video square rejected");
    ok(checkVideoMeta(m(180, 3840, 2160), "commercial") === null, "commercial 4K 16:9 3m OK");
    ok(checkVideoMeta(m(181, 1920, 1080), "commercial")?.kind === "too_long", "commercial > 3m too long");
    ok(checkVideoMeta(m(60, 1000, 1000), "commercial")?.kind === "bad_aspect_flexible", "commercial square rejected");
    ok(checkVideoFile({ size: VIDEO_MAX_BYTES + 1 })?.kind === "too_big", "> 5 GiB rejected");
    ok(checkVideoFile({ size: 100 * MiB }) === null, "100 MiB accepted");
    ok(unitOf("music_video") === "part" && unitOf("commercial") === "part", "music videos & commercials are single 'parts'");
    ok(unitOf("short_episode") === "episode", "series are numbered episodes");
    ok(getTypeConfig("music_video").fixedCategory === "music" && getTypeConfig("commercial").fixedCategory === "commercial", "fixed categories wired");

    const f = (name: string, type: string, size: number) => new File([new Uint8Array(1)], name, { type }) as File & { size: number };
    const withSize = (file: File, size: number) => Object.defineProperty(file, "size", { value: size });
    ok(checkImageFile(f("a.jpg", "image/jpeg", 1)) === null, "jpeg accepted");
    ok(checkImageFile(f("a.webp", "image/webp", 1)) === null, "webp accepted");
    ok(checkImageFile(f("IMG_1.HEIC", "image/heic", 1))?.code === "heic_unsupported", "iPhone HEIC gets a specific error");
    ok(checkImageFile(f("IMG_1.heic", "", 1))?.code === "heic_unsupported", "HEIC detected by extension when type is blank");
    ok(checkImageFile(f("a.gif", "image/gif", 1))?.code === "unsupported_type", "gif rejected");
    ok(checkImageFile(withSize(f("a.png", "image/png", 1), 6 * MiB))?.code === "too_large", "> 5 MB image rejected");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log("\nFAILURES:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("harness crashed:", e);
  process.exit(2);
});
