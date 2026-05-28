# linea — Build & Maintenance Specification

## What This Is

The reference document for **linea**, a minimalist, writing-focused note-taking PWA backed by Google Sheets. It describes the app as it actually is today (not the original concept), so that any future session or developer can work on it accurately. Read it before changing code.

**Note on history:** the original version of this document described a much simpler, single-device, six-column app with no dark mode and a monospace editor. The app has since grown. This document supersedes that entirely.

---

## Design Philosophy

linea exists for **writing as thinking** — a calm place to start without knowing where the words will go. It is a journal for creating, not a system for organising or referencing. The tool should recede so the thinking comes forward.

- **Warmth comes from typography, colour, and spacing — never decoration or animation.** Noise textures, temporal UI hiding for its own sake, and ornamental flourishes have been explicitly rejected.  
- **In the editor, the screen is just the text.** Chrome (controls, status) appears only when summoned and otherwise gets out of the way.  
- **Calm, quiet, near-white.** Touchstones: Muji, Field Notes, good stationery — but translated honestly to screen, which means near-white rather than saturated cream.  
- Not about being organised; no tags, no folders, no images (unless typed into the note as part of the writing).

---

## Tech Stack

- **Vanilla HTML / CSS / JS** — no frameworks, no build tools, no npm.  
- Split into `index.html`, `css/styles.css`, `js/app.js`.  
- **Google Sheets API** for storage, **Google OAuth 2.0** for auth (client-side only).  
- **PWA** — installable, offline-capable via service worker.  
- **Hosted on GitHub Pages** — user `byatto`, served under `/linea/`.  
- **Devices:** Windows (primary), Android, iPadOS. Cross-device sync is a first-class requirement.

---

## Security Model — CRITICAL

A personal tool handling the user's notes. Security is a top priority.

**Rules:**

- **No server.** Entirely client-side.  
- **Google OAuth** is the only external authentication; tokens handled in-browser, never sent to any third party.  
- **The Google Sheet** inherits Google's access controls — only the user's account can read it.  
- **API credentials** (OAuth client ID) restricted to the GitHub Pages origin.  
- **No analytics, no tracking, no third-party CDN dependencies.**  
- The only permitted external scripts are Google's `apis.google.com/js/api.js` and `accounts.google.com/gsi/client` for OAuth.  
- **Fonts are self-hosted** (see Typography). **Do NOT import fonts from Google Fonts or any external CDN** — this is a deliberate privacy choice, not an oversight.  
- **localStorage** is an offline cache only; Google Sheets is the source of truth.

**Do NOT:** add a server component; deploy anywhere but GitHub Pages; add analytics/tracking; store notes anywhere but Sheets \+ localStorage cache; add npm packages or CDN libraries (except Google auth); link to external fonts.

---

## Google Cloud Setup

Existing Google Cloud project with an OAuth 2.0 Client ID (Web application type).

1. Google Cloud Console → APIs & Services → Credentials.  
2. Edit the OAuth client ID.  
3. Add the GitHub Pages URL to "Authorised JavaScript origins" (e.g. `https://byatto.github.io`).  
4. Ensure the Google Sheets API is enabled.  
5. The Client ID is hardcoded in `app.js` (`CLIENT_ID`). It is safe to expose because it's origin-restricted.

Scope: `https://www.googleapis.com/auth/spreadsheets`. Discovery doc: `https://sheets.googleapis.com/$discovery/rest?version=v4`.

---

## Data Model

### Google Sheet structure

One Sheet, one tab named `Notes`. Row 1 is headers. **Seven columns (A–G):**

| Column | Header | Type | Description |
| :---- | :---- | :---- | :---- |
| A | `id` | string | Unique ID, `n_<timestamp>_<rand>` |
| B | `created` | string | ISO 8601 timestamp |
| C | `updated` | string | ISO 8601 timestamp |
| D | `title` | string | First line of the note (≤80 chars) |
| E | `body` | string | Full note text (plain text) |
| F | `archived` | string | `TRUE` / `FALSE` |
| G | `pinned` | string | `TRUE` / `FALSE` |

- `title` is derived from the first line of `body`; not separately editable.  
- `archived` notes are hidden from the main list (toggle to show, in Settings) but stay in the Sheet.  
- `pinned` notes appear in a Pinned section at the top of the list. **Pinned status lives in column G so it is consistent across devices** — device-local storage was insufficient for this.  
- Flat list otherwise, sorted by `updated` descending, grouped by month in the UI.

### localStorage

- Key `linea_notes`: `{ notes, deletedIds, collapsedMonths, lastSync }`.  
- Key `linea_config`: `{ sheetId }`.  
- Session key `linea_gtoken`: cached OAuth token (sessionStorage).  
- Per-note local-only flag `dirty`: created/edited offline, awaiting sync. Not written to the Sheet.  
- `deletedIds` is a **tombstone list** — IDs of permanently deleted notes, to stop deleted notes being resurrected by a sync from another device.

---

## Sync & Auto-Save

### Auto-save

- **Debounce: 5000 ms** after the user stops typing. (Do not change without explicit instruction.)  
- Only the single changed note is written, not the whole sheet.  
- Offline / signed-out: the note is marked `dirty` and synced when possible.  
- Save status is shown by the editor's **sync indicator icon** (three states — see UI).

### Sync on load / on demand

1. Cached notes render immediately from localStorage (instant open).  
2. `sheetReadAll()` fetches `Notes!A2:G` in the background.  
3. `mergeNotes()` merges local \+ remote:  
   - Last-write-wins by `updated` timestamp.  
   - Tombstoned IDs (`deletedIds`) are never re-added.  
   - **Post-merge pass:** any local note absent from the remote sheet is removed, *unless* it is a `dirty` note not yet written. This is what propagates deletions across devices.  
4. Merged result saved to localStorage and rendered.  
5. Any `dirty` notes are pushed to the Sheet.

### API operations

- Read: `GET Notes!A2:G`.  
- Append (new note): `values.append` to `Notes!A:G`, `RAW`. Row number parsed from the returned `updatedRange`.  
- Update: `values.update` to `Notes!A{row}:G{row}`, `RAW`.  
- Delete: `batchUpdate` with `deleteDimension` on the note's row.  
- A local `rowMap` (`id → row number`) is maintained after each read.  
- 401 → silent token re-request (`handleTokenExpiry`). 404 → "Sheet not found" in Settings.

Rate limits (60 read / 60 write per min) are not a concern with debounced saves.

---

## UI Specification

### Typography

- **Inter throughout** (UI and editor), **self-hosted** in `/fonts/` as woff2 — see Security Model. Loaded via `@font-face` in `styles.css`; regular \+ italic preloaded in `index.html`.  
- Weights **400 and 500 only**.  
- The `linea` wordmark is italic (the one place personality is welcome).  
- Editor body: 16.5px / line-height 1.85 / letter-spacing 0.015em.

### Colour tokens

Light mode:

- bg `#FEFEFD` · surface `#FFFFFF` · text `#2D2926` · muted `#8C857D`  
- border `#E6E3DC` · card-hover `#FAFAF7` · accent (sage) `#6B7F5E` · green (sync) `#4A7C59` · red `#C04040`  
- hairlines `rgba(45,41,38,0.07)`

Dark mode (`prefers-color-scheme: dark`):

- bg `#0E0E10` (near-black, faintly cool — chosen for reading comfort with astigmatism; avoids the halation of pure black) · surface/raised `#1A1A1D` · text `#E6E4E0` · muted `#8E8C88`  
- border `#2A2A2E` · card-hover `#18181B` · accent `#8FA67E` · green `#6BA577`  
- hairlines `rgba(255,255,255,0.07)`

**CSS nesting pitfall:** dark-mode `.note-card` (and similar element) rules must be placed *after* the `@media (prefers-color-scheme: dark) { :root { } }` block closes — never nested inside it.

### Views

**Loading screen** — shown until Google scripts resolve (or a 10 s failsafe in `index.html` force-reveals the app). Background and logo/status colours are inline critical CSS and **must match the token values exactly**.

**1\. List view (home)**

- Sticky top bar: italic `linea` wordmark \+ today's date (e.g. "Wednesday, 27 May"); right side has search (expanding), settings, and "+" new-note.  
- Pinned section (if any), divider, then month-grouped notes (collapsible; collapse state persisted in `collapsedMonths`). Within a month, sub-grouped by date.  
- Note cards: title (first line) \+ 2-line body preview \+ timestamp \+ dirty dot. **No word count.** Tight padding (13px), hairline dividers.  
- Search filters title \+ body, client-side, live.  
- Empty states for "no notes" and "no search matches".

**2\. Editor**

- Full-width `<textarea>`, auto-growing (page scrolls, not the textarea). First line is the title by convention.  
- **No metadata** — no created/updated line, no word count, no save text, no shortcut hint, no divider. Just the writing surface.  
- **Chrome** (back, sync icon, copy, overflow menu) lives in the top bar and **fades after 2 s of mouse stillness**, returns instantly on mouse movement (200 ms ease). Stays hidden while typing. On **touch devices it stays visible** (no hover model). Exit via the chrome or the **Escape** key.  
- **Sync indicator** (top-right, styled like the copy icon), three states:  
  - *pending* — outline circle (save in flight / unconfirmed)  
  - *saved* — filled circle \+ tick (confirmed in the Sheet)  
  - *offline* — cloud with a line through it (saved locally only). **Does not fade** — chrome stays visible while in this state.  
- Overflow menu: Pin/Unpin, Archive, Delete permanently.  
- Ctrl/Cmd+Shift+D inserts a date stamp into the note (kept; just no on-screen hint advertising it).

**3\. Settings (modal)**

- Google account (sign in/out, status).  
- Google Sheet ID (paste; "Copy column headers" helper → tab-separated `id…pinned`).  
- Sync status \+ "Sync now".  
- **Show archived notes** toggle (lives here, not in the main list).  
- Export all as JSON / Import from JSON.  
- Version string in the footer.

**Onboarding** — shown when no Sheet ID is set: explains the Cloud project \+ Sheet requirement (seven headers incl. `pinned`), with a "Copy headers" button, a Sheet-ID input, and Continue.

### Interactions (unchanged essentials)

- New note → opens empty editor; an untitled/empty note is discarded on Back.  
- Copy → copies the full body as plain text; toast confirms.  
- Archive → leaves the list, toast with Undo (5 s).  
- Delete → confirm prompt; removes from Sheet \+ localStorage; tombstoned.

---

## File Structure

linea/

├── index.html          \# App shell \+ inline critical CSS (loading screen)

├── css/

│   └── styles.css      \# All styles, incl. @font-face for Inter

├── js/

│   └── app.js          \# All logic: auth, Sheets API, UI, sync

├── fonts/

│   ├── Inter-Regular.woff2

│   ├── Inter-Medium.woff2

│   └── Inter-Italic.woff2

├── manifest.json       \# PWA manifest

├── sw.js               \# Service worker (cache name bumps per deploy)

├── icons/

│   ├── icon-192.png

│   ├── icon-512.png

│   └── favicon.svg

├── CLAUDE.md           \# This file

└── README.md           \# User-facing setup

---

## Service Worker discipline

- Cache name is versioned (currently **`linea-v4`**). **Bump it on every meaningful deploy** or updates won't come through.  
- Network-first for HTML/CSS/JS (and the `/linea/` root) so updates land; cache-first for static assets (icons, manifest, **fonts**); passthrough (never cache) for Google API/auth calls.  
- **Android update procedure:** reload the tab → close the app fully → reopen.

---

## Preserved decisions — do not alter without explicit instruction

- Auto-save debounce **5000 ms**.  
- Pinned status stored in **Sheet column G** (cross-device).  
- Deletion propagation via the **merge post-pass \+ `deletedIds` tombstones**.  
- Archive toggle lives in the **Settings modal**.  
- **Inter is self-hosted**; never swap to a font CDN.  
- Editor is **chrome-light**: no metadata, fade-on-stillness, three-state sync icon, no "Scribing…" text.  
- Warmth from type/colour/spacing only — no textures or ornamental animation.

---

## Setup (for README)

1. Clone the repo.  
2. Google Cloud Console → Credentials → add `https://byatto.github.io` to authorised origins; ensure Sheets API enabled.  
3. Set `CLIENT_ID` in `js/app.js`.  
4. Create a Google Sheet; rename the first tab to `Notes`.  
5. Row 1 headers (seven): `id`, `created`, `updated`, `title`, `body`, `archived`, `pinned`. (Use the in-app "Copy column headers" button.)  
6. Copy the Sheet ID from its URL.  
7. Push to GitHub; enable Pages (main branch).  
8. Open the app, paste the Sheet ID in Settings, sign in.  
9. Write.

---

## Notes for future work

- Brand/logo redesign is a known future task (the wordmark is fine for now but could be improved).  
- The user (Oliver) is comfortable reading code but prefers **surgical diffs with exact locations** over full-file rewrites, and implements changes incrementally, confirming each step. Keep code clean and commented.  
- Claude has no live GitHub connection; current files must be provided in-conversation (paste or upload) to be worked on accurately.

Make it a pleasure to open every morning.  
