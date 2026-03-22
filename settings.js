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

  const braveInput     = document.getElementById('braveKeyInput');
  const anthropicInput = document.getElementById('anthropicKeyInput');
  const themeSelect    = document.getElementById('themeSelect');
  const aiToggle       = document.getElementById('aiSummaryToggle');
  const newTabToggle   = document.getElementById('newTabToggle');
  const perPageSel     = document.getElementById('resultsPerPage');
  const saveBtn        = document.getElementById('saveKeysBtn');
  const saveMsg        = document.getElementById('saveMsg');

  if (braveInput)     braveInput.value = braveKey;
  if (anthropicInput) anthropicInput.value = anthropicKey;
  if (themeSelect)    themeSelect.value = themePref;
  if (aiToggle)       aiToggle.checked = aiEnabled;
  if (newTabToggle)   newTabToggle.checked = newTab;
  if (perPageSel)     perPageSel.value = perPage;

  // Save keys
  saveBtn?.addEventListener('click', () => {
    const bk = braveInput?.value.trim() || '';
    const ak = anthropicInput?.value.trim() || '';

    localStorage.setItem('lumo-brave-key', bk);
    localStorage.setItem('lumo-anthropic-key', ak);

    // Inject into runtime config
    if (typeof LUMO_CONFIG !== 'undefined') {
      LUMO_CONFIG.BRAVE_API_KEY = bk || 'YOUR_BRAVE_API_KEY_HERE';
      LUMO_CONFIG.ANTHROPIC_API_KEY = ak || 'YOUR_ANTHROPIC_API_KEY_HERE';
    }

    // Show saved message
    if (saveMsg) {
      saveMsg.textContent = '✓ Keys saved! They will be used on your next search.';
      saveMsg.style.opacity = '1';
      setTimeout(() => saveMsg.style.opacity = '0', 3000);
    }
  });

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

  // Load saved API keys into runtime config on page load
  if (typeof LUMO_CONFIG !== 'undefined') {
    if (braveKey) LUMO_CONFIG.BRAVE_API_KEY = braveKey;
    if (anthropicKey) LUMO_CONFIG.ANTHROPIC_API_KEY = anthropicKey;
  }
});
