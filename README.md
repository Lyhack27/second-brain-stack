# Second Brain — Obsidian + localAI, self-hosted

A small, self-hosted stack that gives you **one Obsidian vault, synced to
every device, with an API your agents/scripts can write into** — no
third-party cloud in the loop.

Built for the talk *"Build a Second Brain w/ Obsidian & localAI"*
(Inspire9, Melbourne). Slides are in [`slides/`](slides/index.html).

## What's in the box

```
couchdb  →  always on. Sync hub for the "Self-hosted LiveSync" plugin.
hook     →  always on. Tiny webhook: agents POST a report, it lands in
            the vault as a note — no filesystem access needed.
obsidian →  OFF by default. Full desktop Obsidian streamed to a browser
            (KasmVNC), for graph view / plugin setup / one-off editing.
```

```
📱 Phone ──┐                              ┌── 🤖 Your agent / script
💻 Laptop ─┼──► CouchDB ◄──► Vault ◄───────┤
           │   (LiveSync)                 └── Webhook (POST /report)
           └── Obsidian in the browser (on-demand only)
```

Notes are plain Markdown files. There's no proprietary format and no
lock-in — if you ever want to walk away from this stack, your vault is
just a folder.

## Quick start

```bash
git clone <this-repo>
cd second-brain-stack
cp .env.example .env
# edit .env — set a real COUCHDB_PASSWORD, WEB_PASSWORD, HOOK_TOKEN

docker compose up -d couchdb hook
```

Then, on each device:

1. Install [Obsidian](https://obsidian.md) and open (or create) a vault.
2. Install the **Self-hosted LiveSync** community plugin.
3. Point it at `http://<your-server>:5984` (database name `obsidian`,
   same user/password as `.env`).
4. First device: let it push. Every other device: choose *"Fetch from
   remote"* when the plugin asks.

That's it — notes now sync in near-real-time between every device, with
CouchDB as the only server-side moving part.

## Turning the browser UI on/off

`obsidian` is a full desktop Obsidian running inside a container,
streamed to your browser — useful for graph view, community plugin
setup, or editing from a machine that isn't yours. It's `restart: "no"`
on purpose: leave it off unless you're using it.

```bash
docker compose up -d obsidian    # turn on
docker compose stop obsidian     # turn off — sync never notices, it
                                  # doesn't touch couchdb or hook
```

It costs ~1GB RAM *only while running*. Log in at `http://<your-server>:3000`
with `WEB_USER` / `WEB_PASSWORD` from `.env`.

## Writing into the vault from agents/scripts

The `hook` service lets anything that can `curl` add a note, without
touching the filesystem or waiting for the Obsidian UI:

```bash
curl -X POST http://<your-server>:8080/report \
  -H "Authorization: Bearer $HOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent":"claude","title":"Nightly audit","content":"Backups OK · SSL renews in 12 days"}'
```

This appends to `Team/<agent>/<today>.md`, writing a proper
LiveSync-format document straight into CouchDB — every device gets it
instantly, even with the browser UI off. Point a cron job, a CI step, or
an AI agent at this and you have automated reports living in your
second brain.

## Linking notes into a real graph

Graph view is only interesting if notes actually link to each other.
The habit that makes it work: whenever you write a note about a topic,
add a `[[Link]]` to a hub note for that topic (`[[Marketing]]`,
`[[Project X]]`, whatever), and list the note back on the hub. A few
minutes of `[[linking]]` turns a pile of files into a second brain.

Obsidian's Graph view has a **"Orphans" toggle** in its filter panel —
turn it off to hide every note with zero connections and see just the
notes that are actually linked. Handy for a live demo, or just to spot
notes worth connecting.

## Gotchas we hit, so you don't have to

- **Bytes ≠ string length.** LiveSync compares document sizes in UTF-8
  bytes; using JavaScript's `.length` (UTF-16) makes notes with accents
  or emoji look "corrupted" on other devices. See `bytes()` in
  `hook/server.ts`.
- **Setup wizards flip your flags.** The LiveSync plugin's setup dialogs
  can silently disable `syncOnStart`. Check the plugin's own settings if
  sync stops being automatic.
- **CouchDB doc IDs need real percent-encoding.** If you ever query
  CouchDB directly for a note in a subfolder, encode the `/` in the doc
  ID as `%2F` — a literal slash gets parsed as a URL path separator, not
  part of the ID, and you'll get false "not found" errors.
- **Filesystem writes need the Obsidian UI running.** Only the `hook`
  service writes straight to CouchDB (instant sync, UI can be off). If
  you ever drop a file directly onto the vault folder on disk, LiveSync
  only picks it up once `obsidian` is running to notice the change and
  push it — it won't reach other devices until then.
- **Stale reverse-proxy configs haunt you.** If you experiment with
  domains/routing, clean up unused Traefik/Caddy config — a forgotten
  rule claiming your domain shows up as random 502s weeks later.

## License

MIT — see [LICENSE](LICENSE). Swap the placeholders in `.env.example`,
point it at your own domain if you use the optional Traefik labels in
`docker-compose.yml`, and it's yours.
