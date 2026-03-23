// ============================================================
//  LUMO — browser.js
//  In-app tab system + iframe browser
// ============================================================

let tabs = [{ id: 'results', title: 'Results', isResults: true }];
let activeTab = 'results';

function renderTabs() {
  const container = document.getElementById('browserTabs');
  if (!container) return;
  container.innerHTML = tabs.map(tab => `
    <div class="browser-tab ${tab.id === activeTab ? 'active' : ''}" onclick="switchTab('${tab.id}')">
      ${tab.favicon ? `<img src="${tab.favicon}" width="12" height="12" style="border-radius:3px;flex-shrink:0" onerror="this.style.display='none'"/>` : ''}
      <span class="browser-tab-title">${tab.title}</span>
      ${!tab.isResults ? `<button class="browser-tab-close" onclick="event.stopPropagation();closeTab('${tab.id}')">✕</button>` : ''}
    </div>
  `).join('');
}

function switchTab(id) {
  activeTab = id;
  renderTabs();
  const tab = tabs.find(t => t.id === id);
  const resultsTabsBar = document.getElementById('resultsTabsBar');
  const tabWeb = document.getElementById('tabWeb');
  const tabNews = document.getElementById('tabNews');
  const browserPanel = document.getElementById('browserPanel');

  if (!tab || tab.isResults) {
    // Show search results
    if (resultsTabsBar) resultsTabsBar.style.display = '';
    if (tabWeb) tabWeb.style.display = '';
    if (tabNews) tabNews.style.display = 'none';
    if (browserPanel) browserPanel.style.display = 'none';
  } else {
    // Show browser iframe panel
    if (resultsTabsBar) resultsTabsBar.style.display = 'none';
    if (tabWeb) tabWeb.style.display = 'none';
    if (tabNews) tabNews.style.display = 'none';
    if (browserPanel) browserPanel.style.display = 'flex';
    loadIframe(tab.url, tab.title);
  }
}

function closeTab(id) {
  tabs = tabs.filter(t => t.id !== id);
  if (activeTab === id) {
    activeTab = tabs[tabs.length - 1]?.id || 'results';
    switchTab(activeTab);
  }
  renderTabs();
}

function openInTab(url, title) {
  // Close bookmarks/apps if open
  document.getElementById('bookmarksOverlay')?.classList.remove('open');

  const existing = tabs.find(t => t.url === url);
  if (existing) { switchTab(existing.id); return; }

  const id = 'tab_' + Date.now();
  const favicon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
  tabs.push({ id, title: title || url, url, favicon });
  activeTab = id;
  renderTabs();
  switchTab(id);
}

function loadIframe(url, title) {
  const iframe = document.getElementById('mainIframe');
  const blocked = document.getElementById('iframeBlocked');
  const blockedLink = document.getElementById('iframeBlockedLink');
  const urlBar = document.getElementById('browserUrlBar');
  const externalBtn = document.getElementById('iframeExternal');
  const bookmarkBtn = document.getElementById('iframeBookmark');

  if (!iframe) return;

  urlBar.textContent = url;
  if (externalBtn) externalBtn.href = url;
  if (blocked) blocked.style.display = 'none';

  // Update bookmark button state
  if (bookmarkBtn) {
    bookmarkBtn.style.color = isBookmarked(url) ? 'var(--brand-1)' : '';
  }

  iframe.style.display = 'block';
  iframe.src = url;

  // Detect iframe block via error
  iframe.onerror = () => showIframeBlocked(url);

  // Timeout fallback — if nothing loads in 5s, show blocked message
  const timer = setTimeout(() => {
    try {
      // Try accessing iframe content — will throw if blocked
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || doc.body?.innerHTML === '') showIframeBlocked(url);
    } catch {
      showIframeBlocked(url);
    }
  }, 5000);

  iframe.onload = () => {
    clearTimeout(timer);
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.title) {
        const tab = tabs.find(t => t.url === url);
        if (tab) {
          tab.title = doc.title;
          renderTabs();
        }
      }
    } catch { /* cross-origin, can't read title */ }
  };

  if (blockedLink) blockedLink.href = url;
}

function showIframeBlocked(url) {
  const iframe = document.getElementById('mainIframe');
  const blocked = document.getElementById('iframeBlocked');
  const blockedLink = document.getElementById('iframeBlockedLink');
  if (iframe) iframe.style.display = 'none';
  if (blocked) blocked.style.display = 'flex';
  if (blockedLink) blockedLink.href = url;
}

// Hook up result links to open in tabs
function interceptResultLinks() {
  document.getElementById('resultsList')?.addEventListener('click', (e) => {
    const link = e.target.closest('a.result-title');
    if (!link) return;
    e.preventDefault();
    openInTab(link.href, link.textContent.trim());
  });
}

// Iframe controls
document.addEventListener('DOMContentLoaded', () => {
  renderTabs();

  document.getElementById('iframeBack')?.addEventListener('click', () => {
    document.getElementById('mainIframe')?.contentWindow?.history.back();
  });

  document.getElementById('iframeRefresh')?.addEventListener('click', () => {
    const iframe = document.getElementById('mainIframe');
    if (iframe) iframe.src = iframe.src;
  });

  document.getElementById('iframeBookmark')?.addEventListener('click', () => {
    const tab = tabs.find(t => t.id === activeTab);
    if (!tab || tab.isResults) return;
    const btn = document.getElementById('iframeBookmark');
    if (isBookmarked(tab.url)) {
      removeBookmark(tab.url);
      if (btn) btn.style.color = '';
    } else {
      addBookmark(tab.url, tab.title);
      if (btn) btn.style.color = 'var(--brand-1)';
    }
  });

  // Intercept result links after they load
  const observer = new MutationObserver(() => interceptResultLinks());
  const resultsList = document.getElementById('resultsList');
  if (resultsList) observer.observe(resultsList, { childList: true });
});
