// ============================================================
//  LUMO — browser.js
//  Full tab system: new tabs, URL bar, search-as-tab
// ============================================================

let tabs = [{ id: 'results', title: 'Search Results', isResults: true }];
let activeTab = 'results';

// ---- Tab helpers ----
function getTab(id) { return tabs.find(t => t.id === id); }

function renderTabs() {
  const container = document.getElementById('browserTabs');
  if (!container) return;
  container.innerHTML = tabs.map(tab => `
    <div class="browser-tab ${tab.id === activeTab ? 'active' : ''}" 
         onclick="switchTab('${tab.id}')" title="${escTab(tab.title)}">
      ${tab.favicon
        ? `<img src="${tab.favicon}" width="12" height="12" style="border-radius:3px;flex-shrink:0" onerror="this.style.display='none'"/>`
        : `<span style="font-size:0.7rem;flex-shrink:0">🌐</span>`}
      <span class="browser-tab-title">${escTab(tab.title)}</span>
      ${!tab.isResults
        ? `<button class="browser-tab-close" onclick="event.stopPropagation();closeTab('${tab.id}')">✕</button>`
        : ''}
    </div>
  `).join('');

  // New tab button stays at end
  container.innerHTML += `
    <button class="new-tab-btn" onclick="openNewTab()" title="New tab">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  `;
}

function switchTab(id) {
  activeTab = id;
  renderTabs();
  const tab = getTab(id);
  const resultsTabsBar = document.getElementById('resultsTabsBar');
  const tabWeb        = document.getElementById('tabWeb');
  const tabNews       = document.getElementById('tabNews');
  const browserPanel  = document.getElementById('browserPanel');
  const newTabPage    = document.getElementById('newTabPage');

  // Hide everything first
  if (resultsTabsBar) resultsTabsBar.style.display = 'none';
  if (tabWeb)         tabWeb.style.display = 'none';
  if (tabNews)        tabNews.style.display = 'none';
  if (browserPanel)   browserPanel.style.display = 'none';
  if (newTabPage)     newTabPage.style.display = 'none';

  if (!tab || tab.isResults) {
    // Show search results
    if (resultsTabsBar) resultsTabsBar.style.display = '';
    if (tabWeb)         tabWeb.style.display = '';
    updateUrlBar('', false);
  } else if (tab.isNewTab) {
    // Show new tab page
    if (newTabPage) newTabPage.style.display = 'flex';
    updateUrlBar('', false);
    document.getElementById('newTabInput')?.focus();
  } else {
    // Show browser iframe
    if (browserPanel) browserPanel.style.display = 'flex';
    loadIframe(tab.url, tab.title, tab.id);
  }
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  tabs = tabs.filter(t => t.id !== id);
  if (activeTab === id) {
    // Switch to adjacent tab
    const next = tabs[Math.min(idx, tabs.length - 1)];
    activeTab = next?.id || 'results';
    switchTab(activeTab);
  }
  renderTabs();
}

// ---- New tab page ----
function openNewTab() {
  const id = 'tab_' + Date.now();
  tabs.push({ id, title: 'New Tab', isNewTab: true });
  activeTab = id;
  renderTabs();
  switchTab(id);
}

// ---- URL bar ----
function updateUrlBar(url, editable = true) {
  const bar = document.getElementById('browserUrlBar');
  if (!bar) return;
  bar.value = url;
  bar.disabled = !editable;
  const ext = document.getElementById('iframeExternal');
  if (ext) ext.href = url || '#';
}

function navigateUrlBar() {
  const bar = document.getElementById('browserUrlBar');
  let val = bar?.value.trim();
  if (!val) return;

  // Decide: URL or search query?
  const isUrl = /^(https?:\/\/|www\.)/i.test(val) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/|$)/.test(val);

  if (isUrl) {
    if (!/^https?:\/\//i.test(val)) val = 'https://' + val;
    const tab = getTab(activeTab);
    if (tab && !tab.isResults) {
      tab.url = val;
      tab.title = new URL(val).hostname;
      tab.isNewTab = false;
      renderTabs();
      loadIframe(val, tab.title, activeTab);
    } else {
      openInTab(val, new URL(val).hostname);
    }
  } else {
    // Treat as search
    doSearch(val);
  }
}

// ---- iframe loading ----
function loadIframe(url, title, tabId) {
  const iframe  = document.getElementById('mainIframe');
  const blocked = document.getElementById('iframeBlocked');
  const blockedLink = document.getElementById('iframeBlockedLink');
  const bookmarkBtn = document.getElementById('iframeBookmark');

  if (!iframe) return;

  updateUrlBar(url, true);
  if (blocked) blocked.style.display = 'none';
  if (document.getElementById('iframeExternal')) document.getElementById('iframeExternal').href = url;

  // Bookmark icon state
  if (bookmarkBtn) {
    bookmarkBtn.style.color = isBookmarked(url) ? 'var(--brand-1)' : '';
  }

  iframe.style.display = 'block';

  // Clear src then set to force reload
  iframe.src = 'about:blank';
  setTimeout(() => { iframe.src = url; }, 50);

  const timer = setTimeout(() => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || doc.body?.innerHTML === '') showIframeBlocked(url);
    } catch { showIframeBlocked(url); }
  }, 6000);

  iframe.onload = () => {
    clearTimeout(timer);
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      const pageTitle = doc?.title;
      if (pageTitle) {
        const tab = getTab(tabId);
        if (tab) { tab.title = pageTitle; renderTabs(); }
      }
      // Update URL bar in case of redirects
      try {
        const newUrl = iframe.contentWindow?.location?.href;
        if (newUrl && newUrl !== 'about:blank') updateUrlBar(newUrl, true);
      } catch {}
    } catch {}
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

// ---- Open URL in a new tab ----
function openInTab(url, title) {
  document.getElementById('bookmarksOverlay')?.classList.remove('open');
  const existing = tabs.find(t => t.url === url);
  if (existing) { switchTab(existing.id); return; }
  const id = 'tab_' + Date.now();
  let favicon = '';
  try { favicon = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; } catch {}
  tabs.push({ id, title: title || url, url, favicon });
  activeTab = id;
  renderTabs();
  switchTab(id);
}

// ---- Intercept result link clicks ----
function interceptResultLinks() {
  document.getElementById('resultsList')?.addEventListener('click', (e) => {
    const link = e.target.closest('a.result-title');
    if (!link) return;
    e.preventDefault();
    openInTab(link.href, link.textContent.trim());
  });
}

function escTab(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  renderTabs();

  // URL bar — navigate on Enter
  const urlBar = document.getElementById('browserUrlBar');
  if (urlBar) {
    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); navigateUrlBar(); }
    });
    urlBar.addEventListener('focus', () => urlBar.select());
  }

  // New tab search input
  const newTabInput = document.getElementById('newTabInput');
  if (newTabInput) {
    newTabInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = newTabInput.value.trim();
        if (!val) return;
        const isUrl = /^(https?:\/\/|www\.)/i.test(val) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/|$)/.test(val);
        if (isUrl) {
          let url = val;
          if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
          const tab = getTab(activeTab);
          if (tab) {
            tab.url = url;
            tab.title = new URL(url).hostname;
            tab.isNewTab = false;
            renderTabs();
            switchTab(activeTab);
          }
        } else {
          doSearch(val);
        }
      }
    });
  }

  // Browser controls
  document.getElementById('iframeBack')?.addEventListener('click', () => {
    document.getElementById('mainIframe')?.contentWindow?.history.back();
  });
  document.getElementById('iframeForward')?.addEventListener('click', () => {
    document.getElementById('mainIframe')?.contentWindow?.history.forward();
  });
  document.getElementById('iframeRefresh')?.addEventListener('click', () => {
    const iframe = document.getElementById('mainIframe');
    if (iframe) { iframe.src = iframe.src; }
  });
  document.getElementById('iframeBookmark')?.addEventListener('click', () => {
    const tab = getTab(activeTab);
    if (!tab || tab.isResults || tab.isNewTab) return;
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
  const observer = new MutationObserver(interceptResultLinks);
  const resultsList = document.getElementById('resultsList');
  if (resultsList) observer.observe(resultsList, { childList: true });

  // Show results tab bar by default
  const resultsTabsBar = document.getElementById('resultsTabsBar');
  if (resultsTabsBar) resultsTabsBar.style.display = '';
});
