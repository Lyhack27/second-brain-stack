# Second Brain — Obsidian + localAI, self-hosted

A small, self-hosted stack built around two things: **your notes synced
to every device in near-real-time**, and **an API your agents/scripts
can write into** — no third-party cloud in the loop.

Built for the talk *"Build a Second Brain w/ Obsidian & localAI"*
(Inspire9, Melbourne). Slides are in [`slides/`](slides/index.html).

## What's in the box

```
couchdb  →  always on. Sync hub for the "Self-hosted LiveSync" plugin —
            this is the whole point of the stack.
hook     →  always on. Tiny webhook: agents POST a report, it lands in
            the vault as a note, synced instantly. This is how your
            agents get a second brain too.
obsidian →  optional, off by default. Full desktop Obsidian streamed to
            a browser, for the odd time you want graph view or plugin
            setup from a machine that isn't yours.
```

```
📱 Phone ──┐
💻 Laptop ─┼──►  CouchDB  ◄──►  Vault  ◄──  Webhook (POST /report)  ◄── 🤖 Your agent / script
           │   (LiveSync)
```

Notes are plain Markdown files. There's no proprietary format and no
lock-in — if you ever want to walk away from this stack, your vault is
just a folder.

## Quick start — sync

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

## Writing into the vault from agents/scripts

This is the other half of the stack: the `hook` service lets anything
that can `curl` add a note, without touching the filesystem or waiting
on any UI:

```bash
curl -X POST http://<your-server>:8080/report \
  -H "Authorization: Bearer $HOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent":"claude","title":"Nightly audit","content":"Backups OK · SSL renews in 12 days"}'
```

This appends to `Team/<agent>/<today>.md`, writing a proper
LiveSync-format document straight into CouchDB — every device gets it
instantly. Point a cron job, a CI step, or an AI agent at this and you
have automated reports living in your second brain, right next to your
own notes.

## Linking notes into a real graph

Graph view is only interesting if notes actually link to each other.
The habit that makes it work: whenever you write a note about a topic,
add a `[[Link]]` to a hub note for that topic (`[[Marketing]]`,
`[[Project X]]`, whatever), and list the note back on the hub. A few
minutes of `[[linking]]` turns a pile of files into a second brain.

Obsidian's Graph view has an **"Orphans" toggle** in its filter panel —
turn it off to hide every note with zero connections and see just the
notes that are actually linked. Handy for a live demo, or just to spot
notes worth connecting.

## Optional: browser access

`obsidian` runs a full desktop Obsidian inside a container, streamed to
your browser (KasmVNC) — useful once in a while for graph view, plugin
setup, or editing from a machine that isn't yours. It's `restart: "no"`
on purpose: sync and the webhook don't need it running at all.

```bash
docker compose up -d obsidian    # turn on
docker compose stop obsidian     # turn off — sync never notices
```

Costs ~1GB RAM *only while running*. Log in at `http://<your-server>:3000`
with `WEB_USER` / `WEB_PASSWORD` from `.env`.

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
- **The webhook is the reliable path for automation.** It writes straight
  to CouchDB, so sync is instant regardless of anything else running. A
  file dropped directly onto the vault folder on disk, by contrast, only
  syncs once the `obsidian` container happens to be running to notice
  it — another reason agents should use the webhook, not the filesystem.
- **Stale reverse-proxy configs haunt you.** If you experiment with
  domains/routing, clean up unused Traefik/Caddy config — a forgotten
  rule claiming your domain shows up as random 502s weeks later.

## License

MIT — see [LICENSE](LICENSE). Swap the placeholders in `.env.example`,
point it at your own domain if you use the optional Traefik labels in
`docker-compose.yml`, and it's yours.
