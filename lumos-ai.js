// ============================================================
//  LUMO — lumos-ai.js
//  Mistral Agent + Chat History System
// ============================================================

const AGENT_ID = 'ag_019d17d5019e70a98dbd98cfc6c02bd4';
let conversationId = null;
let isLoading = false;
let currentChatId = null;
let sidebarExpanded = localStorage.getItem('lumos-sidebar') === 'open';

// --- Storage helpers ---
function getChats() {
  try { return JSON.parse(localStorage.getItem('lumos-chats') || '[]'); }
  catch { return []; }
}
function saveChats(chats) {
  localStorage.setItem('lumos-chats', JSON.stringify(chats));
}
function getCurrentChat() {
  return getChats().find(c => c.id === currentChatId) || null;
}
function updateCurrentChat(patch) {
  const chats = getChats();
  const idx = chats.findIndex(c => c.id === currentChatId);
  if (idx !== -1) { Object.assign(chats[idx], patch); saveChats(chats); }
}

// --- Sidebar expand/collapse ---
function setSidebarExpanded(expanded) {
  sidebarExpanded = expanded;
  localStorage.setItem('lumos-sidebar', expanded ? 'open' : 'closed');
  const sidebar = document.getElementById('historySidebar');
  if (expanded) sidebar.classList.add('expanded');
  else sidebar.classList.remove('expanded');
  renderHistory();
}

document.addEventListener('DOMContentLoaded', () => {
  if (sidebarExpanded) document.getElementById('historySidebar')?.classList.add('expanded');

  document.getElementById('historyExpandBtn')?.addEventListener('click', () => setSidebarExpanded(true));
  document.getElementById('historyCollapseBtn')?.addEventListener('click', () => setSidebarExpanded(false));

  const newChat = () => startNewChat();
  document.getElementById('newChatBtnRail')?.addEventListener('click', newChat);
  document.getElementById('newChatBtnPanel')?.addEventListener('click', newChat);
  document.getElementById('newChatBtnNav')?.addEventListener('click', newChat);

  // Input handlers
  const input = document.getElementById('lumosInput');
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('lumosSend')?.addEventListener('click', sendMessage);

  renderHistory();
});

// --- New chat ---
function startNewChat() {
  currentChatId = null;
  conversationId = null;
  document.getElementById('messages').innerHTML = '';
  document.getElementById('currentChatLabel').textContent = 'New conversation';

  // Re-add welcome
  const welcome = document.createElement('div');
  welcome.className = 'welcome-msg';
  welcome.id = 'welcomeMsg';
  welcome.innerHTML = `
    <div class="welcome-icon">🤖</div>
    <h2>Lumos AI</h2>
    <p>Your AI assistant powered by Mistral. Ask me anything — research, writing, coding, brainstorming, and more.</p>
    <div class="starter-chips">
      <button class="starter-chip" onclick="sendStarter('What can you help me with?')">What can you do?</button>
      <button class="starter-chip" onclick="sendStarter('Write me a short poem about the internet')">Write a poem</button>
      <button class="starter-chip" onclick="sendStarter('Explain quantum computing simply')">Explain quantum computing</button>
      <button class="starter-chip" onclick="sendStarter('Help me brainstorm app ideas')">Brainstorm ideas</button>
    </div>
  `;
  document.getElementById('messages').appendChild(welcome);
  renderHistory();
  document.getElementById('lumosInput')?.focus();
}

// --- Load a past chat ---
function loadChat(id) {
  const chats = getChats();
  const chat = chats.find(c => c.id === id);
  if (!chat) return;

  currentChatId = id;
  conversationId = chat.conversationId || null;

  const messagesEl = document.getElementById('messages');
  messagesEl.innerHTML = '';
  document.getElementById('currentChatLabel').textContent = chat.title || 'Chat';

  chat.messages.forEach(m => renderMessage(m.role, m.content));
  messagesEl.scrollTo({ top: messagesEl.scrollHeight });
  renderHistory();
}

// --- Delete a chat ---
function deleteChat(id, e) {
  e.stopPropagation();
  const chats = getChats().filter(c => c.id !== id);
  saveChats(chats);
  if (currentChatId === id) startNewChat();
  else renderHistory();
}

// --- Render sidebar ---
function renderHistory() {
  const chats = getChats();
  const railEl = document.getElementById('historyRailChats');
  const listEl = document.getElementById('historyList');

  // Rail (collapsed) — just dots/icons
  if (railEl) {
    railEl.innerHTML = chats.slice(0, 12).map(c => `
      <button class="rail-chat-dot ${c.id === currentChatId ? 'active' : ''}"
        onclick="loadChat('${c.id}')" title="${escHtml(c.title || 'Chat')}">
        💬
      </button>
    `).join('');
  }

  // Full panel (expanded)
  if (listEl) {
    if (!chats.length) {
      listEl.innerHTML = '<div class="history-empty">No chats yet.<br>Start a conversation!</div>';
      return;
    }
    // Group by date
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const groups = { Today: [], Yesterday: [], Older: [] };
    chats.forEach(c => {
      const d = new Date(c.updatedAt).toDateString();
      if (d === today) groups.Today.push(c);
      else if (d === yesterday) groups.Yesterday.push(c);
      else groups.Older.push(c);
    });

    listEl.innerHTML = Object.entries(groups)
      .filter(([, items]) => items.length)
      .map(([label, items]) => `
        <div class="history-group-label">${label}</div>
        ${items.map(c => `
          <div class="history-item ${c.id === currentChatId ? 'active' : ''}" onclick="loadChat('${c.id}')">
            <span class="history-item-title">${escHtml(c.title || 'Untitled chat')}</span>
            <button class="history-item-delete" onclick="deleteChat('${c.id}', event)" title="Delete">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        `).join('')}
      `).join('');
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Render a single message into the DOM ---
function renderMessage(role, content) {
  document.getElementById('welcomeMsg')?.remove();
  const messagesEl = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="msg-bubble">${formatMessage(content)}</div>
  `;
  messagesEl.appendChild(div);
  return div;
}

function addMessage(role, content) {
  const div = renderMessage(role, content);
  const messagesEl = document.getElementById('messages');
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

  // Persist to current chat
  if (currentChatId) {
    const chats = getChats();
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
      chat.messages.push({ role, content });
      chat.updatedAt = Date.now();
      saveChats(chats);
      renderHistory();
    }
  }
  return div;
}

function formatMessage(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code style="background:var(--glass-bg-strong);padding:0.1em 0.3em;border-radius:4px;font-size:0.88em">$1</code>')
    .replace(/\n/g,'<br>');
}

function showTyping() {
  document.getElementById('welcomeMsg')?.remove();
  const messagesEl = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg ai'; div.id = 'typingIndicator';
  div.innerHTML = `<div class="msg-avatar">🤖</div><div class="msg-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  messagesEl.appendChild(div);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}
function hideTyping() { document.getElementById('typingIndicator')?.remove(); }

function sendStarter(text) {
  const input = document.getElementById('lumosInput');
  if (input) input.value = text;
  sendMessage();
}

// --- Send message ---
async function sendMessage() {
  const input = document.getElementById('lumosInput');
  const sendBtn = document.getElementById('lumosSend');
  const text = input?.value.trim();
  if (!text || isLoading) return;

  const key = LUMO_CONFIG.MISTRAL_API_KEY;
  if (!key || key === 'YOUR_MISTRAL_API_KEY_HERE') {
    renderMessage('ai', 'Please add your Mistral API key to config.js to use Lumos AI!');
    return;
  }

  isLoading = true;
  if (input) { input.value = ''; input.style.height = 'auto'; }
  if (sendBtn) sendBtn.disabled = true;

  // Create new chat record on first message
  if (!currentChatId) {
    const id = 'chat_' + Date.now();
    currentChatId = id;
    const title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    const chats = getChats();
    chats.unshift({ id, title, messages: [], conversationId: null, createdAt: Date.now(), updatedAt: Date.now() });
    saveChats(chats);
    document.getElementById('currentChatLabel').textContent = title;
    renderHistory();
  }

  addMessage('user', text);
  showTyping();

  try {
    let data;
    if (!conversationId) {
      const res = await fetch('https://api.mistral.ai/v1/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ agent_id: AGENT_ID, inputs: [{ role: 'user', content: text }], stream: false })
      });
      data = await res.json();
      if (data.id) {
        conversationId = data.id;
        updateCurrentChat({ conversationId: data.id });
      }
    } else {
      const res = await fetch(`https://api.mistral.ai/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ inputs: [{ role: 'user', content: text }], stream: false })
      });
      data = await res.json();
    }

    hideTyping();
    const outputs = data.outputs || data.messages || [];
    const reply = outputs.filter(m => m.role === 'assistant').pop()?.content
      || data.content || data.choices?.[0]?.message?.content
      || 'Sorry, I could not get a response. Please try again.';

    addMessage('ai', reply);

  } catch (err) {
    hideTyping();
    console.error('Lumos AI error:', err);
    addMessage('ai', 'Something went wrong. Check your API key and try again.');
  }

  isLoading = false;
  if (sendBtn) sendBtn.disabled = false;
  input?.focus();
}
