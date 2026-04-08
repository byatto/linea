# linea

A minimalist daily note-taking app that syncs to Google Sheets. Designed for fast capture of meeting notes and quick thoughts at the desk.

---

## Setup

### 1. Google Cloud Project

You need a Google Cloud project with:
- **Google Sheets API** enabled
- An **OAuth 2.0 Client ID** (Web application type)

If you already have one (e.g. for another app), you can reuse it.

Go to **Google Cloud Console → APIs & Services → Credentials**, edit your OAuth client, and add your GitHub Pages URL to **Authorised JavaScript origins**:

```
https://YOUR_USERNAME.github.io
```

Note down your **Client ID** — it looks like `123456789-abc...apps.googleusercontent.com`.

---

### 2. Configure the App

Open `js/app.js` and set your Client ID at the top of the file:

```javascript
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE';
```

---

### 3. Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Rename the first tab to **`Notes`** (exact spelling, capital N)
3. In **row 1**, paste these headers (one per column, A through F):

   ```
   id    created    updated    title    body    archived
   ```

   *(The app has a "Copy headers" button on the onboarding screen to make this easy.)*

4. Copy the **Sheet ID** from the URL — it's the long string between `/d/` and `/edit`:

   ```
   https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
   ```

---

### 4. Deploy to GitHub Pages

1. Push this repo to GitHub (e.g. `github.com/yourusername/linea`)
2. Go to **Settings → Pages → Source** and select **main branch**
3. Wait a minute, then visit `https://yourusername.github.io/linea/`

---

### 5. First Run

1. Open the app in your browser
2. Paste your **Sheet ID** into the onboarding screen
3. Click **Continue**, then **Sign in with Google**
4. Start writing ✓

The Sheet ID can also be updated any time via the ⚙️ Settings icon.

---

## How It Works

- **Notes** are stored in your Google Sheet — only you can access them (Google's permissions)
- **Offline**: the app caches notes locally. If you're offline, edits are saved locally and synced when you reconnect
- **Auto-save**: notes save 2 seconds after you stop typing, silently in the background
- **No server**: the app runs entirely in your browser. Nothing is sent to any third party

---

## File Structure

```
linea/
├── index.html       — App shell
├── css/styles.css   — All styles
├── js/app.js        — All logic
├── manifest.json    — PWA manifest (installable)
├── sw.js            — Service worker (offline support)
├── icons/           — App icons
└── README.md        — This file
```

---

## Installing as a Desktop App (PWA)

In Chrome or Edge, click the install icon in the address bar (or go to **⋮ → Install linea**). This creates a desktop shortcut that opens linea in its own window, without browser chrome.

---

## Tips

- The **first line** of each note becomes its title in the list
- Use **Copy** in the editor to copy the full note as plain text — ready to paste into Confluence or any other tool
- **Archive** notes you're done with to keep the list clean (they're still in the Sheet)
- The **⚙️ Settings** screen has Export (JSON) and Import options for backup

---

## Updating

When you push updates to GitHub, the PWA cache will be refreshed on your next visit (the service worker version string handles this). If a note is open, refresh the page to get the latest version.
