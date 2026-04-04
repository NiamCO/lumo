// ============================================================
//  LODE — lode.js
//  Coding AI · Mistral Agent · Projects + Chat History
// ============================================================

const LODE_AGENT_ID = 'ag_019d55bb9c1a765d8585a492cf2262b9';
const STORE_KEY = 'lode-data'; // { projects: [], chats: [] }

let currentChatId = null;
let conversationId = null;
let isLoading = false;
let sidebarOpen = localStorage.getItem('lode-sidebar') !== 'closed';

// ── Data helpers ──────────────────────────────────────────
function getData() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { projects: [], chats: [] }; }
  catch { return { projects: [], chats: [] }; }
}
function saveData(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

function getChats() { return getData().chats; }
function getProjects() { return getData().projects; }

function saveChat(chat) {
  const d = getData();
  const idx = d.chats.findIndex(c => c.id === chat.id);
  if (idx === -1) d.chats.unshift(chat);
  else d.chats[idx] = chat;
  saveData(d);
}

function deleteChat(chatId) {
  const d = getData();
  d.chats = d.chats.filter(c => c.id !== chatId);
  saveData(d);
  if (currentChatId === chatId) startNewChat();
  else renderSidebar();
}

function saveProject(project) {
  const d = getData();
  const idx = d.projects.findIndex(p => p.id === project.id);
  if (idx === -1) d.projects.unshift(project);
  else d.projects[idx] = project;
  saveData(d);
}

function deleteProject(projectId) {
  const d = getData();
  // Unassign chats from this project
  d.chats.forEach(c => { if (c.projectId === projectId) c.projectId = null; });
  d.projects = d.projects.filter(p => p.id !== projectId);
  saveData(d);
  renderSidebar();
}

function getCurrentChat() {
  return getData().chats.find(c => c.id === currentChatId) || null;
}

function patchCurrentChat(patch) {
  const d = getData();
  const idx = d.chats.findIndex(c => c.id === currentChatId);
  if (idx !== -1) { Object.assign(d.chats[idx], patch); saveData(d); }
}

// ── Theme ─────────────────────────────────────────────────
function applyTheme() {
  const saved = localStorage.getItem('lumo-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));
}
function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme');
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lumo-theme', next);
}

// ── Sidebar ───────────────────────────────────────────────
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  localStorage.setItem('lode-sidebar', sidebarOpen ? 'open' : 'closed');
  const sb = document.getElementById('lodeSidebar');
  sb.classList.toggle('expanded', sidebarOpen);
}

function renderSidebar() {
  renderRailDots();
  renderPanel();
}

function renderRailDots() {
  const el = document.getElementById('railChatDots');
  if (!el) return;
  const chats = getChats().slice(0, 14);
  el.innerHTML = chats.map(c => `
    <button title="${escHtml(c.title || 'Chat')}"
      onclick="loadChat('${c.id}')"
      style="width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;
             background:${c.id===currentChatId?'var(--glass-bg-hover)':'none'};
             color:${c.id===currentChatId?'var(--lode-1)':'var(--text-muted)'};
             display:flex;align-items:center;justify-content:center;transition:background 0.15s">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  `).join('');
}

function renderPanel() {
  const el = document.getElementById('panelScroll');
  if (!el) return;
  const d = getData();
  const projects = d.projects;
  const chats = d.chats;
  let html = '';

  // Projects with their chats
  projects.forEach(proj => {
    const projChats = chats.filter(c => c.projectId === proj.id);
    const isOpen = proj.open !== false;
    html += `
      <div class="project-block">
        <div class="project-header" onclick="toggleProject('${proj.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--lode-1)">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <input class="project-name-input" readonly value="${escHtml(proj.name)}"
            onclick="event.stopPropagation()"
            ondblclick="startRenameProject('${proj.id}', this)"
            onblur="finishRenameProject('${proj.id}', this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}if(event.key==='Escape'){this.value=getProjectName('${proj.id}');this.readOnly=true;}"
          />
          <div class="project-actions" onclick="event.stopPropagation()">
            <button class="project-action-btn" onclick="addChatToProject('${proj.id}')" title="New chat in project">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="project-action-btn" onclick="deleteProject('${proj.id}')" title="Delete project" style="color:#ef4444">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
          <svg class="project-chevron ${isOpen?'open':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
        ${isOpen ? `
          <div class="project-chats">
            ${projChats.length ? projChats.map(c => chatItemHtml(c)).join('') : '<div style="font-size:0.75rem;color:var(--text-muted);padding:4px 8px;opacity:0.6">No chats yet</div>'}
          </div>` : ''}
      </div>
    `;
  });

  // Loose chats (no project)
  const looseChats = chats.filter(c => !c.projectId);
  if (looseChats.length) {
    if (projects.length) html += `<div class="loose-section-label">Recent</div>`;
    html += looseChats.map(c => chatItemHtml(c)).join('');
  }

  if (!chats.length && !projects.length) {
    html = '<div style="font-size:0.8rem;color:var(--text-muted);padding:12px 8px;text-align:center;opacity:0.7">No chats yet.<br/>Start coding!</div>';
  }

  el.innerHTML = html;
}

function chatItemHtml(c) {
  return `
    <div class="chat-item ${c.id===currentChatId?'active':''}" onclick="loadChat('${c.id}')" id="chat-item-${c.id}">
      <div class="chat-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <span class="chat-item-title" id="chat-title-${c.id}">${escHtml(c.title || 'Untitled')}</span>
      <div class="chat-item-actions" onclick="event.stopPropagation()">
        <button class="chat-action-btn" onclick="startRenameChat('${c.id}')" title="Rename">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="chat-action-btn" onclick="deleteChat('${c.id}')" title="Delete" style="color:#ef4444">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ── Project actions ───────────────────────────────────────
function createProject() {
  const id = 'proj_' + Date.now();
  saveProject({ id, name: 'New Project', open: true, createdAt: Date.now() });
  renderSidebar();
  // Auto-focus rename
  setTimeout(() => {
    const input = document.querySelector(`input[onblur*="${id}"]`);
    if (input) { input.readOnly = false; input.select(); input.focus(); }
  }, 60);
}

function toggleProject(projectId) {
  const d = getData();
  const p = d.projects.find(p => p.id === projectId);
  if (p) { p.open = !(p.open !== false); saveData(d); renderSidebar(); }
}

function getProjectName(projectId) {
  return getData().projects.find(p => p.id === projectId)?.name || '';
}

function startRenameProject(projectId, inputEl) {
  inputEl.readOnly = false;
  inputEl.select();
}

function finishRenameProject(projectId, inputEl) {
  inputEl.readOnly = true;
  const d = getData();
  const p = d.projects.find(p => p.id === projectId);
  if (p) { p.name = inputEl.value.trim() || 'Untitled Project'; saveData(d); renderSidebar(); }
}

function addChatToProject(projectId) {
  const id = 'chat_' + Date.now();
  const chat = { id, title: 'New chat', messages: [], conversationId: null, projectId, createdAt: Date.now(), updatedAt: Date.now() };
  saveChat(chat);
  currentChatId = id;
  conversationId = null;
  renderSidebar();
  resetMessages();
  document.getElementById('chatLabel').textContent = 'New chat';
  document.getElementById('lodeInput')?.focus();
  // Auto-rename
  setTimeout(() => startRenameChat(id), 80);
}

// ── Chat rename ───────────────────────────────────────────
function startRenameChat(chatId) {
  const titleEl = document.getElementById('chat-title-' + chatId);
  if (!titleEl) return;
  const current = getData().chats.find(c => c.id === chatId)?.title || '';
  const input = document.createElement('input');
  input.className = 'chat-item-title-input';
  input.value = current;
  input.onclick = e => e.stopPropagation();
  input.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  };
  input.onblur = () => {
    const newName = input.value.trim() || current;
    const d = getData();
    const c = d.chats.find(c => c.id === chatId);
    if (c) { c.title = newName; saveData(d); }
    if (currentChatId === chatId) document.getElementById('chatLabel').textContent = newName;
    renderSidebar();
  };
  titleEl.replaceWith(input);
  input.select();
  input.focus();
}

// ── Chat lifecycle ────────────────────────────────────────
function startNewChat(projectId = null) {
  currentChatId = null;
  conversationId = null;
  resetMessages();
  document.getElementById('chatLabel').textContent = 'New conversation';
  renderSidebar();
  document.getElementById('lodeInput')?.focus();
}

function resetMessages() {
  const el = document.getElementById('lodeMessages');
  el.innerHTML = `
    <div class="lode-welcome" id="lodeWelcome">
      <div class="lode-welcome-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
      </div>
      <h2>Lode</h2>
      <p>Your coding AI. Ask anything about code — debugging, architecture, reviews, explanations, and generation in any language.</p>
      <div class="lode-chips">
        <button class="lode-chip" onclick="sendStarter('Review this code for bugs and improvements')">Review my code</button>
        <button class="lode-chip" onclick="sendStarter('Explain how async/await works in JavaScript')">Explain async/await</button>
        <button class="lode-chip" onclick="sendStarter('Write a REST API in Python with FastAPI')">Build a REST API</button>
        <button class="lode-chip" onclick="sendStarter('What are the best practices for React performance?')">React performance</button>
        <button class="lode-chip" onclick="sendStarter('Help me set up a CI/CD pipeline')">CI/CD pipeline</button>
      </div>
    </div>
  `;
}

function loadChat(id) {
  const chat = getData().chats.find(c => c.id === id);
  if (!chat) return;
  currentChatId = id;
  conversationId = chat.conversationId || null;
  document.getElementById('chatLabel').textContent = chat.title || 'Chat';
  const el = document.getElementById('lodeMessages');
  el.innerHTML = '';
  chat.messages.forEach(m => renderMessage(m.role, m.content, false));
  el.scrollTop = el.scrollHeight;
  renderSidebar();
}

// ── Render messages ───────────────────────────────────────
function renderMessage(role, content, animate = true) {
  document.getElementById('lodeWelcome')?.remove();
  const el = document.getElementById('lodeMessages');
  const row = document.createElement('div');
  row.className = `lode-msg ${role}`;
  if (!animate) row.style.animation = 'none';

  const aiIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  const userIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

  row.innerHTML = `
    <div class="lode-msg-av">${role === 'ai' ? aiIcon : userIcon}</div>
    <div class="lode-msg-body">
      <div class="lode-msg-bubble">${formatContent(content)}</div>
    </div>
  `;
  el.appendChild(row);
  return row;
}

function addMessage(role, content) {
  const row = renderMessage(role, content, true);
  const el = document.getElementById('lodeMessages');
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  // Save to storage
  if (currentChatId) {
    patchCurrentChat({
      messages: [...(getCurrentChat()?.messages || []), { role, content }],
      updatedAt: Date.now()
    });
    renderSidebar();
  }
  return row;
}

function showTyping() {
  document.getElementById('lodeWelcome')?.remove();
  const el = document.getElementById('lodeMessages');
  const row = document.createElement('div');
  row.className = 'lode-msg ai'; row.id = 'lodeTyping';
  const aiIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
  row.innerHTML = `<div class="lode-msg-av">${aiIcon}</div><div class="lode-msg-body"><div class="lode-msg-bubble"><div class="lode-typing"><div class="lode-dot"></div><div class="lode-dot"></div><div class="lode-dot"></div></div></div></div>`;
  el.appendChild(row);
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}
function hideTyping() { document.getElementById('lodeTyping')?.remove(); }

// ── Format content (markdown-lite + code blocks) ──────────
function formatContent(text) {
  // Escape HTML first
  let out = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Fenced code blocks ```lang\n...\n```
  out = out.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = 'cb_' + Math.random().toString(36).slice(2,8);
    return `<pre id="${id}"><button class="copy-code-btn" onclick="copyCode('${id}')">Copy</button><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italic
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  // Headers
  out = out.replace(/^### (.*)/gm, '<h4 style="font-size:0.95rem;font-weight:700;margin:12px 0 4px">$1</h4>');
  out = out.replace(/^## (.*)/gm, '<h3 style="font-size:1.05rem;font-weight:700;margin:14px 0 5px">$1</h3>');
  out = out.replace(/^# (.*)/gm, '<h2 style="font-size:1.15rem;font-weight:700;margin:16px 0 6px">$1</h2>');

  // Horizontal rule
  out = out.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--glass-border);margin:12px 0"/>');

  // Bullet lists
  out = out.replace(/^[\*\-] (.+)/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>');
  out = out.replace(/(<li[^>]*>.*<\/li>\n?)+/g, s => `<ul style="padding-left:18px;margin:6px 0">${s}</ul>`);

  // Numbered lists
  out = out.replace(/^\d+\. (.+)/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>');

  // Line breaks (not inside pre)
  out = out.replace(/\n/g, '<br>');

  return out;
}

function copyCode(preId) {
  const pre = document.getElementById(preId);
  const code = pre?.querySelector('code')?.textContent || '';
  navigator.clipboard.writeText(code).then(() => {
    const btn = pre?.querySelector('.copy-code-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1800); }
  });
}

function sendStarter(text) {
  const input = document.getElementById('lodeInput');
  if (input) { input.value = text; input.dispatchEvent(new Event('input')); }
  sendMessage();
}

// ── Send ──────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('lodeInput');
  const sendBtn = document.getElementById('lodeSend');
  const text = input?.value.trim();
  if (!text || isLoading) return;

  const key = LUMO_CONFIG.MISTRAL_API_KEY;
  if (!key || key === 'YOUR_MISTRAL_API_KEY_HERE') {
    renderMessage('ai', 'Please add your Mistral API key to config.js to use Lode!');
    return;
  }

  isLoading = true;
  input.value = ''; input.style.height = 'auto';
  if (sendBtn) sendBtn.disabled = true;

  // Create chat record on first message
  if (!currentChatId) {
    const id = 'chat_' + Date.now();
    currentChatId = id;
    const title = text.length > 42 ? text.slice(0, 42) + '…' : text;
    saveChat({ id, title, messages: [], conversationId: null, projectId: null, createdAt: Date.now(), updatedAt: Date.now() });
    document.getElementById('chatLabel').textContent = title;
    renderSidebar();
  }

  addMessage('user', text);
  showTyping();

  try {
    let data;
    if (!conversationId) {
      // Start new Mistral conversation
      const res = await fetch('https://api.mistral.ai/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          agent_id: LODE_AGENT_ID,
          inputs: [{ role: 'user', content: text }],
          stream: false
        })
      });
      data = await res.json();
      if (data.id) {
        conversationId = data.id;
        patchCurrentChat({ conversationId: data.id });
      }
    } else {
      // Continue conversation
      const res = await fetch(`https://api.mistral.ai/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ inputs: [{ role: 'user', content: text }], stream: false })
      });
      data = await res.json();
    }

    hideTyping();

    // Log raw response so we can debug if needed
    console.log('Lode API response:', JSON.stringify(data));

    // Mistral conversations beta returns outputs[] with type/content
    // Each output may be { role, content } or { type: 'message', content: [{type:'text',text:'...'}] }
    let reply = null;

    // Try outputs array first (beta conversations endpoint)
    if (data.outputs && Array.isArray(data.outputs)) {
      for (const o of [...data.outputs].reverse()) {
        if (o.role === 'assistant' || o.type === 'message') {
          if (typeof o.content === 'string') { reply = o.content; break; }
          if (Array.isArray(o.content)) {
            const txt = o.content.find(c => c.type === 'text');
            if (txt?.text) { reply = txt.text; break; }
          }
        }
      }
    }

    // Fallback: messages array
    if (!reply && data.messages && Array.isArray(data.messages)) {
      for (const m of [...data.messages].reverse()) {
        if (m.role === 'assistant') {
          if (typeof m.content === 'string') { reply = m.content; break; }
          if (Array.isArray(m.content)) {
            const txt = m.content.find(c => c.type === 'text');
            if (txt?.text) { reply = txt.text; break; }
          }
        }
      }
    }

    // Other fallbacks
    if (!reply) reply = data.content || data.choices?.[0]?.message?.content;

    // If still nothing, show the raw data so we can debug
    if (!reply) reply = 'No response text found. Raw: ' + JSON.stringify(data).slice(0, 300);

    addMessage('ai', reply);

  } catch (err) {
    hideTyping();
    console.error('Lode error:', err);
    addMessage('ai', `Error: ${err.message || 'Something went wrong. Check your API key and try again.'}`);
  }

  isLoading = false;
  if (sendBtn) sendBtn.disabled = false;
  input?.focus();
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();

  // Restore sidebar state
  if (sidebarOpen) document.getElementById('lodeSidebar').classList.add('expanded');

  // Input auto-resize + send
  const input = document.getElementById('lodeInput');
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  renderSidebar();
});
