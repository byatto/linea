# linea — Visual Redesign Implementation Spec

**Audience:** the implementing developer (Sonnet). **Author:** design review session with Oliver. **Status:** approved for implementation. Build in the order given. Confirm each file section works on-device before moving to the next where practical.

---

## 0\. Context & intent — read this first

linea is a writing-first journal. Not an organiser, not a reference tool. The user opens it to *think by writing* — to start without knowing where the words will go. Every UI element must justify itself against one question: **does this help me write, or am I just looking at it?** When in doubt, remove it.

This redesign does not change behaviour or data. It is purely a shift in **look and feel**, plus the removal of editor "chrome" (metadata, hints) that competes with the writing. The philosophy:

- **Warmth comes from typography, colour, and spacing — never decoration or animation.** No textures, no flourishes.  
- **The tool recedes so the thinking comes forward.** In the editor, when the user is writing or thinking, the screen should be *just the text*.  
- **Calm, quiet, almost-white.** The previous parchment tone (`#F5F1E8`) read as muddy on screen; we are moving to a near-white with only a hint of warmth.

**Do not** introduce features, change the sync/merge logic, alter the auto-save debounce (stays 5000 ms), rename the storage keys, or touch the Google auth flow. This is a reskin plus an editor-chrome behaviour change.

**Critical constraint (security model):** linea has a hard rule against external CDN dependencies and external font imports — see CLAUDE.md "Security Model". The new font (Inter) is therefore **self-hosted**, not loaded from Google Fonts. Do not "simplify" this by linking to `fonts.googleapis.com`; that would violate the security model. Details in §3.

---

## 1\. Summary of every change

| Area | Change |
| :---- | :---- |
| Font | Charter (editor) and Optima (UI) → **Inter throughout**, self-hosted. The italic `linea` wordmark is the one exception (keeps its character). |
| Light background | `#F5F1E8` → **`#FEFEFD`** (near-white, hint of warmth) |
| Dark background | `#1E1B17` (warm brown) → **`#0E0E10`** (near-black, faintly cool) |
| Card hover (light) | generic tint → **`#FAFAF7`** (barely-there) |
| Editor metadata | **Removed entirely** — no divider, no created/updated, no word count, no "Scribing…" text, no shortcut hint |
| Editor chrome | back/copy/overflow buttons **fade after 2 s of mouse stillness**, return on movement; stay visible on touch; stay hidden while typing |
| Sync indicator | new **three-state icon** in top-right of editor chrome: pending (outline circle) → saved (filled tick) → offline (cloud-with-line). Offline state does **not** fade. |
| List cards | word count **removed**; preview kept; tighter padding (13 px) |
| Pinned section | divider added below it (already present via `.pinned-section` border — verify) |
| SW cache | `linea-v3` → **`linea-v4`**; add font files to asset list |
| manifest | `background_color`/`theme_color` → new palette |
| Docs | `CLAUDE.md` full rewrite (separate file provided); `README.md` header fix \+ font note |

---

## 2\. Design tokens — the single source of truth

Replace the `:root` and dark-mode token blocks in `styles.css` with these. All other rules reference these variables, so most of the reskin happens here.

### Light mode (`:root`)

\--bg:           \#FEFEFD;   /\* was \#F5F1E8 — near-white, hint of warmth \*/

\--bg-subtle:    \#F7F6F2;   /\* was \#EDE9DF — for any subtle raised area \*/

\--surface:      \#FFFFFF;   /\* was \#FDFBF6 — modals/cards sit just above bg \*/

\--text:         \#2D2926;   /\* unchanged — reads well on the new bg \*/

\--text-muted:   \#8C857D;   /\* unchanged \*/

\--border:       \#E6E3DC;   /\* was \#DDD8CE — lighter, to suit the paler bg \*/

\--accent:       \#6B7F5E;   /\* unchanged sage \*/

\--accent-hover: \#5A6D4F;   /\* unchanged \*/

\--accent-soft:  \#E8ECE4;   /\* unchanged \*/

\--green:        \#4A7C59;   /\* unchanged — sync tick \*/

\--red:          \#C04040;   /\* unchanged \*/

\--card-hover:   \#FAFAF7;   /\* was rgba(0,0,0,0.025) — now a flat near-white shade \*/

Keep `--radius`, `--max-w`, `--transition`, `--view-transition` as they are.

**Font tokens** (replace the three font vars):

\--font-ui:      'Inter', system-ui, \-apple-system, 'Segoe UI', sans-serif;

\--font-editor:  'Inter', system-ui, \-apple-system, 'Segoe UI', sans-serif;

\--font-mono:    'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;  /\* unchanged — used for code/IDs only \*/

(UI and editor are deliberately the same now — one voice across the app.)

### Dark mode (`@media (prefers-color-scheme: dark) { :root { … } }`)

\--bg:           \#0E0E10;   /\* was \#1E1B17 — near-black, faintly cool \*/

\--bg-subtle:    \#161619;   /\* was \#252219 \*/

\--surface:      \#1A1A1D;   /\* was \#28241E — raised surfaces (cards/modals) \*/

\--text:         \#E6E4E0;   /\* was \#E8E2DA — cooled slightly to match cool bg \*/

\--text-muted:   \#8E8C88;   /\* was \#918A82 — neutralised \*/

\--border:       \#2A2A2E;   /\* was \#3D3830 \*/

\--accent:       \#8FA67E;   /\* unchanged \*/

\--accent-hover: \#A0B590;   /\* unchanged \*/

\--accent-soft:  \#22241F;   /\* was \#2A2E26 \*/

\--green:        \#6BA577;   /\* unchanged — sync tick \*/

\--red:          \#D46B6B;   /\* unchanged \*/

\--card-hover:   \#18181B;   /\* was rgba(255,255,255,0.03) — flat near-black-raised \*/

### Typography specifics (unchanged from current, restated for clarity)

- Editor body: `font-size: 16.5px; line-height: 1.85; letter-spacing: 0.015em;` — **keep these**. (Inter at this tracking reads calmly; do not tighten.)  
- Weights used app-wide: **400 and 500 only**. No 600/700. (The current `.modal-header h2`, `.pinned-heading`, `.settings-section h3`, `.month-group-heading` use 600 — change these to 500\. The bold in note-card titles is already 500.)  
- The `linea` wordmark (`.app-name` and `#loading-screen .logo`) keeps `font-weight: 300; font-style: italic;` and continues to use Inter (Inter's italic 300 is clean; acceptable). If its character is lost, that's fine — the brand-logo redesign is a separate future task.

---

## 3\. Self-hosting Inter — exact steps

**Why self-host (do not skip):** the security model forbids external CDN/font imports so that no third party can observe the user's usage. Inter must be served from the app's own origin.

### 3.1 Get the font files

Use the official Inter release (SIL Open Font License — redistribution is permitted). Download from the Inter GitHub releases (`github.com/rsms/inter`) or the rsms.me/inter site. You need the **variable** or **static** web fonts in **woff2**. Minimum set (static, simplest):

- `Inter-Regular.woff2` (weight 400\)  
- `Inter-Medium.woff2` (weight 500\)  
- `Inter-Italic.woff2` (weight 400 italic — for the wordmark)

(If you prefer the variable font, `InterVariable.woff2` \+ `InterVariable-Italic.woff2` works too; adjust the `@font-face` accordingly. Static is fine and simpler.)

### 3.2 Where they go

Create a new folder `fonts/` at the repo root:

linea/

├── fonts/

│   ├── Inter-Regular.woff2

│   ├── Inter-Medium.woff2

│   └── Inter-Italic.woff2

### 3.3 `@font-face` block

Add at the very top of `styles.css`, before `:root`:

/\* ── INTER (self-hosted — see security model in CLAUDE.md) ── \*/

@font-face {

  font-family: 'Inter';

  font-style: normal;

  font-weight: 400;

  font-display: swap;

  src: url('../fonts/Inter-Regular.woff2') format('woff2');

}

@font-face {

  font-family: 'Inter';

  font-style: normal;

  font-weight: 500;

  font-display: swap;

  src: url('../fonts/Inter-Medium.woff2') format('woff2');

}

@font-face {

  font-family: 'Inter';

  font-style: italic;

  font-weight: 300;

  font-display: swap;

  src: url('../fonts/Inter-Italic.woff2') format('woff2');

}

Note the path is `../fonts/` because `styles.css` lives in `css/`. The italic face is mapped to weight 300 to match the wordmark's declared weight; the browser will synthesise the lighter weight from the 400 italic, which is acceptable for a single small wordmark. (If you'd rather be exact, ship `Inter-LightItalic.woff2` at weight 300.)

### 3.4 Preload (perceived performance)

In `index.html` `<head>`, after the manifest link and before the stylesheet link, add a preload for the two faces that appear immediately (regular \+ the italic wordmark on the loading screen):

\<link rel="preload" href="fonts/Inter-Regular.woff2" as="font" type="font/woff2" crossorigin\>

\<link rel="preload" href="fonts/Inter-Italic.woff2" as="font" type="font/woff2" crossorigin\>

(Path here is `fonts/…` — no `../` — because `index.html` is at the repo root.)

### 3.5 Loading-screen font

In the inline critical CSS in `index.html` (lines \~20–39), the `body` font-family is currently `Optima, 'Segoe UI', …`. The loading screen renders **before** `styles.css` loads, so it can't rely on the `@font-face` there reliably, but since we preload Inter it will usually be ready. Update the inline `body` rule to:

body { margin: 0; background: \#FEFEFD; font-family: 'Inter', system-ui, \-apple-system, 'Segoe UI', sans-serif; }

And the dark-mode line just below it:

@media (prefers-color-scheme: dark) { body { background: \#0E0E10; } }

See §5 for the rest of the loading-screen colour updates.

---

## 4\. `styles.css` — section-by-section

After the token swap (§2) and `@font-face` add (§3.3), most rules inherit correctly. The explicit edits remaining:

### 4.1 Dark-mode `.note-card` border (around current line 40\)

The standalone dark block currently reads:

@media (prefers-color-scheme: dark) {

  .note-card { border-bottom: 1px solid rgba(255,255,255,0.06); }

}

Keep it, but change the value to `rgba(255,255,255,0.07)` to match the agreed hairline. (Light-mode card border below also moves to `rgba(45,41,38,0.07)` — see 4.4.) **Placement reminder:** this block must stay *outside/after* the `@media (prefers-color-scheme: dark){ :root{} }` block, never nested inside it. (Known pitfall.)

### 4.2 Selection colour

Unchanged — the sage `::selection` still works on both new backgrounds.

### 4.3 Card hover

`.note-card:hover { background: var(--card-hover); }` already references the token, which now resolves to `#FAFAF7` (light) / `#18181B` (dark). No rule change needed — the token does the work.

### 4.4 Note card border \+ padding

Current `.note-card`:

.note-card {

  padding: 16px 14px;

  margin: 3px 0;

  …

  border-bottom: 1px solid rgba(0,0,0,0.06);

}

Change to:

.note-card {

  padding: 13px 14px;          /\* tightened from 16px \*/

  margin: 2px 0;               /\* tightened from 3px \*/

  …

  border-bottom: 1px solid rgba(45,41,38,0.07);   /\* agreed hairline \*/

}

### 4.5 Pinned-section divider

`.pinned-section` already has `border-bottom: 1px solid var(--border);` — this is the divider below the Pinned group. Verify it renders; with the lighter `--border` it may be too faint. If so, use `border-bottom: 1px solid rgba(45,41,38,0.07);` to match the card hairlines (and a dark-mode equivalent). Keep the existing `padding-bottom`/`margin-bottom`.

### 4.6 Weights → 500

Change `font-weight: 600` → `500` in: `.modal-header h2`, `.pinned-heading`, `.settings-section h3`, `.month-group-heading`. (Search the file for `600`.)

### 4.7 Editor — remove metadata styling

The editor metadata row is being removed from the DOM (see §5), so these rules become dead. **Delete** the following blocks from `styles.css`:

- `.editor-meta { … }`  
- `.word-count { … }`  
- `.save-indicator { … }` and `.save-indicator.visible { … }`  
- `.shortcut-hint { … }` and `.shortcut-hint.visible { … }`

Keep `.note-textarea` and `.editor-wrap` (but see 4.8 for padding).

### 4.8 Editor chrome — new fade behaviour (CSS half)

The editor header (`#header-editor`) currently sits in the sticky `#top-bar`. For the fade-on-stillness behaviour we keep it where it is structurally but drive its visibility with a class on a container. Add:

/\* Editor chrome fade. JS toggles .chrome-hidden on \#top-bar while in editor view. \*/

\#top-bar.chrome-hidden \#header-editor { opacity: 0; pointer-events: none; }

\#header-editor { transition: opacity 200ms ease; }

Note: only `#header-editor` fades, never `#header-list`. The JS only adds `.chrome-hidden` while the editor view is active, so the list header is unaffected.

The sync icon's "offline" exception (it must stay visible even when chrome is hidden) is handled in JS by *not* entering the hidden state while offline — see §6.4. No extra CSS needed.

### 4.9 Sync icon styling

Add styling for the new sync indicator button (markup in §5). It mirrors the existing `.btn-copy-icon` look:

.btn-sync-icon {

  width: 32px; height: 32px;

  display: flex; align-items: center; justify-content: center;

  border-radius: var(--radius);

  color: var(--text-muted);

  opacity: 0.5;

  transition: opacity var(--transition), color var(--transition);

}

.btn-sync-icon.state-saved   { color: var(--green); opacity: 0.9; }

.btn-sync-icon.state-pending { opacity: 0.5; }

.btn-sync-icon.state-offline { color: var(--text-muted); opacity: 0.9; }

.btn-sync-icon svg { display: block; }

### 4.10 Responsive / scrollbar / toast

No changes needed — all reference tokens.

---

## 5\. `index.html` — markup changes

### 5.1 Loading-screen colours (inline CSS, lines \~20–38)

- `body` background → `#FEFEFD`; font-family → Inter stack (done in §3.5)  
- dark `body` background → `#0E0E10`  
- `#loading-screen` background → `#FEFEFD`  
- dark `#loading-screen` background → `#0E0E10`  
- `.logo` colour stays `#2D2926` (light) / dark logo colour: change `#E8E2DA` → `#E6E4E0` to match new dark `--text`  
- `.status` colour light stays `#8C857D`; dark `#918A82` → `#8E8C88`

These must match the new token values exactly (the comment in the file already says so).

### 5.2 theme-color meta tags (lines 6–7)

\<meta name="theme-color" content="\#FEFEFD" media="(prefers-color-scheme: light)"\>

\<meta name="theme-color" content="\#0E0E10" media="(prefers-color-scheme: dark)"\>

### 5.3 Font preload (§3.4)

Add the two `<link rel="preload">` lines in `<head>`.

### 5.4 Editor header — add sync icon

In `#header-editor` → `.header-actions` (lines \~89–104), add the sync indicator as the **first** child of `.header-actions` (so it sits left of Copy). Initial state is pending/outline; JS updates it.

\<button id="btn-sync" class="btn-sync-icon state-pending" title="Sync status" aria-label="Sync status" disabled\>

  \<svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"\>

    \<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/\>

  \</svg\>

\</button\>

(`disabled` because it's an indicator, not a button. JS swaps its inner SVG \+ class per state — see §6.4.)

### 5.5 Editor metadata — remove

Delete the entire `.editor-meta` block and the `#shortcut-hint` div (lines \~134–141):

\<\!-- DELETE from here \--\>

        \<div class="editor-meta"\>

          \<span id="meta-created"\>\</span\>

          \<span id="meta-updated"\>\</span\>

          \<span id="save-indicator" class="save-indicator"\>\</span\>

          \<span id="word-count" class="word-count"\>\</span\>

        \</div\>

      \</div\>

      \<div id="shortcut-hint" class="shortcut-hint"\>\</div\>

\<\!-- to here \--\>

…leaving the `.editor-wrap` containing only the `<textarea>`. Keep the closing `</div>` for `.editor-wrap` and the `</main>`. Result:

    \<main id="view-editor" style="display:none"\>

      \<div class="editor-wrap"\>

        \<textarea

          id="note-body"

          class="note-textarea"

          placeholder="Start writing…"

          spellcheck="true"

          autocorrect="on"

          autocapitalize="sentences"

          lang="en"

        \>\</textarea\>

      \</div\>

    \</main\>

### 5.6 App version string (line \~203)

Bump `linea · v1.1` → `linea · v1.2` to reflect the redesign. (Cosmetic.)

---

## 6\. `app.js` — changes

### 6.1 Remove dead metadata code (SPEC — you write it)

With the metadata DOM gone, these functions and calls become dead. Remove or neuter them:

- **`renderEditorMeta(note)`** (≈ lines 599–604): delete the function and its two call sites (in `openEditor`, ≈ line 588; and in `insertDateStamp`, ≈ line 978).  
- **`updateWordCount(body)`** (≈ lines 606–611): delete the function and its call sites (in `openEditor` ≈ line 589; in the textarea `input` handler ≈ line 1030; in `insertDateStamp` ≈ line 979).  
- **`showShortcutHint()`** (≈ lines 613–620): delete the function and its call site in `openEditor` (≈ line 591).  
- **`wordCount()`** helper (≈ lines 88–91): still used by `buildNoteCard`'s meta line *unless* you remove that too — see 6.2. If 6.2 removes the only remaining use, delete `wordCount` as well. (It's also used nowhere else after these removals — verify with a search.)

Leave `insertDateStamp`'s core behaviour intact (the Ctrl/Cmd+Shift+D insertion still works); just drop its now-dead `renderEditorMeta`/`updateWordCount` tail calls.

### 6.2 Note card meta — remove word count (SPEC)

In `buildNoteCard` (≈ line 651), the meta line is:

\<div class="note-card-meta"\>${pinIndicator}${time} · ${wordCount(note.body)} w${note.dirty ? ' · ●' : ''}\</div\>

Change to drop the word count, keeping time, pin indicator, and the dirty dot:

\<div class="note-card-meta"\>${pinIndicator}${time}${note.dirty ? ' · ●' : ''}\</div\>

### 6.3 `setSaveIndicator` → drive the sync icon (SPEC for removal, FULL CODE in 6.4)

The current `setSaveIndicator(status)` (≈ lines 444–459) targets the now-deleted `#save-indicator` text span and uses the word "Scribing…". **Replace it entirely** with the new `setSyncState` function in §6.4. Update its call sites:

- `scheduleSave` (≈ line 415): currently `setSaveIndicator('scribing')` → `setSyncState('pending')`  
- `performSave` offline branch (≈ line 425): `setSaveIndicator('saved')` → `setSyncState('offline')` *(Note: the offline branch currently calls `'saved'`; it should reflect that the note is only saved locally → `'offline'`.)*  
- `performSave` end (≈ line 441): `setSaveIndicator(ok ? 'saved' : 'offline')` → `setSyncState(ok ? 'saved' : 'offline')`

Also remove the `'scribing'` concept entirely — no text anywhere.

### 6.4 FULL CODE — sync indicator \+ chrome fade controller

Add this block (e.g. replacing the old `setSaveIndicator` and sitting near the editor/view code). It is self-contained and uses only existing globals (`state`, `document`).

// ─── SYNC INDICATOR (three states) ────────────────────────────────────────────

// Drives the \#btn-sync icon in the editor chrome.

//   'pending' → outline circle (saving / not yet confirmed)

//   'saved'   → filled circle \+ tick (confirmed in the Sheet)

//   'offline' → cloud with a line through it (saved locally only); never fades

let syncState \= 'saved';

const SYNC\_SVG \= {

  pending: '\<circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/\>',

  saved:   '\<circle cx="8" cy="8" r="6.5" fill="rgba(74,124,89,0.12)" stroke="currentColor" stroke-width="1.2"/\>\<path d="M5 8L7 10L11 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/\>',

  offline: '\<path d="M4.5 11.5h7a2.5 2.5 0 0 0 .3-4.98A3.5 3.5 0 0 0 5 5.6a2.5 2.5 0 0 0-.5 5.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/\>\<line x1="2.5" y1="2.5" x2="13.5" y2="13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/\>',

};

const SYNC\_TITLE \= {

  pending: 'Saving…',

  saved:   'Synced to Google Sheets',

  offline: 'Saved locally — not synced',

};

function setSyncState(stateName) {

  syncState \= stateName;

  const btn \= document.getElementById('btn-sync');

  if (\!btn) return;

  const svg \= btn.querySelector('svg');

  if (svg) svg.innerHTML \= SYNC\_SVG\[stateName\] || SYNC\_SVG.pending;

  btn.classList.remove('state-pending', 'state-saved', 'state-offline');

  btn.classList.add('state-' \+ stateName);

  btn.title \= SYNC\_TITLE\[stateName\] || '';

  // If we just went offline, make sure the chrome is visible so the user sees it.

  if (stateName \=== 'offline') showChrome();

}

// ─── EDITOR CHROME FADE ────────────────────────────────────────────────────────

// Chrome (\#header-editor) fades out after 2s of mouse stillness while in the

// editor. Returns instantly on mouse movement. Stays visible on touch devices.

// Stays hidden while typing (typing does not count as "movement"). Never hides

// while the sync state is 'offline'.

let chromeFadeTimer \= null;

let isTouchDevice \= false;

const CHROME\_FADE\_MS \= 2000;

function isEditorOpen() {

  const ed \= document.getElementById('view-editor');

  return ed && ed.style.display \!== 'none';

}

function showChrome() {

  const bar \= document.getElementById('top-bar');

  if (bar) bar.classList.remove('chrome-hidden');

}

function hideChrome() {

  if (isTouchDevice) return;            // never auto-hide on touch

  if (syncState \=== 'offline') return;  // keep visible while offline

  if (\!isEditorOpen()) return;

  const bar \= document.getElementById('top-bar');

  if (bar) bar.classList.add('chrome-hidden');

}

function scheduleChromeHide() {

  clearTimeout(chromeFadeTimer);

  chromeFadeTimer \= setTimeout(hideChrome, CHROME\_FADE\_MS);

}

// Call when entering the editor.

function startChromeFade() {

  showChrome();

  if (\!isTouchDevice) scheduleChromeHide();

}

// Call when leaving the editor.

function stopChromeFade() {

  clearTimeout(chromeFadeTimer);

  showChrome(); // reset to visible for next time / for the list header

}

function handleChromePointerMove() {

  if (\!isEditorOpen()) return;

  showChrome();

  scheduleChromeHide();

}

### 6.5 FULL CODE — wiring the chrome fade (add inside `wireEvents`)

Add near the other editor wiring in `wireEvents` (e.g. just after the textarea `input` handler, ≈ line 1032):

  // ── Editor chrome fade ──

  // Detect touch once: if the device sends a touchstart, treat as touch (chrome stays visible).

  window.addEventListener('touchstart', () \=\> { isTouchDevice \= true; showChrome(); }, { once: true, passive: true });

  // Mouse movement anywhere reveals chrome and resets the fade timer (editor only).

  document.addEventListener('mousemove', handleChromePointerMove, { passive: true });

  // Escape leaves the editor (same as Back).

  document.addEventListener('keydown', (e) \=\> {

    if (e.key \=== 'Escape' && isEditorOpen()) {

      e.preventDefault();

      document.getElementById('btn-back').click();

    }

  });

Note: there is already a `keydown` listener for Ctrl/Cmd+Shift+D and Cmd+K (≈ line 1152). You may either add the Escape branch there or keep this separate listener — both work. If adding to the existing one, guard Cmd+K with `!isEditorOpen()` as it already does via `!state.currentNoteId`.

### 6.6 Hook fade start/stop into view transitions (SPEC)

- In `openEditor` (≈ line 576): after `showView('editor')` and the focus calls, call `startChromeFade();`. Remove the now-deleted `renderEditorMeta`, `updateWordCount`, `showShortcutHint` calls (per 6.1) and replace that tail with `startChromeFade();` plus the still-needed `updatePinMenuLabel(note);`.  
- In `showView('list')` path / the Back button handler (≈ line 1003\) and anywhere we return to the list: call `stopChromeFade();`. Simplest: add `stopChromeFade();` inside `showView` at the top of the `if (view === 'list')` branch.

### 6.7 Initial sync state on opening a note (SPEC)

When `openEditor` runs, set an honest initial icon: if the note is `dirty` or the user is offline/signed-out, `setSyncState('offline')`; else `setSyncState('saved')`. Add to `openEditor` after `startChromeFade()`:

  if (\!navigator.onLine || \!state.isSignedIn) setSyncState('offline');

  else setSyncState(note.dirty ? 'pending' : 'saved');

---

## 7\. `sw.js` — service worker

### 7.1 Bump cache version

const CACHE \= 'linea-v4';   // was 'linea-v3'

### 7.2 Add fonts to the precache list

Add the three font files to `ASSETS`:

const ASSETS \= \[

  '/linea/',

  '/linea/index.html',

  '/linea/css/styles.css',

  '/linea/js/app.js',

  '/linea/manifest.json',

  '/linea/icons/icon-192.png',

  '/linea/icons/icon-512.png',

  '/linea/icons/favicon.svg',

  '/linea/fonts/Inter-Regular.woff2',

  '/linea/fonts/Inter-Medium.woff2',

  '/linea/fonts/Inter-Italic.woff2',

\];

### 7.3 Fetch handler

The existing cache-first branch for "everything else" already covers `.woff2` (they're not html/css/js and not Google API calls), so fonts will be served cache-first. No handler change needed. Just confirm woff2 isn't accidentally caught by the network-first branch — it isn't (that branch only matches `.html`/`.css`/`.js`/the root).

---

## 8\. `manifest.json`

"background\_color": "\#FEFEFD",

"theme\_color": "\#FEFEFD",

(Both currently `#F5F1E8`.) Leave everything else. Note: PWA manifest `background_color` is the splash background; using the light value is standard even though dark mode exists — the OS handles dark splash separately and there's no per-scheme manifest field.

---

## 9\. Documentation

### 9.1 `CLAUDE.md`

Full rewrite provided as a separate file (`CLAUDE_REWRITE.md`). Replace the repo's `CLAUDE.md` with it. It reflects: multi-device reality, column G (`pinned`), the merge \+ tombstone sync, the Settings-based archive toggle, 5000 ms debounce, dark mode, Inter (self-hosted), the editor-chrome behaviour, and the new palette.

### 9.2 `README.md`

The repo currently has no `README.md` in the zip. If one exists elsewhere, fix the setup step that lists the sheet headers — it must include `pinned` as the 7th column:

In row 1, add headers: `id`, `created`, `updated`, `title`, `body`, `archived`, `pinned`

And add a one-line note: "Fonts: Inter is self-hosted in `/fonts/` (woff2). Do not replace with a Google Fonts link — see the security model in CLAUDE.md." If no README exists, creating a short one from CLAUDE.md's setup section is a nice-to-have, not required.

---

## 10\. Verification checklist

Do this per change-group; full pass at the end on each device.

**Visual / light mode (Windows primary):**

- [ ] Background is near-white `#FEFEFD`, not the old parchment, everywhere (list, editor, modals).  
- [ ] Body text renders in Inter (not Charter/serif). Check a note's body in the editor.  
- [ ] `linea` wordmark still italic.  
- [ ] Note cards: tighter padding, hairline dividers, **no word count**, preview present.  
- [ ] Divider visible below the Pinned section.  
- [ ] Card hover shows the barely-there `#FAFAF7` shade.

**Editor chrome:**

- [ ] On entering a note, chrome is visible; after \~2 s of not moving the mouse, it fades (200 ms).  
- [ ] Moving the mouse brings it back instantly.  
- [ ] While typing (mouse still), chrome stays hidden.  
- [ ] Escape exits the note (saves/return to list as Back does).  
- [ ] No created/updated line, no word count, no "Scribing…", no shortcut hint anywhere in the editor.

**Sync icon:**

- [ ] Top-right of editor shows outline circle while a save is pending.  
- [ ] Becomes filled tick after the Sheet write confirms.  
- [ ] Go offline (DevTools → Network → Offline, or airplane mode): icon becomes cloud-with-line **and chrome stays visible** (does not fade).  
- [ ] Back online \+ signed in: returns to tick after next save/sync.

**Dark mode:**

- [ ] OS dark mode → background near-black `#0E0E10` (cool), not warm brown.  
- [ ] Text legible, no halation for the user (this is the astigmatism-friendly choice — confirm comfort).  
- [ ] Cards/modals sit on `#1A1A1D` raised surface; hairlines visible but quiet.  
- [ ] Loading screen matches (near-black bg, correct logo/status colours).

**Touch (Android \+ iPad):**

- [ ] Chrome does **not** auto-fade; stays visible (no hover model).  
- [ ] Everything legible; Inter loads (check it's not falling back to system sans — compare a letter like lowercase "a" / "g" shape).

**PWA / service worker (the update dance):**

- [ ] After deploy: reload the tab → close the app/tab fully → reopen. New `linea-v4` cache active.  
- [ ] Fonts load offline (they're precached): go offline, cold-open the installed PWA, confirm Inter still renders.  
- [ ] Splash/theme colour reflects new palette.

**Regression (must still work — untouched logic):**

- [ ] Create / edit / pin / archive / delete a note; all sync to the Sheet.  
- [ ] Cross-device: change on one device appears on another after sync.  
- [ ] Auto-save still fires \~5 s after you stop typing (debounce unchanged).  
- [ ] Search, monthly collapse, export/import, onboarding all unaffected.

---

## 11\. Notes for the implementer

- Work file-by-file in this order: `styles.css` tokens \+ `@font-face` → add font files \+ `index.html` (preload, theme-color, loading screen, sync-icon markup, remove metadata) → `app.js` (removals, then the full-code block, then wiring) → `sw.js` → `manifest.json` → docs. This lets you eyeball the reskin before touching JS behaviour.  
- The two genuinely fiddly bits are the chrome-fade state machine and the offline-doesn't-fade exception — both are given as full code in §6.4–6.5; integrate them as written rather than re-deriving.  
- Keep weights to 400/500. If anything looks heavier than the mockups, hunt for a stray 600/700.  
- Don't reach for Google Fonts. Ever. (Security model.)  
- Oliver implements incrementally and reviews each step; surgical diffs over full-file dumps where you can.

