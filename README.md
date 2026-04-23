# 1-Group Marketing Dashboard

A single-file campaign and task management dashboard for the 1-Arden marketing team at CapitaSpring, Singapore. No backend, no build step — just HTML, CSS, and vanilla JavaScript, hosted on GitHub Pages and synced via JSONBin.

**Live:** https://calmriots.github.io/Daryl-s-Dashboard/

---

## What it is

Command centre for marketing workstreams across the four 1-Arden venues (Arden Bar and Lounge, Kaarla, Oumi, Sol and Luna) and the wider 1-Group portfolio. Campaigns, tasks, requests, and production briefs all live in one shared workspace with role-based access for 1-Group staff.

Two files do the whole job: `index.html` holds the shell, styles, and auth screens; `app.js` holds everything else — state, sync, routing, render, mutations.

---

## Features

**Views**

- **Today** — overdue, due-today, and recently-completed tasks in one glance
- **My work** — your assigned tasks, grouped by urgency
- **Upcoming** — rolling 7-day task forecast
- **Inbox** — tasks not yet tied to a campaign
- **Calendar** — monthly grid with per-day task chips
- **Requests** — inbound work from other teams, with accept/reject flow
- **Dashboard** — campaign KPIs, Gantt roadmap, active-campaign summary
- **Campaigns** — full list with filtering and expandable task drawers
- **Smart lists** — saved text-match filters

**Content model**

- **Campaigns** with hero image, colour accent, status, date range, description, links, and nested tasks grouped by category
- **Tasks** with status, priority, due date, start date, assignees, notes, sub-tasks, labels, links, and comments
- **Links** — attach named URLs to any task or campaign
- **Categories** — customisable nav taxonomy (Creative, Content, Digital, Web, Events, PR, etc.)
- **Labels** — colour-tagged cross-cutting markers

**Collaboration**

- Three access tiers with CSS + JS-enforced read-only mode for members
- Live sync via JSONBin (15-second polling plus debounced writes)
- Shareable URL via `?bin=` parameter
- Comments on every task
- Drag-sort for team members, labels, and categories in Settings

---

## Access tiers

| Tier | Who | Sign-in | Permissions |
|---|---|---|---|
| **Owner** | `daryl.xie@1-group.sg` | Email + password | Full edit, plus manage sub-admins |
| **Admin** | Any `@1-group.sg` email the owner adds | Email only | Full edit |
| **Member** | Any other `@1-group.sg` email | Email only | Read-only |

The owner password is verified client-side via SHA-256 using the Web Crypto API. Sub-admin emails are stored in the shared bin and resolved at load time, so adding someone takes effect on their next sign-in.

Member read-only mode applies a `body.readonly-user` CSS class that hides edit buttons and disables inputs. `requireEdit()` is the source-of-truth JS gate and runs on every mutation — CSS alone would be trivial to bypass; the JS gate is what actually protects the data.

Non-`@1-group.sg` emails are rejected at the gate.

---

## Tech stack

- Vanilla JavaScript, HTML, CSS — no framework, no build step
- Space Grotesk + Inter from Google Fonts
- JSONBin.io for shared state (free tier: 5 MB per bin, private bins)
- GitHub Pages for hosting
- Mammoth.js for `.docx` parsing in the brief panel
- Web Crypto API for SHA-256 password verification

---

## File structure

```
/
├── index.html          App shell, styles, auth + setup screens
├── app.js              All application logic (~1,900 lines)
├── assets/
│   ├── logos.js        Base64-encoded 1-Group logos (navy + white)
│   ├── 1group-logo.png
│   └── 1group-logo-white.png
├── legacy-dump.json    Reference snapshot for migration
└── README.md
```

---

## Setup

### First-time connect

1. Open the live URL
2. Enter your `@1-group.sg` email (owner also enters password)
3. Paste a JSONBin master key (get one free at [jsonbin.io](https://jsonbin.io))
4. If a `?bin=` param is in the URL, the existing workspace loads; otherwise a new private bin is created and the shareable URL is copied to clipboard

The email, master key, and bin ID are stored in `localStorage` on that device only. They never leave the browser.

### Share with the team

After first setup, the URL contains `?bin=<id>`. Send that URL plus the master key to teammates. They sign in with their own `@1-group.sg` email and paste the same master key — each device remembers its own credentials.

### Deploy an update

1. Edit `index.html` or `app.js` locally
2. Commit and push to the GitHub Pages repo
3. Hard-refresh the live URL (Cmd/Ctrl + Shift + R)

Existing bin data is preserved. New fields on tasks and campaigns are backfilled automatically on load via `hydrateState()`.

---

## Data model

State is persisted as a single JSON object per bin with these top-level keys:

- `team` — members with `id`, `name`, `email`, `role`, `color`
- `categories` — navigation taxonomy with `id`, `name`, `color`, `icon`
- `labels` — colour-tagged markers
- `campaigns` — with nested tasks (lifted flat into `tasks[]` on hydrate)
- `tasks` — flat list, optionally linked to a campaign via `campaignId`
- `requests` — inbound work requests
- `smartFilters` — saved text-match filters
- `admins` — array of sub-admin email strings (owner-managed)
- `_revision` — monotonic counter for conflict detection during polling

Legacy records (string-only team names, old `cats`/`who`/`desc` field names) are normalised at load time. Team members without emails have one generated from their name (e.g. `Chef Jit Seng` → `chef.jit.seng@1-group.sg`).

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | Open quick-add (outside form fields) |
| `Esc` | Close modal, quick-add, or settings |
| `Enter` | Submit auth or setup fields |

---

## Known constraints

- **5 MB per JSONBin.** Base64-encoded campaign images count toward this limit — compress anything large before attaching.
- **Brief parser runs via copy-paste** (Path 2 in the original design) — no Anthropic API key required, works with an existing Claude.ai session.
- **Last-write-wins on the 15-second poll.** Two teammates editing the same field simultaneously can lose data. Refresh after heavy parallel editing.
- **Read-only enforcement is client-side only.** A determined member could patch around the CSS and JS gates locally, but cannot write to the bin without the JSONBin master key.

---

## Version history

### v11 — April 2026 (current)

The 12-point auth rebuild:

- 3-tier access control (owner / admin / member) with SHA-256 password gate for the owner
- `requireEdit()` gates on 33 mutation entry points, `requireOwner()` on admin management
- `body.readonly-user` CSS layer that hides edit affordances for members
- Admins section in Settings (owner only)
- Links on tasks and campaigns, with inline display on campaign cards
- My Work view with live sidebar count
- Drag-sort for team, labels, and categories in Settings
- Legacy email migration on hydrate

### v10 — April 2026

Task descriptions with expand/collapse, task start dates, phase colour coding on the Gantt, campaign image thumbnails, sidebar cleanup.

### v9 — April 2026

Sticky sidebar, launch date with TBC toggle, sort-by-launch.

### v8 — April 2026

Multi-venue campaigns, comments at campaign and task level, drag-to-reorder campaigns, results tracker with past-period history.

### v7 — April 2026

Comments system, name-required on comments, edit flow.

### v6 — April 2026

First full build: dynamic categories, hamburger nav, manual campaign creation, campaign-level links.

---

Built for the 1-Arden marketing team by Daryl.
