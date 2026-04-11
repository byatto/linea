/**
 * linea — app.js
 * All application logic: auth, Google Sheets API, UI, sync.
 *
 * ─── CONFIG ──────────────────────────────────────────────────────────────────
 * Set CLIENT_ID to your Google OAuth 2.0 Client ID before deploying.
 * Get it from: Google Cloud Console → APIs & Services → Credentials
 */

const CLIENT_ID     = '929932889482-8hkb7mgb203opsfa1qh9pimf4vk41g3o.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const SCOPES        = 'https://www.googleapis.com/auth/spreadsheets';

// ─── STORAGE KEYS ────────────────────────────────────────────────────────────
const LS_NOTES  = 'linea_notes';
const LS_CONFIG = 'linea_config';

// ─── APP STATE ────────────────────────────────────────────────────────────────
let state = {
  notes:          [],
  rowMap:         {},
  currentNoteId:  null,
  isSignedIn:     false,
  sheetId:        '',
  searchQuery:    '',
  showArchived:   false,
  searchOpen:     false,
  saveTimer:      null,
  tokenClient:    null,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function makeId() {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function now() { return new Date().toISOString(); }

/** Format a date for display — returns "Today", "Yesterday", "3 Apr", etc. */
function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const noteDay   = new Date(d); noteDay.setHours(0,0,0,0);
  if (noteDay.getTime() === today.getTime())     return 'Today';
  if (noteDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
    year: noteDay.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

/** Group key for date headings — same logic as formatDate */
function dateGroupKey(isoString) {
  return formatDate(isoString) || 'Unknown';
}

function formatTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function titleFromBody(body) {
  const first = (body || '').split('\n')[0].trim();
  return first.length > 80 ? first.slice(0, 80) + '…' : first || 'Untitled';
}

/** Extract a body preview: lines after the first, joined, max ~120 chars */
function previewFromBody(body) {
  if (!body) return '';
  const lines = body.split('\n');
  if (lines.length <= 1) return '';
  const rest = lines.slice(1).join(' ').trim();
  return rest.length > 120 ? rest.slice(0, 120) + '…' : rest;
}

function lineCount(body) {
  return (body || '').split('\n').filter(l => l.trim()).length;
}

function wordCount(body) {
  if (!body || !body.trim()) return 0;
  return body.trim().split(/\s+/).length;
}

// ─── LOCAL STORAGE ─────────────────────────────────────────────────────────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_NOTES);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.notes = parsed.notes || [];
    }
  } catch (e) { console.warn('linea: could not parse localStorage', e); }
}

function saveToStorage() {
  try {
    localStorage.setItem(LS_NOTES, JSON.stringify({
      notes: state.notes,
      lastSync: now(),
    }));
  } catch (e) { console.warn('linea: could not write localStorage', e); }
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    if (raw) {
      const cfg = JSON.parse(raw);
      state.sheetId = cfg.sheetId || '';
    }
  } catch (e) {}
}

function saveConfig() {
  localStorage.setItem(LS_CONFIG, JSON.stringify({ sheetId: state.sheetId }));
}

// ─── GOOGLE AUTH ─────────────────────────────────────────────────────────────

// Key for persisting the access token across page refreshes within a session
const SS_TOKEN = 'linea_gtoken';

/**
 * Load gapi and GIS scripts in parallel, with a timeout.
 * If scripts fail to load (blocked, slow connection, iPad restrictions),
 * the app still shows with cached notes after the timeout.
 */
function loadGoogleScripts() {
  setLoadingStatus('Loading Google…');

  const gapiReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = async () => {
      try {
        await new Promise(r => gapi.load('client', r));
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
        resolve();
      } catch (e) { reject(e); }
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });

  const gisReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  // Race against a timeout — if scripts haven't loaded in 8 seconds,
  // show the app anyway so the user can at least work offline
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Google scripts timed out')), 8000);
  });

  return Promise.race([
    Promise.all([gapiReady, gisReady]),
    timeout,
  ]);
}

function initTokenClient() {
  state.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    prompt: '',
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('Token error:', tokenResponse.error);
        handleSignOut();
        return;
      }
      state.isSignedIn = true;
      // Persist the token so page refreshes don't force re-login
      try {
        sessionStorage.setItem(SS_TOKEN, JSON.stringify(tokenResponse));
      } catch (e) {}
      renderAuthState();
      syncFromSheet();
    },
  });
}

/**
 * On boot, try to restore a token from sessionStorage before
 * requesting a new one. This avoids the re-login-on-refresh problem.
 */
function tryRestoreToken() {
  try {
    const saved = sessionStorage.getItem(SS_TOKEN);
    if (!saved) return false;
    const token = JSON.parse(saved);
    if (!token || !token.access_token) return false;
    // Set the token on the gapi client
    gapi.client.setToken(token);
    state.isSignedIn = true;
    renderAuthState();
    syncFromSheet();
    return true;
  } catch (e) {
    return false;
  }
}

function requestToken(interactive = false) {
  if (!state.tokenClient) return;
  state.tokenClient.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
}

function handleSignIn() { requestToken(true); }

function handleSignOut() {
  const token = gapi.client.getToken();
  if (token) google.accounts.oauth2.revoke(token.access_token, () => {});
  gapi.client.setToken(null);
  state.isSignedIn = false;
  try { sessionStorage.removeItem(SS_TOKEN); } catch (e) {}
  renderAuthState();
}

function handleTokenExpiry() {
  state.isSignedIn = false;
  requestToken(false);
}

// ─── SHEETS API ───────────────────────────────────────────────────────────────

async function sheetReadAll() {
  if (!state.sheetId) return null;
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.sheetId,
      range: 'Notes!A2:F',
    });
    const rows = resp.result.values || [];
    const notes = [];
    rows.forEach((row, i) => {
      if (!row[0]) return;
      notes.push({
        id:       row[0] || '',
        created:  row[1] || '',
        updated:  row[2] || '',
        title:    row[3] || '',
        body:     row[4] || '',
        archived: (row[5] || '').toUpperCase() === 'TRUE',
        dirty:    false,
        _row:     i + 2,
      });
    });
    state.rowMap = {};
    notes.forEach(n => { state.rowMap[n.id] = n._row; });
    return notes;
  } catch (e) {
    if (e.status === 401) { handleTokenExpiry(); return null; }
    if (e.status === 404) {
      showSheetStatus('Sheet not found — check the ID in Settings.', 'err');
      return null;
    }
    console.error('sheetReadAll error:', e);
    return null;
  }
}

async function sheetAppend(note) {
  if (!state.sheetId) return null;
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.sheetId,
      range: 'Notes!A:F',
      valueInputOption: 'RAW',
      resource: {
        values: [[
          note.id, note.created, note.updated,
          note.title, note.body,
          note.archived ? 'TRUE' : 'FALSE',
        ]],
      },
    });
    const updatedRange = resp.result.updates?.updatedRange || '';
    const match = updatedRange.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  } catch (e) {
    if (e.status === 401) { handleTokenExpiry(); return null; }
    console.error('sheetAppend error:', e);
    return null;
  }
}

async function sheetUpdate(note) {
  if (!state.sheetId) return false;
  const row = state.rowMap[note.id];
  if (!row) {
    const newRow = await sheetAppend(note);
    if (newRow) state.rowMap[note.id] = newRow;
    return !!newRow;
  }
  try {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.sheetId,
      range: `Notes!A${row}:F${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[
          note.id, note.created, note.updated,
          note.title, note.body,
          note.archived ? 'TRUE' : 'FALSE',
        ]],
      },
    });
    return true;
  } catch (e) {
    if (e.status === 401) { handleTokenExpiry(); return false; }
    console.error('sheetUpdate error:', e);
    return false;
  }
}

async function sheetDelete(noteId) {
  if (!state.sheetId) return false;
  const row = state.rowMap[noteId];
  if (!row) return true;

  try {
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: state.sheetId,
      fields: 'sheets.properties',
    });
    const sheetGid = meta.result.sheets[0]?.properties?.sheetId ?? 0;

    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: state.sheetId,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetGid,
              dimension: 'ROWS',
              startIndex: row - 1,
              endIndex: row,
            },
          },
        }],
      },
    });
    delete state.rowMap[noteId];
    return true;
  } catch (e) {
    if (e.status === 401) { handleTokenExpiry(); return false; }
    console.error('sheetDelete error:', e);
    return false;
  }
}

// ─── SYNC ─────────────────────────────────────────────────────────────────────

function mergeNotes(local, remote) {
  const map = {};
  local.forEach(n => { map[n.id] = { ...n }; });
  remote.forEach(rn => {
    const ln = map[rn.id];
    if (!ln || new Date(rn.updated) >= new Date(ln.updated)) {
      map[rn.id] = { ...rn, dirty: false };
    }
  });
  return Object.values(map).sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

async function syncFromSheet() {
  if (!state.isSignedIn || !state.sheetId) return;

  const remote = await sheetReadAll();
  if (!remote) return;

  state.notes = mergeNotes(state.notes, remote);
  saveToStorage();
  renderNotesList();
  updateSyncStatus();

  const dirtyNotes = state.notes.filter(n => n.dirty);
  for (const note of dirtyNotes) {
    const ok = await sheetUpdate(note);
    if (ok) note.dirty = false;
  }
  if (dirtyNotes.length) saveToStorage();
}

// ─── AUTO-SAVE ────────────────────────────────────────────────────────────────

function scheduleSave(note) {
  clearTimeout(state.saveTimer);
  setSaveIndicator('saving');
  state.saveTimer = setTimeout(() => performSave(note), 2000);
}

async function performSave(note) {
  saveToStorage();

  if (!state.isSignedIn || !state.sheetId || !navigator.onLine) {
    note.dirty = true;
    saveToStorage();
    setSaveIndicator('saved');
    return;
  }

  const isNew = !state.rowMap[note.id];
  let ok;
  if (isNew) {
    const newRow = await sheetAppend(note);
    if (newRow) { state.rowMap[note.id] = newRow; ok = true; }
    else ok = false;
  } else {
    ok = await sheetUpdate(note);
  }

  note.dirty = !ok;
  saveToStorage();
  setSaveIndicator(ok ? 'saved' : 'offline');
}

function setSaveIndicator(status) {
  const el = document.getElementById('save-indicator');
  if (!el) return;
  if (status === 'saving') {
    el.textContent = 'Saving…';
    el.classList.add('visible');
  } else if (status === 'saved') {
    el.textContent = 'Saved ✓';
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2000);
  } else {
    el.textContent = 'Saved locally';
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3000);
  }
}

// ─── ONLINE / OFFLINE ─────────────────────────────────────────────────────────

function updateOnlineStatus() {
  const badge = document.getElementById('offline-badge');
  if (badge) badge.style.display = navigator.onLine ? 'none' : '';
  if (navigator.onLine && state.isSignedIn) syncFromSheet();
}

// ─── NOTE OPERATIONS ──────────────────────────────────────────────────────────

function createNote() {
  const note = {
    id:       makeId(),
    created:  now(),
    updated:  now(),
    title:    '',
    body:     '',
    archived: false,
    dirty:    true,
  };
  state.notes.unshift(note);
  saveToStorage();
  openEditor(note.id);
}

function getNoteById(id) { return state.notes.find(n => n.id === id); }

function updateNoteBody(id, body) {
  const note = getNoteById(id);
  if (!note) return;
  note.body    = body;
  note.title   = titleFromBody(body);
  note.updated = now();
  saveToStorage();
  scheduleSave(note);
  state.notes.sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

async function archiveNote(id, archived = true) {
  const note = getNoteById(id);
  if (!note) return;
  note.archived = archived;
  note.updated  = now();
  saveToStorage();
  renderNotesList();
  showView('list');

  if (state.isSignedIn && state.sheetId) await sheetUpdate(note);

  showToast(
    archived ? 'Note archived' : 'Note restored',
    'Undo',
    () => archiveNote(id, !archived)
  );
}

async function deleteNote(id) {
  const idx = state.notes.findIndex(n => n.id === id);
  if (idx === -1) return;
  state.notes.splice(idx, 1);
  delete state.rowMap[id];
  saveToStorage();
  renderNotesList();
  showView('list');

  if (state.isSignedIn && state.sheetId) await sheetDelete(id);
}

// ─── VIEWS & TRANSITIONS ─────────────────────────────────────────────────────

function showView(view) {
  const listEl   = document.getElementById('view-list');
  const editorEl = document.getElementById('view-editor');
  const hList    = document.getElementById('header-list');
  const hEditor  = document.getElementById('header-editor');

  if (view === 'list') {
    editorEl.style.display = 'none';
    listEl.style.display   = '';
    hList.style.display    = '';
    hEditor.style.display  = 'none';
    state.currentNoteId    = null;
    // Animate the list in
    listEl.classList.remove('entering');
    void listEl.offsetWidth; // reflow to retrigger
    listEl.classList.add('entering');
  } else {
    listEl.style.display   = 'none';
    editorEl.style.display = '';
    hList.style.display    = 'none';
    hEditor.style.display  = '';
    window.scrollTo(0, 0);
    // Animate the editor in
    editorEl.classList.remove('entering');
    void editorEl.offsetWidth;
    editorEl.classList.add('entering');
  }
}

function openEditor(id) {
  state.currentNoteId = id;
  const note = getNoteById(id);
  if (!note) return;

  showView('editor');

  const textarea = document.getElementById('note-body');
  textarea.value = note.body;
  autoGrow(textarea);
  textarea.focus();

  renderEditorMeta(note);
  updateWordCount(note.body);
  showShortcutHint();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function renderEditorMeta(note) {
  const created = document.getElementById('meta-created');
  const updated = document.getElementById('meta-updated');
  if (created) created.textContent = `Created ${formatDate(note.created)}`;
  if (updated) updated.textContent = `· Last saved ${formatTime(note.updated)}`;
}

function updateWordCount(body) {
  const el = document.getElementById('word-count');
  if (!el) return;
  const wc = wordCount(body);
  el.textContent = wc === 0 ? '' : `${wc} word${wc === 1 ? '' : 's'}`;
}

/** Show the keyboard shortcut hint briefly when entering the editor */
function showShortcutHint() {
  const el = document.getElementById('shortcut-hint');
  if (!el) return;
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  el.textContent = isMac ? '⌘⇧D to insert date' : 'Ctrl+Shift+D to insert date';
  setTimeout(() => el.classList.add('visible'), 600);
  setTimeout(() => el.classList.remove('visible'), 4000);
}

// ─── NOTE LIST RENDERING ──────────────────────────────────────────────────────

function getFilteredNotes() {
  let notes = state.notes.filter(n => state.showArchived ? true : !n.archived);
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    notes = notes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q)
    );
  }
  return notes;
}

function renderNotesList() {
  const listEl       = document.getElementById('notes-list');
  const emptyEl      = document.getElementById('empty-state');
  const emptySearch  = document.getElementById('empty-search');
  const filtered     = getFilteredNotes();
  const allActive    = state.notes.filter(n => !n.archived);

  listEl.innerHTML = '';

  if (filtered.length === 0) {
    if (state.searchQuery) {
      emptyEl.style.display     = 'none';
      emptySearch.style.display = '';
    } else {
      emptyEl.style.display     = allActive.length === 0 ? '' : 'none';
      emptySearch.style.display = 'none';
    }
    return;
  }

  emptyEl.style.display     = 'none';
  emptySearch.style.display = 'none';

  // ── Group notes by date ──
  let currentGroup = '';

  filtered.forEach(note => {
    const group = dateGroupKey(note.updated);

    // Insert a date heading when the group changes
    if (group !== currentGroup) {
      currentGroup = group;
      const heading = document.createElement('div');
      heading.className = 'date-group-heading';
      heading.textContent = group;
      listEl.appendChild(heading);
    }

    const card = document.createElement('div');
    card.className = 'note-card' + (note.archived ? ' archived' : '');
    card.dataset.id = note.id;

    const preview = previewFromBody(note.body);
    const time = formatTime(note.updated);

    card.innerHTML = `
      <div class="note-card-title">${escapeHtml(note.title || 'Untitled')}</div>
      ${preview ? `<div class="note-card-preview">${escapeHtml(preview)}</div>` : ''}
      <div class="note-card-meta">${time}${note.dirty ? ' · ●' : ''}</div>
    `;

    card.addEventListener('click', () => openEditor(note.id));
    listEl.appendChild(card);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── SEARCH TOGGLE ────────────────────────────────────────────────────────────

function toggleSearch() {
  const input = document.getElementById('search-input');
  state.searchOpen = !state.searchOpen;

  if (state.searchOpen) {
    input.classList.add('expanded');
    setTimeout(() => input.focus(), 260);
  } else {
    input.value = '';
    input.classList.remove('expanded');
    state.searchQuery = '';
    renderNotesList();
  }
}

// ─── AUTH STATE RENDERING ─────────────────────────────────────────────────────

function renderAuthState() {
  const statusEl   = document.getElementById('auth-status');
  const signinBtn  = document.getElementById('btn-signin');
  const signoutBtn = document.getElementById('btn-signout');

  if (!statusEl) return;

  if (state.isSignedIn) {
    statusEl.textContent = 'Signed in ✓';
    statusEl.className = 'auth-status signed-in';
    signinBtn.style.display  = 'none';
    signoutBtn.style.display = '';
  } else {
    statusEl.textContent = 'Not signed in';
    statusEl.className = 'auth-status';
    signinBtn.style.display  = '';
    signoutBtn.style.display = 'none';
  }
}

function showSheetStatus(msg, type = '') {
  const el = document.getElementById('sheet-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `sheet-status ${type}`;
}

function updateSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = `Last synced: ${formatTime(now())}`;
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message, undoLabel, undoCallback, duration = 5000) {
  clearTimeout(toastTimer);
  const toast = document.getElementById('toast');
  toast.innerHTML = '';

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  if (undoLabel && undoCallback) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo';
    btn.textContent = undoLabel;
    btn.addEventListener('click', () => {
      undoCallback();
      toast.style.display = 'none';
    });
    toast.appendChild(btn);
  }

  toast.style.display = 'flex';
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, duration);
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────

function openSettings() {
  const el = document.getElementById('settings-overlay');
  el.style.display = '';
  document.getElementById('sheet-id-input').value = state.sheetId;
  renderAuthState();
  updateSyncStatus();
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

function checkOnboarding() {
  if (!state.sheetId) {
    document.getElementById('onboarding-overlay').style.display = '';
  }
}

// ─── EXPORT / IMPORT ─────────────────────────────────────────────────────────

function exportNotes() {
  const data = JSON.stringify(state.notes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `linea-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importNotes(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error('Expected array');
      imported.forEach(n => { n.dirty = true; });
      state.notes = mergeNotes(state.notes, imported);
      saveToStorage();
      renderNotesList();
      showToast(`Imported ${imported.length} notes`);
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ─── OVERFLOW MENU ────────────────────────────────────────────────────────────

function toggleOverflowMenu() {
  const menu = document.getElementById('overflow-menu');
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', closeOverflowMenu, { once: true });
    }, 0);
  }
}

function closeOverflowMenu() {
  const menu = document.getElementById('overflow-menu');
  if (menu) menu.style.display = 'none';
}

// ─── CLIPBOARD ────────────────────────────────────────────────────────────────

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

// ─── DATE STAMP SHORTCUT ─────────────────────────────────────────────────────

/**
 * Insert the current date/time at the cursor in the editor textarea.
 * Triggered by Cmd+Shift+D (Mac) or Ctrl+Shift+D (Windows/Linux).
 */
function insertDateStamp() {
  const textarea = document.getElementById('note-body');
  if (!textarea || document.activeElement !== textarea) return;

  const d = new Date();
  const stamp = d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const start = textarea.selectionStart;
  const end   = textarea.selectionEnd;
  const val   = textarea.value;

  textarea.value = val.slice(0, start) + stamp + val.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + stamp.length;

  autoGrow(textarea);
  if (state.currentNoteId) {
    updateNoteBody(state.currentNoteId, textarea.value);
    const note = getNoteById(state.currentNoteId);
    if (note) renderEditorMeta(note);
    updateWordCount(textarea.value);
  }
}

// ─── LOADING SCREEN ───────────────────────────────────────────────────────────

function setLoadingStatus(msg) {
  const el = document.getElementById('loading-status');
  if (el) el.textContent = msg;
}

function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (el) el.style.display = 'none';
  document.getElementById('app').style.display = '';
}

// ─── EVENT WIRING ─────────────────────────────────────────────────────────────

function wireEvents() {
  // ── New note
  document.getElementById('btn-new').addEventListener('click', createNote);

  // ── Back button (arrow icon)
  document.getElementById('btn-back').addEventListener('click', () => {
    clearTimeout(state.saveTimer);
    if (state.currentNoteId) {
      const note = getNoteById(state.currentNoteId);
      if (note) {
        // If the note is blank, discard it instead of saving an empty entry
        if (!note.body || !note.body.trim()) {
          const idx = state.notes.findIndex(n => n.id === note.id);
          if (idx !== -1) state.notes.splice(idx, 1);
          delete state.rowMap[note.id];
          saveToStorage();
        } else if (note.dirty) {
          performSave(note);
        }
      }
    }
    renderNotesList();
    showView('list');
  });

  // ── Editor textarea input
  const textarea = document.getElementById('note-body');
  textarea.addEventListener('input', () => {
    autoGrow(textarea);
    if (state.currentNoteId) {
      updateNoteBody(state.currentNoteId, textarea.value);
      const note = getNoteById(state.currentNoteId);
      if (note) renderEditorMeta(note);
      updateWordCount(textarea.value);
    }
  });

  // ── Copy button
  document.getElementById('btn-copy').addEventListener('click', async () => {
    const note = getNoteById(state.currentNoteId);
    if (!note) return;
    await copyToClipboard(note.body);
    showToast('Copied to clipboard');
  });

  // ── Overflow menu
  document.getElementById('btn-overflow').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOverflowMenu();
  });

  document.getElementById('menu-archive').addEventListener('click', () => {
    closeOverflowMenu();
    if (state.currentNoteId) archiveNote(state.currentNoteId, true);
  });

  document.getElementById('menu-delete').addEventListener('click', () => {
    closeOverflowMenu();
    if (!state.currentNoteId) return;
    const confirmed = window.confirm('Delete this note? This cannot be undone.');
    if (confirmed) deleteNote(state.currentNoteId);
  });

  // ── Search toggle (icon expands/collapses search input)
  document.getElementById('btn-search-toggle').addEventListener('click', toggleSearch);

  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    renderNotesList();
  });

  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleSearch();
  });

  // ── Archive toggle
  document.getElementById('show-archived').addEventListener('change', (e) => {
    state.showArchived = e.target.checked;
    renderNotesList();
  });

  // ── Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
  document.getElementById('settings-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeSettings();
  });

  // ── Sign in / out
  document.getElementById('btn-signin').addEventListener('click', handleSignIn);
  document.getElementById('btn-signout').addEventListener('click', () => {
    handleSignOut();
    closeSettings();
  });

  // ── Save sheet ID
  document.getElementById('btn-save-sheet-id').addEventListener('click', () => {
    const val = document.getElementById('sheet-id-input').value.trim();
    if (!val) { showSheetStatus('Please enter a Sheet ID.', 'err'); return; }
    state.sheetId = val;
    saveConfig();
    showSheetStatus('Saved ✓', 'ok');
    if (state.isSignedIn) syncFromSheet();
  });

  // ── Sync now
  document.getElementById('btn-sync-now').addEventListener('click', () => {
    if (!state.isSignedIn) { showToast('Sign in first'); return; }
    syncFromSheet();
    showToast('Syncing…');
  });

  // ── Export / Import
  document.getElementById('btn-export').addEventListener('click', exportNotes);
  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importNotes(file);
    e.target.value = '';
  });

  // ── Copy headers
  const headerStr = 'id\tcreated\tupdated\ttitle\tbody\tarchived';
  document.getElementById('btn-copy-headers').addEventListener('click', async () => {
    await copyToClipboard(headerStr);
    showToast('Headers copied — paste into row 1 of your Sheet');
  });
  document.getElementById('btn-copy-headers-onboard').addEventListener('click', async () => {
    await copyToClipboard(headerStr);
    showToast('Headers copied');
  });

  // ── Onboarding continue
  document.getElementById('btn-onboard-continue').addEventListener('click', () => {
    const val = document.getElementById('onboard-sheet-id').value.trim();
    if (val) { state.sheetId = val; saveConfig(); }
    document.getElementById('onboarding-overlay').style.display = 'none';
    if (state.isSignedIn) syncFromSheet();
  });
  document.getElementById('onboarding-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('onboarding-overlay').style.display = 'none';
    }
  });

  // ── Online / offline
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // ── Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl+Shift+D → insert date stamp (in editor)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      insertDateStamp();
    }
    // Cmd/Ctrl+K → toggle search (from list view)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !state.currentNoteId) {
      e.preventDefault();
      toggleSearch();
    }
  });
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────

async function boot() {
  loadConfig();
  loadFromStorage();
  renderNotesList();
  wireEvents();

  let googleLoaded = false;

  try {
    setLoadingStatus('Loading authentication…');
    await loadGoogleScripts();
    googleLoaded = true;
  } catch (e) {
    console.warn('Google scripts unavailable:', e.message || e);
    // Show the app anyway — cached notes still work offline
  }

  // Always show the app, even if Google failed
  hideLoadingScreen();

  if (googleLoaded) {
    initTokenClient();
    checkOnboarding();
    updateOnlineStatus();

    if (CLIENT_ID && CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE') {
      // Try to restore a saved token first (avoids re-login on refresh)
      const restored = tryRestoreToken();
      if (!restored) {
        // Fall back to silent token request
        requestToken(false);
      }
    }
  } else {
    // No Google — show offline indicator, still allow cached note editing
    checkOnboarding();
    updateOnlineStatus();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => {
      console.warn('SW registration failed:', e);
    });
  }
}

boot();
