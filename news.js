// ============================================================
//  LUMO — news.js
//  News tab — Brave news API or mock
// ============================================================

const MOCK_NEWS = (query) => [
  { title: `Breaking: Major developments in ${query} shake up the industry`, source: 'TechCrunch', description: `Experts are calling it a watershed moment for ${query}. Here's everything you need to know about today's announcement and what it means going forward.`, age: '2 hours ago', url: '#' },
  { title: `${query}: What the experts are saying this week`, source: 'The Verge', description: `A roundup of the most important commentary and analysis on ${query} from leading voices in the field.`, age: '5 hours ago', url: '#' },
  { title: `New research reveals surprising facts about ${query}`, source: 'Wired', description: `A landmark study published today sheds new light on ${query}, contradicting several long-held assumptions. Researchers say the implications could be far-reaching.`, age: '8 hours ago', url: '#' },
  { title: `${query} trends to watch in 2025`, source: 'Forbes', description: `From emerging technologies to shifting consumer behaviors, here are the ${query} trends that industry insiders say will define the rest of 2025.`, age: '1 day ago', url: '#' },
  { title: `How ${query} is changing everyday life`, source: 'BBC', description: `An in-depth look at how ${query} is transforming the way people work, live, and connect — with real stories from around the world.`, age: '1 day ago', url: '#' },
  { title: `The future of ${query}: experts weigh in`, source: 'Reuters', description: `We spoke with 12 leading experts about where ${query} is headed and what challenges and opportunities lie ahead.`, age: '2 days ago', url: '#' },
];

let newsLoaded = false;

async function loadNews(query) {
  if (newsLoaded) return;
  newsLoaded = true;

  const grid = document.getElementById('newsGrid');
  if (!grid) return;

  // Skeleton
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="news-card" style="pointer-events:none">
      <div class="skeleton skel-line" style="width:40%;margin-bottom:0.75rem"></div>
      <div class="skeleton skel-title" style="height:16px;margin-bottom:6px"></div>
      <div class="skeleton skel-title" style="height:16px;width:85%"></div>
      <div class="skeleton skel-desc" style="margin-top:0.75rem"></div>
      <div class="skeleton skel-desc"></div>
    </div>
  `).join('');

  const { results, isMock } = await fetchBraveResults(query, 'news');
  const articles = results.length ? results : MOCK_NEWS(query);

  grid.innerHTML = articles.map((a, i) => `
    <a class="news-card" href="${a.url}" target="_blank" rel="noopener" style="animation-delay:${i * 0.05}s">
      <div class="news-source">${a.source || 'News'}</div>
      <div class="news-title">${a.title}</div>
      <div class="news-desc">${a.description}</div>
      <div class="news-date">${a.age || ''}</div>
    </a>
  `).join('');

  if (isMock) {
    const note = document.createElement('p');
    note.style.cssText = 'text-align:center;color:var(--text-muted);font-size:0.8rem;padding:1rem;grid-column:1/-1';
    note.innerHTML = `⚡ Demo mode — add your Brave API key in <a href="settings.html" style="color:var(--brand-1)">Settings</a> for real news`;
    grid.appendChild(note);
  }
}
