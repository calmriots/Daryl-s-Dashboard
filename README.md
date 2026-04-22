# 1-Group Marketing Dashboard

A Superlist-inspired marketing command center for the 1-Group team. Single-page HTML app with live JSONBin-backed multi-device sync.

## Features
- **Today / Upcoming / Inbox / Calendar / Dashboard** views
- **Campaigns** with Gantt roadmap, category grouping, progress tracking
- **Requests** — accept/reject incoming work, auto-convert to tasks
- **Sub-tasks, labels, priorities, rich notes, comments, assignees**
- **Quick-add FAB** (press `N` anywhere)
- **Smart lists** — saved searches in the sidebar
- **Light + dark themes** with auto logo swap
- **Live sync** via JSONBin (15s poll) — share workspace by URL
- **Mobile optimized** — off-canvas sidebar, touch targets, responsive layouts

## Setup

1. Open `index.html` in a browser (or host on any static file server / GitHub Pages).
2. Get a free master key at [jsonbin.io](https://jsonbin.io).
3. Paste the key — a new shared workspace is created.
4. Share the resulting URL (with `?bin=...`) with teammates; they enter their own key to join.

## Files
- `index.html` — shell, styles, setup screen
- `app.js` — state, sync, routing, all view renderers
- `assets/` — 1-Group logos (light + white)

## Deploy to GitHub Pages
1. Push to `main`
2. Settings → Pages → Source: `main` / root
3. Visit `https://<user>.github.io/<repo>/`

## Tech
Plain HTML + vanilla JS, no build step. Fonts: Space Grotesk + Inter (Google Fonts). DOCX parsing uses mammoth.js.
