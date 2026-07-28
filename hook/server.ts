// Team/agent report webhook → CouchDB (Self-hosted LiveSync document format).
// POST /report  { agent: "claude", title?: "...", content: "..." }
// Creates/updates the daily note Team/<agent>/<date>.md, appending an entry.
// Doesn't need the Obsidian web container running: it writes straight to the
// database, and every device with LiveSync gets it instantly.

const COUCH = process.env.COUCH_URL ?? "http://couchdb:5984";
const DB = process.env.COUCH_DB ?? "obsidian";
const AUTH = "Basic " + btoa(`${process.env.COUCH_USER}:${process.env.COUCH_PASSWORD}`);
const TOKEN = process.env.HOOK_TOKEN ?? "";
const TZ = process.env.TZ ?? "UTC";

const couch = (method: string, path: string, body?: unknown) =>
  fetch(`${COUCH}/${DB}/${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, ...opts }).format(d);

// LiveSync compares sizes in BYTES; using .length (UTF-16) marks notes with
// accents/emoji as "corrupted" on other devices.
const bytes = (s: string) => new TextEncoder().encode(s).length;

Bun.serve({
  port: 8080,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const m = url.pathname.match(/\/files\/([\w][\w .-]*)$/);
      if (m) {
        const f = Bun.file(`/app/public/${m[1]}`);
        return (await f.exists()) ? new Response(f) : new Response("not found\n", { status: 404 });
      }
      return new Response("ok\n");
    }
    if (req.method !== "POST" || !url.pathname.endsWith("/report"))
      return new Response("not found\n", { status: 404 });
    if (req.headers.get("authorization") !== `Bearer ${TOKEN}`)
      return new Response("unauthorized\n", { status: 401 });

    let body: { agent?: string; title?: string; content?: string };
    try { body = await req.json(); } catch { return new Response("bad json\n", { status: 400 }); }
    const agent = (body.agent ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
    const content = (body.content ?? "").trim();
    if (!agent || !content) return new Response("agent and content are required\n", { status: 400 });

    const now = new Date();
    const day = fmt(now, { dateStyle: "short" });             // YYYY-MM-DD
    const time = fmt(now, { hour: "2-digit", minute: "2-digit" });
    const path = `Team/${agent}/${day}.md`;
    const id = path.toLowerCase();
    const entry =
      `\n## ${time}${body.title ? " — " + body.title.trim() : ""}\n\n${content}\n`;

    // chunk holding the new entry
    const chunkId = `h:hook${crypto.randomUUID().replaceAll("-", "")}`;
    let r = await couch("PUT", encodeURIComponent(chunkId), { data: entry, type: "leaf" });
    if (!r.ok) return new Response(`couch chunk error: ${r.status}\n`, { status: 502 });

    // create or update the daily note (append the chunk)
    const existing = await couch("GET", encodeURIComponent(id));
    const ts = now.getTime();
    let doc;
    if (existing.status === 404) {
      const header = `# Reports from ${agent} — ${day}\n`;
      const headId = `h:hook${crypto.randomUUID().replaceAll("-", "")}`;
      const rh = await couch("PUT", encodeURIComponent(headId), { data: header, type: "leaf" });
      if (!rh.ok) return new Response(`couch chunk error: ${rh.status}\n`, { status: 502 });
      doc = { path, children: [headId, chunkId], type: "plain", ctime: ts, mtime: ts,
              size: bytes(header) + bytes(entry), eden: {} };
    } else if (existing.ok) {
      // Clear a soft-delete flag if present: a device may have soft-deleted
      // the note (deleted:true), and keeping it would make reports invisible.
      const { deleted: _drop, ...prev } = await existing.json();
      doc = { ...prev, children: [...prev.children, chunkId], mtime: ts,
              size: (prev.size ?? 0) + bytes(entry) };
    } else {
      return new Response(`couch read error: ${existing.status}\n`, { status: 502 });
    }
    r = await couch("PUT", encodeURIComponent(id), doc);
    if (!r.ok) return new Response(`couch write error: ${r.status}\n`, { status: 502 });
    return new Response(JSON.stringify({ ok: true, note: path }) + "\n");
  },
});
console.log("hook listening on :8080");
