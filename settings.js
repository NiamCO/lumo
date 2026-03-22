// ============================================================
//  LUMO — settings.js
//  Settings persistence via localStorage
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load saved values
  const braveKey     = localStorage.getItem('lumo-brave-key') || '';
  const anthropicKey = localStorage.getItem('lumo-anthropic-key') || '';
  const themePref    = localStorage.getItem('lumo-theme-pref') || 'system';
  const aiEnabled    = localStorage.getItem('lumo-ai-summary') !== 'false';
  const newTab       = localStorage.getItem('lumo-new-tab') !== 'false';
  const perPage      = localStorage.getItem('lumo-per-page') || '10';

  const themeSelect    = document.getElementById('themeSelect');
  const aiToggle       = document.getElementById('aiSummaryToggle');
  const newTabToggle   = document.getElementById('newTabToggle');
  const perPageSel     = document.getElementById('resultsPerPage');

  if (braveInput)     braveInput.value = braveKey;
  if (anthropicInput) anthropicInput.value = anthropicKey;
  if (themeSelect)    themeSelect.value = themePref;
  if (aiToggle)       aiToggle.checked = aiEnabled;
  if (newTabToggle)   newTabToggle.checked = newTab;
  if (perPageSel)     perPageSel.value = perPage;

  
  // Theme selector
  themeSelect?.addEventListener('change', () => {
    const val = themeSelect.value;
    localStorage.setItem('lumo-theme-pref', val);
    if (val === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      localStorage.removeItem('lumo-theme');
    } else {
      document.documentElement.setAttribute('data-theme', val);
      localStorage.setItem('lumo-theme', val);
    }
  });

  // AI summary toggle
  aiToggle?.addEventListener('change', () => {
    localStorage.setItem('lumo-ai-summary', aiToggle.checked);
  });

  // New tab toggle
  newTabToggle?.addEventListener('change', () => {
    localStorage.setItem('lumo-new-tab', newTabToggle.checked);
  });

  // Per page
  perPageSel?.addEventListener('change', () => {
    localStorage.setItem('lumo-per-page', perPageSel.value);
  });
