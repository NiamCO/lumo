// ============================================================
//  LUMO MAIL — lumo-mail.js
//  Reads real Gmail via Anthropic API + Gmail MCP
// ============================================================

const GMAIL_MCP_URL = 'https://gmail.mcp.claude.com/mcp';
let currentFolder = 'inbox';
let currentMsgs = [];
let activeMessageId = null;
let userEmail = '';

// ── Theme ─────────────────────────────────────────────────
(function() {
  const saved = localStorage.getItem('lumo-theme');
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', saved || (dark ? 'dark' : 'light'));
})();

// ── API helper — calls Anthropic with Gmail MCP ───────────
async function callGmailTool(toolName, toolInput) {
  const key = LUMO_CONFIG.MISTRAL_API_KEY; // reuse config field — user should add anthropic key
  const anthropicKey = LUMO_CONFIG.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    showToast('Add ANTHROPIC_API_KEY to config.js');
    throw new Error('No Anthropic API key');
  }

  // Build a prompt that instructs Claude to use the Gmail tool
  const toolPrompts = {
    search_messages: `Search Gmail with query: ${JSON.stringify(toolInput.q || '')} maxResults: ${toolInput.maxResults || 20}. Return the raw JSON list of messages.`,
    read_message: `Read Gmail message with ID: ${toolInput.messageId}. Return the full message content as JSON.`,
    read_thread: `Read Gmail thread with ID: ${toolInput.threadId}. Return the full thread as JSON.`,
    list_labels: `List all Gmail labels. Return as JSON.`,
    create_draft: `Create a Gmail draft with: to="${toolInput.to || ''}", subject="${toolInput.subject || ''}", body="${(toolInput.body||'').replace(/"/g,"'")}", contentType="${toolInput.contentType||'text/plain'}". Confirm when done.`,
    get_profile: `Get my Gmail profile. Return email address and info as JSON.`,
  };

  const prompt = toolPrompts[toolName] || `Call Gmail tool ${toolName} with ${JSON.stringify(toolInput)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      mcp_servers: [{ type: 'url', url: GMAIL_MCP_URL, name: 'gmail' }],
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Extract text content from response
  const textBlocks = (data.content || []).filter(b => b.type === 'text');
  const fullText = textBlocks.map(b => b.text).join('\n');

  // Try to extract JSON from the response
  const jsonMatch = fullText.match(/```json\n?([\s\S]*?)```/) ||
                    fullText.match(/(\{[\s\S]*\})/) ||
                    fullText.match(/(\[[\s\S]*\])/);

  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1]); } catch {}
  }

  // Look for tool_result blocks
  const toolResults = (data.content || []).filter(b => b.type === 'tool_result');
  if (toolResults.length) {
    const resultText = toolResults[0]?.content?.[0]?.text || '';
    try { return JSON.parse(resultText); } catch { return resultText; }
  }

  return fullText;
}

// ── Load folder ───────────────────────────────────────────
const FOLDER_QUERIES = {
  inbox: 'in:inbox',
  unread: 'is:unread',
  starred: 'is:starred',
  sent: 'in:sent',
  drafts: 'in:drafts',
  spam: 'in:spam',
};
const FOLDER_TITLES = {
  inbox: 'Inbox', unread: 'Unread', starred: 'Starred',
  sent: 'Sent', drafts: 'Drafts', spam: 'Spam',
};

async function loadFolder(folder, navEl) {
  currentFolder = folder;
  activeMessageId = null;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  document.getElementById('folderTitle').textContent = FOLDER_TITLES[folder] || folder;
  document.getElementById('emailCount').textContent = '';
  document.getElementById('emailListScroll').innerHTML = '<div class="list-state"><div class="spinner"></div><p>Loading...</p></div>';
  showEmptyDetail();

  try {
    const result = await callGmailTool('search_messages', {
      q: FOLDER_QUERIES[folder] || `in:${folder}`,
      maxResults: 25
    });

    const messages = result?.messages || result || [];
    currentMsgs = Array.isArray(messages) ? messages : [];
    renderEmailList(currentMsgs);
  } catch (err) {
    console.error('Load folder error:', err);
    document.getElementById('emailListScroll').innerHTML = `
      <div class="list-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Error loading mail.<br/><small>${escHtml(err.message)}</small></p>
      </div>`;
  }
}

function refreshFolder() {
  const activeNav = document.querySelector('.nav-item.active');
  loadFolder(currentFolder, activeNav);
}

async function doSearch() {
  const q = document.getElementById('mailSearch').value.trim();
  if (!q) return;
  document.getElementById('folderTitle').textContent = `"${q}"`;
  document.getElementById('emailListScroll').innerHTML = '<div class="list-state"><div class="spinner"></div><p>Searching...</p></div>';
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  try {
    const result = await callGmailTool('search_messages', { q, maxResults: 25 });
    const messages = result?.messages || result || [];
    currentMsgs = Array.isArray(messages) ? messages : [];
    renderEmailList(currentMsgs);
  } catch (err) {
    document.getElementById('emailListScroll').innerHTML = `<div class="list-state"><p>Search failed: ${escHtml(err.message)}</p></div>`;
  }
}

// ── Render email list ─────────────────────────────────────
function renderEmailList(msgs) {
  const el = document.getElementById('emailListScroll');
  if (!msgs.length) {
    el.innerHTML = '<div class="list-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><p>No messages here.</p></div>';
    document.getElementById('emailCount').textContent = '';
    return;
  }

  document.getElementById('emailCount').textContent = msgs.length + (msgs.length >= 25 ? '+' : '') + ' messages';

  // Count unread
  const unreadCount = msgs.filter(m => m.labelIds?.includes('UNREAD')).length;
  const badge = document.getElementById('unread-badge');
  if (unreadCount > 0 && currentFolder === 'inbox') {
    badge.textContent = unreadCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }

  el.innerHTML = msgs.map(msg => {
    const isUnread = msg.labelIds?.includes('UNREAD');
    const from = msg.headers?.From || msg.headers?.from || 'Unknown';
    const subject = msg.headers?.Subject || msg.headers?.subject || '(no subject)';
    const date = msg.headers?.Date || msg.headers?.date || '';
    const snippet = msg.snippet || '';
    const senderName = parseSenderName(from);
    const dateStr = formatEmailDate(date);

    return `
      <div class="email-item ${isUnread ? 'unread' : ''} ${msg.messageId === activeMessageId ? 'active' : ''}"
           onclick="openMessage('${msg.messageId}', '${msg.threadId}')"
           id="eitem-${msg.messageId}">
        ${isUnread ? '<div class="unread-dot"></div>' : ''}
        <div class="email-item-top">
          <span class="email-sender">${escHtml(senderName)}</span>
          <span class="email-date">${escHtml(dateStr)}</span>
        </div>
        <div class="email-subject">${escHtml(subject)}</div>
        <div class="email-snippet">${escHtml(snippet)}</div>
      </div>
    `;
  }).join('');
}

// ── Open message ──────────────────────────────────────────
async function openMessage(messageId, threadId) {
  activeMessageId = messageId;

  // Update list active state
  document.querySelectorAll('.email-item').forEach(el => el.classList.remove('active'));
  const itemEl = document.getElementById('eitem-' + messageId);
  if (itemEl) { itemEl.classList.add('active'); itemEl.classList.remove('unread'); }

  // Show loading in detail pane
  document.getElementById('emailDetail').innerHTML = '<div class="detail-empty"><div class="spinner"></div><p style="margin-top:8px;font-size:0.85rem;color:var(--text-muted)">Loading...</p></div>';

  try {
    const msg = await callGmailTool('read_message', { messageId });
    renderEmailDetail(msg);
  } catch (err) {
    document.getElementById('emailDetail').innerHTML = `<div class="detail-empty"><p>Failed to load: ${escHtml(err.message)}</p></div>`;
  }
}

function renderEmailDetail(msg) {
  const headers = msg?.headers || msg?.payload?.headers || {};
  const from = headers.From || headers.from || 'Unknown';
  const to = headers.To || headers.to || '';
  const subject = headers.Subject || headers.subject || '(no subject)';
  const date = headers.Date || headers.date || '';
  const senderName = parseSenderName(from);
  const senderEmail = parseSenderEmail(from);
  const body = extractEmailBody(msg);
  const threadId = msg.threadId || msg.thread_id || '';
  const messageId = msg.messageId || msg.id || '';

  document.getElementById('emailDetail').innerHTML = `
    <div class="detail-header">
      <div class="detail-subject">${escHtml(subject)}</div>
      <div class="detail-meta">
        <div class="detail-avatar">${(senderName[0] || '?').toUpperCase()}</div>
        <div class="detail-from-info">
          <div class="detail-from-name">${escHtml(senderName)}</div>
          <div class="detail-from-email">${escHtml(senderEmail)}${to ? ` → ${escHtml(to)}` : ''}</div>
        </div>
        <div class="detail-date">${escHtml(formatEmailDate(date))}</div>
        <div class="detail-actions">
          <button class="detail-action-btn" onclick="openReply('${escHtml(threadId)}','${escHtml(senderEmail)}','${escHtml(subject).replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
            Reply
          </button>
          <button class="detail-action-btn" onclick="openCompose('${escHtml(senderEmail)}','Fwd: ${escHtml(subject).replace(/'/g,"\\'")}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
            Forward
          </button>
        </div>
      </div>
    </div>
    <div class="detail-body" id="detailBody"></div>
  `;

  // Set body content safely
  const bodyEl = document.getElementById('detailBody');
  if (body.isHtml) {
    // Sandbox HTML in an iframe-like container
    const sanitized = body.content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/javascript:/gi, '');
    bodyEl.innerHTML = sanitized;
  } else {
    bodyEl.innerHTML = `<pre style="white-space:pre-wrap;font-family:var(--font-main);font-size:0.88rem;line-height:1.7">${escHtml(body.content)}</pre>`;
  }
}

function showEmptyDetail() {
  document.getElementById('emailDetail').innerHTML = `
    <div class="detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <h3>Select an email</h3>
      <p style="font-size:0.82rem;color:var(--text-muted)">Choose a message from the list to read it.</p>
    </div>`;
}

// ── Compose / Reply / Draft ───────────────────────────────
let replyThreadId = null;

function openCompose(to = '', subject = '') {
  replyThreadId = null;
  document.getElementById('composeTo').value = to;
  document.getElementById('composeSubject').value = subject;
  document.getElementById('composeBody').value = '';
  document.getElementById('composeStatus').textContent = '';
  document.querySelector('.compose-title').textContent = 'New Message';
  document.getElementById('composeOverlay').classList.add('open');
  setTimeout(() => document.getElementById(to ? 'composeSubject' : 'composeTo').focus(), 100);
}

function openReply(threadId, toEmail, subject) {
  replyThreadId = threadId;
  document.getElementById('composeTo').value = toEmail;
  document.getElementById('composeSubject').value = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
  document.getElementById('composeBody').value = '';
  document.getElementById('composeStatus').textContent = '';
  document.querySelector('.compose-title').textContent = 'Reply';
  document.getElementById('composeOverlay').classList.add('open');
  setTimeout(() => document.getElementById('composeBody').focus(), 100);
}

function closeCompose() {
  document.getElementById('composeOverlay').classList.remove('open');
  replyThreadId = null;
}

async function saveDraft() {
  const to = document.getElementById('composeTo').value.trim();
  const subject = document.getElementById('composeSubject').value.trim();
  const body = document.getElementById('composeBody').value.trim();
  const statusEl = document.getElementById('composeStatus');

  if (!body) { statusEl.textContent = 'Write something first.'; return; }

  statusEl.textContent = 'Saving draft…';

  try {
    await callGmailTool('create_draft', {
      to: to || undefined,
      subject: subject || undefined,
      body,
      contentType: 'text/plain',
      threadId: replyThreadId || undefined
    });
    statusEl.textContent = '✓ Draft saved to Gmail';
    showToast('Draft saved to Gmail!');
    setTimeout(closeCompose, 1200);
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
}

// ── Load user profile ─────────────────────────────────────
async function loadProfile() {
  try {
    const result = await callGmailTool('get_profile', {});
    const email = result?.emailAddress || result?.email || '';
    if (email) {
      userEmail = email;
      document.getElementById('userEmail').textContent = email;
      document.getElementById('userInitial').textContent = email[0].toUpperCase();
    }
  } catch {}
}

// ── Helpers ───────────────────────────────────────────────
function parseSenderName(from) {
  const match = from.match(/^"?([^"<]+)"?\s*<.*>$/);
  return match ? match[1].trim() : from.replace(/<.*>/, '').trim() || from;
}
function parseSenderEmail(from) {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}

function extractEmailBody(msg) {
  // Try direct body fields
  if (msg?.body) return { content: msg.body, isHtml: msg.body.includes('<html') || msg.body.includes('<div') };
  if (msg?.snippet) return { content: msg.snippet, isHtml: false };

  // Try payload parts
  const payload = msg?.payload;
  if (payload?.body?.data) {
    const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    return { content: decoded, isHtml: payload.mimeType?.includes('html') };
  }
  if (payload?.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const decoded = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        return { content: decoded, isHtml: true };
      }
      if (part.mimeType === 'text/plain' && part.body?.data) {
        const decoded = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        return { content: decoded, isHtml: false };
      }
    }
  }

  return { content: msg?.snippet || 'No body content available.', isHtml: false };
}

function formatEmailDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now - 86400000).toDateString();
    if (d.toDateString() === today) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === yesterday) return 'Yesterday';
    if (now - d < 7 * 86400000) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Enter to search
  document.getElementById('mailSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  // Close compose on overlay click
  document.getElementById('composeOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('composeOverlay')) closeCompose();
  });

  loadProfile();
  loadFolder('inbox', document.querySelector('.nav-item.active'));
});
