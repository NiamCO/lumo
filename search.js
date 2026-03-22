// ============================================================
//  LUMO — search.js
//  Brave Search API integration + mock fallback
// ============================================================

const MOCK_RESULTS = (query) => [
  {
    title: `${query} — Wikipedia`,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`,
    description: `Wikipedia article covering everything about ${query}. Comprehensive overview with references, history, and related topics. Freely available encyclopedia content.`,
    favicon: "https://www.google.com/s2/favicons?domain=wikipedia.org&sz=32",
  },
  {
    title: `The Complete Guide to ${query} in 2025`,
    url: `https://medium.com/@example/${query.replace(/\s+/g,'-').toLowerCase()}`,
    description: `A deep dive into ${query} — covering the latest trends, best practices, and expert insights. Updated for 2025 with real-world examples and actionable takeaways.`,
    favicon: "https://www.google.com/s2/favicons?domain=medium.com&sz=32",
  },
  {
    title: `${query} News & Latest Updates`,
    url: `https://news.ycombinator.com/search?q=${encodeURIComponent(query)}`,
    description: `Stay up to date with the latest ${query} news and discussions. Community-curated links and commentary from experts around the world.`,
    favicon: "https://www.google.com/s2/favicons?domain=ycombinator.com&sz=32",
  },
  {
    title: `Reddit — What people are saying about ${query}`,
    url: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
    description: `Real discussions and community opinions about ${query}. Thousands of threads, comments, and first-hand experiences shared on Reddit.`,
    favicon: "https://www.google.com/s2/favicons?domain=reddit.com&sz=32",
  },
  {
    title: `${query} — Official Documentation`,
    url: `https://docs.example.com/${query.replace(/\s+/g,'-').toLowerCase()}`,
    description: `Official reference documentation for ${query}. Includes API references, tutorials, examples, and troubleshooting guides for developers and users.`,
    favicon: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
  },
  {
    title: `How to get started with ${query} — Tutorial`,
    url: `https://www.freecodecamp.org/news/${query.replace(/\s+/g,'-').toLowerCase()}-guide`,
    description: `Step-by-step beginner tutorial on ${query}. Learn the fundamentals, build your first project, and master the core concepts in under an hour.`,
    favicon: "https://www.google.com/s2/favicons?domain=freecodecamp.org&sz=32",
  },
  {
    title: `${query} on YouTube — Top Videos`,
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    description: `Watch the best videos about ${query} on YouTube. Tutorials, documentaries, expert talks, and more — curated by the community.`,
    favicon: "https://www.google.com/s2/favicons?domain=youtube.com&sz=32",
  },
  {
    title: `${query} Stack Overflow Q&A`,
    url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
    description: `Answers to the most common ${query} questions on Stack Overflow. Find solutions from experienced developers and community experts.`,
    favicon: "https://www.google.com/s2/favicons?domain=stackoverflow.com&sz=32",
  },
];

// --- Fetch from Brave Search API ---
async function fetchBraveResults(query, type = 'web') {
  const key = LUMO_CONFIG.BRAVE_API_KEY;
  if (!key || key === 'YOUR_BRAVE_API_KEY_HERE') {
    // Return mock data if no key
    return { results: MOCK_RESULTS(query), isMock: true };
  }

  const endpoint = type === 'news'
    ? `https://api.search.brave.com/res/v1/news/search?q=${encodeURIComponent(query)}&count=12`
    : `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${LUMO_CONFIG.RESULTS_PER_PAGE}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': key,
      }
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();

    if (type === 'news') {
      return { results: (data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description || '',
        source: r.meta_url?.hostname || new URL(r.url).hostname,
        age: r.age || '',
        favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.url).hostname}&sz=32`,
      })), isMock: false };
    }

    return { results: (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description || '',
      favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.url).hostname}&sz=32`,
    })), isMock: false };

  } catch (err) {
    console.error('Brave API error:', err);
    return { results: MOCK_RESULTS(query), isMock: true };
  }
}

// --- Render results ---
function renderResults(results, query, isMock) {
  const list = document.getElementById('resultsList');
  const stats = document.getElementById('resultsStats');
  if (!list) return;

  stats.innerHTML = isMock
    ? `<span style="color:var(--brand-1)">⚡ Demo mode</span> — add your Brave API key in <a href="settings.html" style="color:var(--brand-1)">Settings</a> for real results`
    : `About ${(results.length * 1247).toLocaleString()} results`;

  if (!results.length) {
    list.innerHTML = `<p style="color:var(--text-muted);padding:2rem 0">No results found for <strong>${query}</strong>.</p>`;
    return;
  }

  list.innerHTML = results.map((r, i) => `
    <div class="result-item" style="animation-delay:${i * 0.05}s">
      <div class="result-url">
        <img class="result-favicon" src="${r.favicon}" alt="" onerror="this.style.display='none'" />
        ${new URL(r.url).hostname}
      </div>
      <a class="result-title" href="${r.url}" target="_blank" rel="noopener">${r.title}</a>
      <p class="result-desc">${r.description}</p>
    </div>
  `).join('');
}

// --- Skeleton loader ---
function showSkeleton() {
  const list = document.getElementById('resultsList');
  if (!list) return;
  list.innerHTML = Array(5).fill(0).map(() => `
    <div class="result-item">
      <div class="skeleton skel-line" style="width:40%"></div>
      <div class="skeleton skel-title"></div>
      <div class="skeleton skel-desc"></div>
      <div class="skeleton skel-desc"></div>
    </div>
  `).join('');
}

// --- Tab switching ---
function initTabs(query) {
  const tabs = document.querySelectorAll('.results-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panel = tab.dataset.tab;
      document.getElementById('tabWeb').style.display = panel === 'web' ? '' : 'none';
      document.getElementById('tabNews').style.display = panel === 'news' ? '' : 'none';
      if (panel === 'news') loadNews(query);
    });
  });
}

// --- Main init ---
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const query = params.get('q') || '';

  if (!query) { window.location.href = 'index.html'; return; }

  // Update page title and search bar
  document.title = `${query} — Lumo`;
  const searchBar = document.getElementById('resultsSearchInput');
  if (searchBar) {
    searchBar.value = query;
    searchBar.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch(searchBar.value);
    });
  }

  // Init tabs
  initTabs(query);

  // Load web results
  showSkeleton();
  const { results, isMock } = await fetchBraveResults(query, 'web');
  renderResults(results, query, isMock);

  // Load AI summary
  loadAISummary(query, results.slice(0, 3));
});
