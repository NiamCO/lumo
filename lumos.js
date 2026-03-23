// ============================================================
//  LUMO — lumos-ai.js
//  Mistral Agent conversation handler
// ============================================================

const AGENT_ID = 'ag_019d17d5019e70a98dbd98cfc6c02bd4';
let conversationId = null;
let isLoading = false;

const messagesEl = document.getElementById('messages');
const input = document.getElementById('lumosInput');
const sendBtn = document.getElementById('lumosSend');
const welcomeMsg = document.getElementById('welcomeMsg');

// Auto-grow textarea
input?.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
});

input?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn?.addEventListener('click', sendMessage);

function sendStarter(text) {
  if (input) input.value = text;
  sendMessage();
}

function addMessage(role, content) {
  welcomeMsg?.remove();
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '🤖' : '👤'}</div>
    <div class="msg-bubble">${formatMessage(content)}</div>
  `;
  messagesEl?.appendChild(div);
  messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  return div;
}

function formatMessage(text) {
  // Basic markdown-ish formatting
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--glass-bg-strong);padding:0.1em 0.3em;border-radius:4px;font-size:0.88em">$1</code>')
    .replace(/\n/g, '<br>');
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  messagesEl?.appendChild(div);
  messagesEl?.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

function hideTyping() {
  document.getElementById('typingIndicator')?.remove();
}

async function sendMessage() {
  const text = input?.value.trim();
  if (!text || isLoading) return;

  const key = LUMO_CONFIG.MISTRAL_API_KEY;
  if (!key || key === 'YOUR_MISTRAL_API_KEY_HERE') {
    addMessage('ai', 'Please add your Mistral API key to config.js to use Lumos AI!');
    return;
  }

  isLoading = true;
  if (input) { input.value = ''; input.style.height = 'auto'; }
  if (sendBtn) sendBtn.disabled = true;

  addMessage('user', text);
  showTyping();

  try {
    let data;
    if (!conversationId) {
      // Start new conversation
      const res = await fetch('https://api.mistral.ai/v1/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          agent_id: AGENT_ID,
          inputs: [{ role: 'user', content: text }],
          stream: false,
        })
      });
      data = await res.json();
      if (data.id) conversationId = data.id;
    } else {
      // Continue conversation
      const res = await fetch(`https://api.mistral.ai/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          inputs: [{ role: 'user', content: text }],
          stream: false,
        })
      });
      data = await res.json();
    }

    hideTyping();

    // Extract reply from response
    const outputs = data.outputs || data.messages || [];
    const reply = outputs.filter(m => m.role === 'assistant').pop()?.content
      || data.content
      || data.choices?.[0]?.message?.content
      || 'Sorry, I could not get a response. Please try again.';

    addMessage('ai', reply);

  } catch (err) {
    hideTyping();
    console.error('Lumos AI error:', err);
    addMessage('ai', 'Something went wrong connecting to Lumos AI. Check your API key and try again.');
  }

  isLoading = false;
  if (sendBtn) sendBtn.disabled = false;
  input?.focus();
}
