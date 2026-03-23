// ============================================================
//  LUMO — app.js
//  Core logic: theme, search, suggestions
// ============================================================

// --- Theme ---
(function initTheme() {
  const saved = localStorage.getItem('lumo-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lumo-theme', next);
}

// --- DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  const searchBtn = document.getElementById('searchBtn');
  const suggestions = document.getElementById('suggestions');

  if (!input) return;

  // Show/hide clear button
  input.addEventListener('input', () => {
    clearBtn?.classList.toggle('visible', input.value.length > 0);
    handleSuggestions(input.value);
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('visible');
    closeSuggestions();
    input.focus();
  });

  // Submit on Enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch(input.value);
    if (e.key === 'Escape') closeSuggestions();
  });

  searchBtn?.addEventListener('click', () => doSearch(input.value));

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-glass')) closeSuggestions();
  });
});

// --- Search routing ---
function doSearch(query) {
  query = query.trim();
  if (!query) return;
  const url = `search.html?q=${encodeURIComponent(query)}`;
  window.location.href = url;
}

// --- Suggestions (static smart ones for now) ---
const SUGGESTION_POOL = [
  "weather today", "news today", "AI news 2025",
  "best movies 2025", "how to learn programming",
  "space exploration latest", "climate change updates",
  "cryptocurrency prices", "healthy recipes",
  "machine learning basics", "travel destinations 2025",
];

function handleSuggestions(val) {
  const box = document.getElementById('suggestions');
  if (!box) return;
  if (!val || val.length < 2) { closeSuggestions(); return; }

  const matches = SUGGESTION_POOL
    .filter(s => s.toLowerCase().includes(val.toLowerCase()))
    .slice(0, 5);

  if (!matches.length) { closeSuggestions(); return; }

  box.innerHTML = matches.map(m => `
    <div class="suggestion-item" onclick="doSearch('${m}')">
      <span class="sug-icon">🔍</span>
      <span>${highlightMatch(m, val)}</span>
    </div>
  `).join('');
  box.classList.add('open');
}

function closeSuggestions() {
  const box = document.getElementById('suggestions');
  if (box) box.classList.remove('open');
}

function highlightMatch(str, query) {
  const idx = str.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return str;
  return str.slice(0, idx)
    + `<strong>${str.slice(idx, idx + query.length)}</strong>`
    + str.slice(idx + query.length);
}

// --- Apps modal ---
document.addEventListener('DOMContentLoaded', () => {
  const appsBtn = document.getElementById('appsBtn');
  const appsOverlay = document.getElementById('appsOverlay');
  const appsClose = document.getElementById('appsClose');

  appsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    appsOverlay?.classList.toggle('open');
  });
  appsClose?.addEventListener('click', () => appsOverlay?.classList.remove('open'));
  appsOverlay?.addEventListener('click', (e) => {
    if (e.target === appsOverlay) appsOverlay.classList.remove('open');
  });
});

// --- Bookmarks ---
function getBookmarks() {
  try { return JSON.parse(localStorage.getItem('lumo-bookmarks') || '[]'); }
  catch { return []; }
}
function saveBookmarks(bm) {
  localStorage.setItem('lumo-bookmarks', JSON.stringify(bm));
}
function addBookmark(url, title) {
  const bm = getBookmarks();
  if (bm.find(b => b.url === url)) return false;
  bm.unshift({ url, title, favicon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32` });
  saveBookmarks(bm);
  return true;
}
function removeBookmark(url) {
  saveBookmarks(getBookmarks().filter(b => b.url !== url));
}
function isBookmarked(url) {
  return getBookmarks().some(b => b.url === url);
}

function renderBookmarks() {
  const list = document.getElementById('bookmarksList');
  if (!list) return;
  const bm = getBookmarks();
  if (!bm.length) {
    list.innerHTML = '<div class="bookmarks-empty">No bookmarks yet.<br>Click the 🔖 icon while browsing a page!</div>';
    return;
  }
  list.innerHTML = bm.map(b => `
    <div class="bookmark-item" onclick="openInTab('${b.url}', '${b.title.replace(/'/g,"\\'")}')">
      <img class="bookmark-favicon" src="${b.favicon}" onerror="this.style.display='none'" />
      <div class="bookmark-info">
        <div class="bookmark-title">${b.title}</div>
        <div class="bookmark-url">${new URL(b.url).hostname}</div>
      </div>
      <button class="bookmark-remove" onclick="event.stopPropagation();removeBookmark('${b.url}');renderBookmarks();">✕</button>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const bookmarksBtn = document.getElementById('bookmarksBtn');
  const bookmarksOverlay = document.getElementById('bookmarksOverlay');
  const bookmarksClose = document.getElementById('bookmarksClose');

  bookmarksBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    bookmarksOverlay?.classList.toggle('open');
    renderBookmarks();
  });
  bookmarksClose?.addEventListener('click', () => bookmarksOverlay?.classList.remove('open'));
  bookmarksOverlay?.addEventListener('click', (e) => {
    if (e.target === bookmarksOverlay) bookmarksOverlay.classList.remove('open');
  });
});
