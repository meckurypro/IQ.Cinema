// tests/fakeSupabase.ts
//
// A small in-memory stand-in for the parts of supabase-js the upload wizard
// uses (tables, filters, insert/update/delete, rpc, storage URLs, auth), with
// hooks to inject failures — so tests can drive the REAL component end to end.

type Row = Record<string, any>;
let counter = 0;
const uid = () => `id-${++counter}`;

export class FakeDb {
  tables: Record<string, Row[]> = {
    titles: [],
    episodes: [],
    title_genres: [],
    genres: [
      "Drama", "Revenge", "Romance", "Thriller", "Afrobeats", "Hip-Hop", "R&B", "Tech", "Food & Drink",
    ].map((name) => ({ id: `g-${name}`, name })),
  };
  failures: Record<string, { message: string; code?: string }> = {}; // "episodes.insert" -> error (once)
  log: string[] = [];
  rpcs: Record<string, (args: any) => any> = {};
  session: { access_token: string } | null = { access_token: "tok" };

  fail(key: string, message: string, code?: string) {
    this.failures[key] = { message, code };
  }
}

function builder(db: FakeDb, table: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: any;
  let cols = "*";
  const filters: ((r: Row) => boolean)[] = [];
  let order: [string, boolean] | null = null;
  let single: null | "single" | "maybe" = null;
  let wantRows = false; // insert/update followed by .select()

  const exec = () => {
    const key = `${table}.${op}`;
    db.log.push(key);
    const f = db.failures[key];
    if (f) {
      delete db.failures[key];
      return { data: null, error: { message: f.message, code: f.code } };
    }
    const rows = db.tables[table] ?? (db.tables[table] = []);
    const matches = () => rows.filter((r) => filters.every((fn) => fn(r)));
    let out: Row[] = [];

    if (op === "insert") {
      const list = Array.isArray(payload) ? payload : [payload];
      for (const p of list) {
        const row: Row = { id: uid(), ...p };
        if (table === "titles") row.status = row.status ?? "draft";
        if (table === "episodes") row.status = row.status ?? "draft";
        rows.push(row);
        out.push(row);
      }
    } else if (op === "update") {
      out = matches();
      out.forEach((r) => Object.assign(r, payload));
    } else if (op === "delete") {
      const gone = matches();
      db.tables[table] = rows.filter((r) => !gone.includes(r));
      out = gone;
    } else {
      out = matches();
      if (order) out = [...out].sort((a, b) => (a[order![0]] > b[order![0]] ? 1 : -1) * (order![1] ? 1 : -1));
      if (table === "title_genres" && /genres\(name\)/.test(cols)) {
        out = out.map((r) => ({ ...r, genres: { name: db.tables.genres.find((g) => g.id === r.genre_id)?.name } }));
      }
    }

    if (op !== "select" && !wantRows) return { data: null, error: null };
    if (single === "single") return out.length ? { data: out[0], error: null } : { data: null, error: { message: "no rows", code: "PGRST116" } };
    if (single === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out.map((r) => ({ ...r })), error: null };
  };

  const b: any = {
    select(c?: string) {
      if (op === "select") cols = c ?? "*";
      else wantRows = true;
      return b;
    },
    insert(p: any) { op = "insert"; payload = p; return b; },
    update(p: any) { op = "update"; payload = p; return b; },
    delete() { op = "delete"; return b; },
    eq(c: string, v: any) { filters.push((r) => r[c] === v); return b; },
    in(c: string, vs: any[]) { filters.push((r) => vs.includes(r[c])); return b; },
    order(c: string, o?: { ascending?: boolean }) { order = [c, o?.ascending !== false]; return b; },
    single() { single = "single"; return b; },
    maybeSingle() { single = "maybe"; return b; },
    then(res: any, rej: any) { return Promise.resolve().then(exec).then(res, rej); },
  };
  return b;
}

export function makeFakeSupabase(db: FakeDb) {
  return {
    from: (table: string) => builder(db, table),
    rpc: async (name: string, args: any) => {
      db.log.push(`rpc.${name}`);
      const f = db.failures[`rpc.${name}`];
      if (f) {
        delete db.failures[`rpc.${name}`];
        return { data: null, error: { message: f.message } };
      }
      if (db.rpcs[name]) return { data: db.rpcs[name](args), error: null };
      if (name === "submit_title_for_review") {
        const has = db.tables.episodes.some((e) => e.title_id === args.p_title_id && e.video_url);
        if (!has) return { data: { ok: false, error: "no_video" }, error: null };
        const t = db.tables.titles.find((x) => x.id === args.p_title_id);
        if (t) t.status = "in_review";
        return { data: { ok: true }, error: null };
      }
      return { data: { ok: true }, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${p}` } }),
        remove: async (paths: string[]) => {
          db.log.push(`storage.remove:${bucket}:${paths.join(",")}`);
          return { data: null, error: null };
        },
        createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://cdn.test/signed/${p}` }, error: null }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session: db.session }, error: null }),
    },
  };
}
