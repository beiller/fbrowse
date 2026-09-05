# fbrowse

**A fast, self-hosted media browser for your videos and images.**

Point fbrowse at any folder — a ComfyUI output dir, a photo library, a render farm — and get a clean, touch-friendly web UI with instant thumbnails, up/down voting, favourites, and drag-and-drop playlists. No database, no accounts, no bloat. One small Node.js server, done.

## Features

- **Video & image browsing** — MP4, WebM, MOV, JPG, PNG, GIF, in a responsive grid
- **On-the-fly video thumbnails** — generated with ffmpeg, cached, and deduplicated; the server never blocks on encoding
- **Voting** — upvote/downvote anything from the grid; a FAV view surfaces your top-scoring files across the whole tree
- **Playlists** — build ordered lists of clips, reorder with drag & drop, play them back in sequence
- **Fullscreen player** — next/prev, repeat, skip-images, auto-hiding controls; works great on phones and tablets
- **Filters** — toggle between All / Video / Image
- **Zero-config persistence** — votes and playlists live in plain JSON under `~/.cache/fbrowse`
- **Secure by default** — all paths are sandboxed to your base directory; nothing escapes it

## Install

**One-liner (from GitHub, no publish needed):**

```bash
npm install -g github:beiller/fbrowse
```

> **npm 12+** disables git-fetch installs by default; use `NPM_CONFIG_ALLOW_GIT=all npm install -g github:beiller/fbrowse` (or set `allow-git=all` in your npm config).

Or run it without installing at all:

```bash
npx github:beiller/fbrowse --dir /path/to/media
```

**From source:**

```bash
git clone https://github.com/beiller/fbrowse.git
cd fbrowse
npm install
```

### Requirements

- Node.js 18+
- That's it — ffmpeg is bundled automatically via `ffmpeg-static` if you don't already have one on your PATH

## Run

```bash
fbrowse --dir /path/to/media
```

Open http://localhost:3000 and browse. Useful variations:

```bash
# different port, reachable from other devices on your network
fbrowse --dir /path/to/media --port 8080 --host 0.0.0.0

# from a source checkout instead of the installed binary
node server.js --dir /path/to/media        # or: npm start
```

## Configuration

Options can be set three ways, in order of precedence: **CLI flags > environment variables > config file > defaults**.

| Option | Flag | Env var | Config key | Default |
|---|---|---|---|---|
| Base directory | `--dir` | `FBROWSE_BASE_DIR` | `baseDir` | current working directory |
| Port | `--port` | `FBROWSE_PORT` | `port` | `3000` |
| Bind host | `--host` | `FBROWSE_HOST` | `host` | `localhost` |
| Thumbnail cache | `--thumb` | `FBROWSE_THUMB_DIR` | `thumbDir` | `~/.cache/fbrowse/thumbs` |
| Vote storage | — | `FBROWSE_VOTE_FILE` | `voteFile` | `~/.cache/fbrowse/votes.json` |
| Playlist storage | — | `FBROWSE_PLAYLISTS_FILE` | `playlistsFile` | `~/.cache/fbrowse/playlists.json` |
| Config file | `--config` | `FBROWSE_CONFIG` | — | `~/.config/fbrowse/config.json` |

### Config file

Create `~/.config/fbrowse/config.json` (or point `--config` elsewhere):

```json
{
  "baseDir": "/path/to/media",
  "port": 8080
}
```

### Command line

```bash
fbrowse --dir ~/Videos --port 8080
fbrowse --help
```

Example combining both:

```bash
FBROWSE_PORT=9000 fbrowse --dir ~/Videos
```

## HTTP API

The UI is a thin client over a small JSON API, handy for scripting:

| Endpoint | Description |
|---|---|
| `GET /list?path=/sub/dir` | List a directory (newest first) |
| `GET /thumb?path=rel/file.mp4&w=300` | Cached video thumbnail (width 64–1280) |
| `GET /media/<path>` | Stream the raw file |
| `GET /scored` | All files with a positive net score, ranked |
| `POST /vote` | `{ path, v: 1 \| -1 \| 0 }` — cast, change, or clear a vote |
| `GET /playlists` | List playlists |
| `POST /playlists` | `{ name }` — create |
| `DELETE /playlists?name=...` | Delete |
| `POST /playlists/add` · `/remove` · `/move` | Manage playlist entries |

## Project layout

```
server.js          Express backend: listing, thumbnails, votes, playlists
public/index.html  UI shell + styles
public/ui.js       Grid rendering, player, voting, playlist UI
```

## License

[MIT](LICENSE)
