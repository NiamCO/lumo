// ============================================================
//  LUMO CHAT — lumo-chat.js
//  Supabase-powered real-time chat
// ============================================================

const { createClient } = supabase;
const SB = createClient(LUMO_CONFIG.SUPABASE_URL, LUMO_CONFIG.SUPABASE_ANON_KEY);

// ---- State ----
let currentUser = null;
let currentProfile = null;
let currentConvId = null;
let conversations = [];
let convProfiles = {}; // cache of profiles by user id
let messagesCache = {}; // convId -> messages[]
let replyingTo = null; // { id, user_id, content, sender_name }
let selectedDmUser = null;
let selectedGroupUsers = [];
let selectedGiUser = null;
let typingTimeout = null;
let typingSub = null;
let msgSub = null;
let memberSub = null;
let announceSub = null;
let reactionSub = null;
let pendingInviteCount = 0;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  applyStoredTheme();
  const { data: { session } } = await SB.auth.getSession();
  if (session) {
    await boot(session.user);
  }
  SB.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) await boot(session.user);
    if (event === 'SIGNED_OUT') showAuth();
  });

  // Enter key on auth inputs
  document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') handleLogin(); });
  document.getElementById('reg-password').addEventListener('keydown', e => { if(e.key==='Enter') handleRegister(); });
});

async function boot(user) {
  currentUser = user;
  const { data: profile } = await SB.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profile;
  renderSidebarUser();
  showApp();
  await loadConversations();
  subscribeToInvites();
  subscribeToAnnouncements();
  if (currentProfile?.is_admin) {
    document.getElementById('announce-btn').style.display = 'flex';
  }
}

// ============================================================
//  THEME
// ============================================================
function applyStoredTheme() {
  const stored = localStorage.getItem('lumo-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}
function openThemeToggle() {
  const curr = document.documentElement.getAttribute('data-theme');
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lumo-theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (!icon) return;
  if (theme === 'dark') {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="none" stroke="currentColor" stroke-width="2"/>`;
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

// ============================================================
//  AUTH
// ============================================================
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (i===0&&tab==='login')||(i===1&&tab==='register')));
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('auth-error').textContent = '';
}

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Please fill all fields.'; return; }
  const email = username + '@lumo.chat';
  const { error } = await SB.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = 'Invalid username or password.'; }
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const displayName = document.getElementById('reg-displayname').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Please fill all required fields.'; return; }
  if (username.length < 3) { errEl.textContent = 'Username must be at least 3 characters.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (!/^[a-z0-9_]+$/.test(username)) { errEl.textContent = 'Username: only letters, numbers and underscores.'; return; }
  // Check if username taken
  const { data: taken } = await SB.from('profiles').select('id').eq('username', username).maybeSingle();
  if (taken) { errEl.textContent = 'That username is already taken.'; return; }
  const email = username + '@lumo.chat';
  const { data: signUpData, error } = await SB.auth.signUp({ email, password });
  if (error) { errEl.textContent = error.message; return; }
  // Update display name after trigger creates profile (retry loop)
  if (displayName && signUpData?.user?.id) {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 700));
      const { error: upErr } = await SB.from('profiles').update({ display_name: displayName }).eq('id', signUpData.user.id);
      if (!upErr) break;
    }
  }
}

async function handleSignOut() {
  unsubscribeAll();
  await SB.auth.signOut();
  currentUser = null; currentProfile = null; currentConvId = null;
  conversations = []; messagesCache = {};
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').classList.remove('visible');
}
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
}

// ============================================================
//  PROFILE
// ============================================================
function renderSidebarUser() {
  if (!currentProfile) return;
  const name = currentProfile.display_name || currentProfile.username;
  document.getElementById('sidebar-user-name').textContent = name;
  const avatarEl = document.getElementById('sidebar-user-avatar');
  renderAvatarEl(avatarEl, currentProfile, 'sm');
}

function openProfileModal() {
  const p = currentProfile;
  if (!p) return;
  document.getElementById('profile-displayname').value = p.display_name || '';
  const disp = document.getElementById('profile-avatar-display');
  disp.innerHTML = '';
  if (p.avatar_url) {
    const img = document.createElement('img');
    img.src = p.avatar_url; img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    disp.appendChild(img);
  } else {
    disp.textContent = getInitial(p);
  }
  const adminLbl = document.getElementById('profile-admin-label');
  adminLbl.innerHTML = p.is_admin ? '<span class="admin-badge">✨ Creator</span>' : '';
  openModal('profile-modal');
}

async function saveProfile() {
  const displayName = document.getElementById('profile-displayname').value.trim();
  const { error } = await SB.from('profiles').update({ display_name: displayName || null }).eq('id', currentUser.id);
  if (error) { document.getElementById('profile-error').textContent = error.message; return; }
  currentProfile.display_name = displayName || null;
  renderSidebarUser();
  closeModal('profile-modal');
  renderConvList();
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop();
  const path = `avatars/${currentUser.id}.${ext}`;
  const { error: upErr } = await SB.storage.from('avatars').upload(path, file, { upsert: true });
  if (upErr) { document.getElementById('profile-error').textContent = 'Upload failed.'; return; }
  const { data: urlData } = SB.storage.from('avatars').getPublicUrl(path);
  const avatarUrl = urlData.publicUrl;
  await SB.from('profiles').update({ avatar_url: avatarUrl }).eq('id', currentUser.id);
  currentProfile.avatar_url = avatarUrl;
  // Update preview
  const disp = document.getElementById('profile-avatar-display');
  disp.innerHTML = '';
  const img = document.createElement('img');
  img.src = avatarUrl; img.style.cssText = 'width:100%;height:100%;object-fit:cover';
  disp.appendChild(img);
  renderSidebarUser();
}

// ============================================================
//  CONVERSATIONS
// ============================================================
async function loadConversations() {
  // Get all accepted conversations for current user
  const { data: memberships } = await SB.from('conversation_members')
    .select('conversation_id, status')
    .eq('user_id', currentUser.id)
    .eq('status', 'accepted');

  if (!memberships || memberships.length === 0) { renderConvList(); return; }

  const convIds = memberships.map(m => m.conversation_id);
  const { data: convs } = await SB.from('conversations').select('*').in('id', convIds);
  if (!convs) { renderConvList(); return; }

  // For each convo, get members + last message
  await Promise.all(convs.map(async c => {
    const { data: members } = await SB.from('conversation_members')
      .select('user_id, status')
      .eq('conversation_id', c.id)
      .eq('status', 'accepted');
    c.members = members || [];

    // Pre-fetch profiles for DMs
    if (c.type === 'dm') {
      const other = c.members.find(m => m.user_id !== currentUser.id);
      if (other) {
        const profile = await getProfile(other.user_id);
        c.otherProfile = profile;
      }
    }

    // Last message
    const { data: msgs } = await SB.from('messages')
      .select('content, created_at')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1);
    c.lastMessage = msgs?.[0] || null;
  }));

  conversations = convs.sort((a,b) => {
    const aT = a.lastMessage?.created_at || a.created_at;
    const bT = b.lastMessage?.created_at || b.created_at;
    return new Date(bT) - new Date(aT);
  });

  await loadPendingInvites();
  renderConvList();
  subscribeToConversations();
}

async function getProfile(userId) {
  if (convProfiles[userId]) return convProfiles[userId];
  const { data } = await SB.from('profiles').select('*').eq('id', userId).single();
  if (data) convProfiles[userId] = data;
  return data;
}

function renderConvList() {
  const list = document.getElementById('conv-list');
  list.innerHTML = '';

  if (conversations.length === 0) {
    list.innerHTML = '<p style="color:var(--text-3);font-size:0.82rem;padding:8px 10px">No conversations yet. Start one!</p>';
    return;
  }

  conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === currentConvId ? ' active' : '');
    item.onclick = () => openConversation(conv.id);

    let avatarHtml = '';
    let nameHtml = '';
    let previewHtml = '';

    if (conv.type === 'dm') {
      const op = conv.otherProfile;
      avatarHtml = op ? renderAvatarHtml(op, 36) : `<div class="conv-avatar">?</div>`;
      nameHtml = op ? (op.display_name || op.username) : 'Unknown';
    } else {
      // Group - show first letter of group name
      avatarHtml = `<div class="conv-avatar" style="background:var(--glass-bg);font-size:0.85rem;font-weight:700">${(conv.name||'G')[0].toUpperCase()}</div>`;
      nameHtml = conv.name || 'Group';
    }

    previewHtml = conv.lastMessage ? truncate(conv.lastMessage.content, 32) : 'No messages yet';

    item.innerHTML = avatarHtml + `
      <div class="conv-info">
        <div class="conv-name">${escHtml(nameHtml)}</div>
        <div class="conv-preview">${escHtml(previewHtml)}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

// ============================================================
//  OPEN CONVERSATION
// ============================================================
async function openConversation(convId) {
  currentConvId = convId;
  replyingTo = null;
  clearReply();

  // Update sidebar active state
  document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
  const items = document.querySelectorAll('.conv-item');
  const convIdx = conversations.findIndex(c => c.id === convId);
  if (items[convIdx]) items[convIdx].classList.add('active');

  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;

  // Update header
  if (conv.type === 'dm') {
    const op = conv.otherProfile;
    const chAvatar = document.getElementById('ch-avatar');
    if (op) renderAvatarEl(chAvatar, op, 'md');
    document.getElementById('ch-name').textContent = op ? (op.display_name || op.username) : 'Unknown';
    document.getElementById('ch-sub').textContent = 'Direct message';
    document.getElementById('group-info-btn').style.display = 'none';
  } else {
    document.getElementById('ch-avatar').textContent = (conv.name||'G')[0].toUpperCase();
    document.getElementById('ch-name').textContent = conv.name || 'Group';
    const memberCount = conv.members?.length || 0;
    document.getElementById('ch-sub').textContent = `${memberCount} member${memberCount!==1?'s':''}`;
    document.getElementById('group-info-btn').style.display = 'flex';
  }

  // Admin announce btn visible in all convos
  document.getElementById('announce-btn').style.display = currentProfile?.is_admin ? 'flex' : 'none';

  // Show chat view
  document.getElementById('empty-state').style.display = 'none';
  const cv = document.getElementById('chat-view');
  cv.style.display = 'flex';

  // Load messages
  await loadMessages(convId);

  // Subscribe realtime
  unsubscribeMsgSub();
  msgSub = SB.channel('msgs-' + convId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, async payload => {
      const msg = payload.new;
      // Fetch profile if needed
      if (!convProfiles[msg.user_id]) await getProfile(msg.user_id);
      if (!messagesCache[convId]) messagesCache[convId] = [];
      messagesCache[convId].push(msg);
      await renderNewMessage(msg, convId);
      updateConvPreview(convId, msg.content);
    })
    .subscribe();

  // Reactions realtime
  if (reactionSub) { SB.removeChannel(reactionSub); reactionSub = null; }
  reactionSub = SB.channel('reactions-' + convId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, async () => {
      await loadMessages(convId); // re-render (simple approach for reactions)
    })
    .subscribe();

  // Typing
  subscribeToTyping(convId);
}

function updateConvPreview(convId, content) {
  const conv = conversations.find(c => c.id === convId);
  if (conv) conv.lastMessage = { content, created_at: new Date().toISOString() };
  renderConvList();
  // Re-mark active
  const convIdx = conversations.findIndex(c => c.id === convId);
  const items = document.querySelectorAll('.conv-item');
  if (items[convIdx]) items[convIdx].classList.add('active');
}

// ============================================================
//  MESSAGES
// ============================================================
async function loadMessages(convId) {
  const { data: msgs } = await SB.from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (!msgs) return;

  // Pre-fetch all profiles
  const uids = [...new Set(msgs.map(m => m.user_id))];
  await Promise.all(uids.map(uid => getProfile(uid)));

  // Fetch all reactions for these messages
  const msgIds = msgs.map(m => m.id);
  let reactionsMap = {};
  if (msgIds.length > 0) {
    const { data: reactions } = await SB.from('message_reactions').select('*').in('message_id', msgIds);
    (reactions || []).forEach(r => {
      if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
      reactionsMap[r.message_id].push(r);
    });
  }

  messagesCache[convId] = msgs;
  renderMessages(msgs, reactionsMap);
}

function renderMessages(msgs, reactionsMap = {}) {
  const area = document.getElementById('messages-area');
  area.innerHTML = '';

  let lastDate = null;
  let lastUserId = null;

  msgs.forEach((msg, idx) => {
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      const div = document.createElement('div');
      div.className = 'date-divider';
      div.innerHTML = `<span>${formatDate(msg.created_at)}</span>`;
      area.appendChild(div);
      lastDate = msgDate;
      lastUserId = null;
    }

    const reactions = reactionsMap[msg.id] || [];
    const grouped = msg.user_id === lastUserId;

    if (msg.is_announcement) {
      area.appendChild(renderAnnouncementEl(msg));
    } else {
      area.appendChild(renderMsgEl(msg, reactions, grouped));
    }
    lastUserId = msg.user_id;
  });

  area.scrollTop = area.scrollHeight;
}

async function renderNewMessage(msg, convId) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  const msgs = messagesCache[convId] || [];
  const prevMsg = msgs[msgs.length - 2]; // the one before this new one
  const grouped = prevMsg && prevMsg.user_id === msg.user_id;

  const reactions = [];
  const el = msg.is_announcement ? renderAnnouncementEl(msg) : renderMsgEl(msg, reactions, grouped);
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function renderMsgEl(msg, reactions, grouped) {
  const profile = convProfiles[msg.user_id];
  const isOut = msg.user_id === currentUser.id;
  const isAdmin = profile?.is_admin;

  const row = document.createElement('div');
  row.className = `msg-row ${isOut?'out':'in'}${grouped?' grouped':''}${isAdmin?' admin-msg':''}`;
  row.dataset.msgId = msg.id;

  // Avatar
  let avatarHtml = '';
  if (profile) {
    avatarHtml = renderAvatarHtml(profile, 28);
  } else {
    avatarHtml = `<div class="msg-avatar">?</div>`;
  }

  // Reply preview
  let replyHtml = '';
  if (msg.reply_to) {
    const repliedMsg = (messagesCache[currentConvId] || []).find(m => m.id === msg.reply_to);
    if (repliedMsg) {
      const rp = convProfiles[repliedMsg.user_id];
      replyHtml = `<div class="msg-reply-preview"><strong>${escHtml(rp?.display_name || rp?.username || 'User')}</strong>${escHtml(truncate(repliedMsg.content, 50))}</div>`;
    }
  }

  // Reactions
  const likesArr = reactions.filter(r => r.reaction_type === 'like');
  const dislikesArr = reactions.filter(r => r.reaction_type === 'dislike');
  const myLike = likesArr.some(r => r.user_id === currentUser.id);
  const myDislike = dislikesArr.some(r => r.reaction_type === 'dislike' && r.user_id === currentUser.id);
  let reactHtml = '';
  if (reactions.length > 0) {
    reactHtml = `<div class="msg-reactions">`;
    if (likesArr.length > 0) reactHtml += `<div class="reaction-pill${myLike?' mine':''}" onclick="toggleReaction('${msg.id}','like')"><svg viewBox="0 0 24 24" fill="${myLike?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>${likesArr.length}</div>`;
    if (dislikesArr.length > 0) reactHtml += `<div class="reaction-pill${myDislike?' mine':''}" onclick="toggleReaction('${msg.id}','dislike')"><svg viewBox="0 0 24 24" fill="${myDislike?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>${dislikesArr.length}</div>`;
    reactHtml += `</div>`;
  }

  const senderName = isAdmin
    ? `<span style="color:var(--admin-gold)">✨ ${escHtml(profile?.display_name || profile?.username || 'User')}</span>`
    : escHtml(profile?.display_name || profile?.username || 'User');

  const time = formatTime(msg.created_at);

  row.innerHTML = `
    ${avatarHtml}
    <div>
      ${!grouped && !isOut ? `<div class="msg-sender">${senderName}</div>` : ''}
      <div class="msg-bubble-wrap">
        <div class="msg-actions">
          <button class="msg-action-btn" onclick="setReply('${msg.id}')" title="Reply">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </button>
          <button class="msg-action-btn" onclick="toggleReaction('${msg.id}','like')" title="Like">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
          </button>
          <button class="msg-action-btn" onclick="toggleReaction('${msg.id}','dislike')" title="Dislike">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>
          </button>
        </div>
        <div class="msg-bubble">
          ${replyHtml}
          ${escHtml(msg.content)}
        </div>
        ${reactHtml}
        <div class="msg-time">${time}</div>
      </div>
    </div>
  `;
  return row;
}

function renderAnnouncementEl(msg) {
  const profile = convProfiles[msg.user_id];
  const el = document.createElement('div');
  el.className = 'announcement-row';
  el.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/>
    </svg>
    <div class="announcement-content">
      <div class="announcement-label">✨ Announcement from ${escHtml(profile?.display_name || 'Niam')}</div>
      <div class="announcement-text">${escHtml(msg.content)}</div>
      <div style="font-size:0.7rem;color:var(--text-3);margin-top:4px">${formatTime(msg.created_at)}</div>
    </div>
  `;
  return el;
}

// ============================================================
//  SEND MESSAGE
// ============================================================
async function sendMessage() {
  const input = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content || !currentConvId) return;

  input.value = '';
  autoResizeTextarea(input);

  const msgData = {
    conversation_id: currentConvId,
    user_id: currentUser.id,
    content,
    reply_to: replyingTo?.id || null,
    is_announcement: false
  };

  clearReply();
  clearTypingIndicator();

  const { error } = await SB.from('messages').insert(msgData);
  if (error) console.error('Send error:', error);

  // Clear typing
  await SB.from('typing_indicators').delete()
    .eq('conversation_id', currentConvId)
    .eq('user_id', currentUser.id);
}

function handleMsgKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ============================================================
//  TYPING
// ============================================================
async function handleTyping() {
  autoResizeTextarea(document.getElementById('msg-input'));
  if (!currentConvId) return;
  await SB.from('typing_indicators').upsert({
    conversation_id: currentConvId,
    user_id: currentUser.id,
    updated_at: new Date().toISOString()
  });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(async () => {
    await SB.from('typing_indicators').delete()
      .eq('conversation_id', currentConvId)
      .eq('user_id', currentUser.id);
  }, 2500);
}

function subscribeToTyping(convId) {
  if (typingSub) { SB.removeChannel(typingSub); typingSub = null; }
  typingSub = SB.channel('typing-' + convId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_indicators', filter: `conversation_id=eq.${convId}` }, async () => {
      await renderTypingIndicator(convId);
    })
    .subscribe();
}

async function renderTypingIndicator(convId) {
  const { data } = await SB.from('typing_indicators')
    .select('user_id, updated_at')
    .eq('conversation_id', convId)
    .neq('user_id', currentUser.id);

  const el = document.getElementById('typing-indicator');
  if (!data || data.length === 0) { el.innerHTML = ''; return; }

  // Filter stale (>3s)
  const now = Date.now();
  const active = data.filter(t => now - new Date(t.updated_at).getTime() < 3000);
  if (active.length === 0) { el.innerHTML = ''; return; }

  const names = await Promise.all(active.map(async t => {
    const p = await getProfile(t.user_id);
    return p?.display_name || p?.username || 'Someone';
  }));

  let txt = '';
  if (names.length === 1) txt = `${names[0]} is typing`;
  else if (names.length === 2) txt = `${names[0]} and ${names[1]} are typing`;
  else txt = `${names[0]}, ${names[1]} and ${names.length-2} more are typing`;

  el.innerHTML = `${escHtml(txt)}<span class="typing-dots"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
}

function clearTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.innerHTML = '';
}

// ============================================================
//  REPLY
// ============================================================
function setReply(msgId) {
  const msgs = messagesCache[currentConvId] || [];
  const msg = msgs.find(m => m.id === msgId);
  if (!msg) return;
  const profile = convProfiles[msg.user_id];
  replyingTo = { id: msg.id, user_id: msg.user_id, content: msg.content, sender_name: profile?.display_name || profile?.username || 'User' };
  document.getElementById('reply-to-name').textContent = replyingTo.sender_name;
  document.getElementById('reply-preview-text').textContent = truncate(msg.content, 40);
  document.getElementById('reply-banner').classList.add('visible');
  document.getElementById('msg-input').focus();
}

function clearReply() {
  replyingTo = null;
  document.getElementById('reply-banner').classList.remove('visible');
}

// ============================================================
//  REACTIONS
// ============================================================
async function toggleReaction(msgId, type) {
  // Check if user already reacted this way
  const { data: existing } = await SB.from('message_reactions')
    .select('id')
    .eq('message_id', msgId)
    .eq('user_id', currentUser.id)
    .eq('reaction_type', type)
    .maybeSingle();

  if (existing) {
    await SB.from('message_reactions').delete().eq('id', existing.id);
  } else {
    // Remove opposite if exists
    await SB.from('message_reactions')
      .delete()
      .eq('message_id', msgId)
      .eq('user_id', currentUser.id);
    await SB.from('message_reactions').insert({ message_id: msgId, user_id: currentUser.id, reaction_type: type });
  }
}

// ============================================================
//  NEW DM
// ============================================================
function openNewDmModal() {
  selectedDmUser = null;
  document.getElementById('dm-user-search').value = '';
  document.getElementById('dm-search-results').innerHTML = '';
  document.getElementById('dm-error').textContent = '';
  openModal('new-dm-modal');
}

async function searchUsers(context) {
  const inputId = context === 'dm' ? 'dm-user-search' : context === 'group' ? 'group-user-search' : 'gi-user-search';
  const resultsId = context === 'dm' ? 'dm-search-results' : context === 'group' ? 'group-search-results' : 'gi-search-results';
  const query = document.getElementById(inputId).value.trim().toLowerCase();
  const results = document.getElementById(resultsId);
  results.innerHTML = '';
  if (query.length < 1) return;

  const { data: users } = await SB.from('profiles')
    .select('*')
    .ilike('username', `%${query}%`)
    .neq('id', currentUser.id)
    .limit(6);

  if (!users || users.length === 0) {
    results.innerHTML = '<p style="color:var(--text-3);font-size:0.82rem;padding:4px 8px">No users found.</p>';
    return;
  }

  users.forEach(u => {
    const item = document.createElement('div');
    item.className = 'user-result';
    item.innerHTML = `<div class="user-result-avatar">${getInitial(u)}</div><div class="user-result-name">${escHtml(u.display_name || u.username)}<span style="color:var(--text-3);font-size:0.78rem;margin-left:4px">@${escHtml(u.username)}</span></div>`;
    item.onclick = () => selectUser(u, context, item, results);
    results.appendChild(item);
  });
}

function selectUser(user, context, itemEl, resultsEl) {
  if (context === 'dm') {
    selectedDmUser = user;
    resultsEl.querySelectorAll('.user-result').forEach(el => el.classList.remove('selected'));
    itemEl.classList.add('selected');
  } else if (context === 'group') {
    if (!selectedGroupUsers.find(u => u.id === user.id)) {
      selectedGroupUsers.push(user);
      renderSelectedMembers();
    }
    document.getElementById('group-user-search').value = '';
    resultsEl.innerHTML = '';
  } else if (context === 'gi') {
    selectedGiUser = user;
    resultsEl.querySelectorAll('.user-result').forEach(el => el.classList.remove('selected'));
    itemEl.classList.add('selected');
  }
}

async function startDm() {
  if (!selectedDmUser) { document.getElementById('dm-error').textContent = 'Select a user first.'; return; }

  // Check if DM already exists
  const existing = conversations.find(c => {
    if (c.type !== 'dm') return false;
    return c.members.some(m => m.user_id === selectedDmUser.id);
  });
  if (existing) { closeModal('new-dm-modal'); openConversation(existing.id); return; }

  // Create conversation — use service role workaround: insert then select via rpc
  // Insert without .select() to avoid RLS blocking read before membership exists
  const { error: convErr } = await SB.from('conversations').insert({ type: 'dm', created_by: currentUser.id });
  if (convErr) { document.getElementById('dm-error').textContent = 'Error creating conversation: ' + convErr.message; return; }

  // Get the conversation we just created (we can read it since created_by = us, or use a direct query)
  const { data: convRow, error: fetchErr } = await SB.from('conversations')
    .select('id').eq('created_by', currentUser.id).eq('type', 'dm')
    .order('created_at', { ascending: false }).limit(1).single();
  if (fetchErr || !convRow) { document.getElementById('dm-error').textContent = 'Error fetching conversation.'; return; }

  // Add self as member FIRST so RLS read policy passes going forward
  await SB.from('conversation_members').insert([
    { conversation_id: convRow.id, user_id: currentUser.id, status: 'accepted', invited_by: currentUser.id },
    { conversation_id: convRow.id, user_id: selectedDmUser.id, status: 'pending', invited_by: currentUser.id }
  ]);

  closeModal('new-dm-modal');
  await loadConversations();
  openConversation(convRow.id);
}

// ============================================================
//  NEW GROUP
// ============================================================
function openNewGroupModal() {
  selectedGroupUsers = [];
  document.getElementById('group-name-input').value = '';
  document.getElementById('group-user-search').value = '';
  document.getElementById('group-search-results').innerHTML = '';
  document.getElementById('selected-members').innerHTML = '';
  document.getElementById('group-error').textContent = '';
  openModal('new-group-modal');
}

function renderSelectedMembers() {
  const el = document.getElementById('selected-members');
  el.innerHTML = '';
  selectedGroupUsers.forEach(u => {
    const chip = document.createElement('div');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:var(--glass-bg);border:1px solid var(--border);border-radius:8px;font-size:0.8rem;cursor:pointer';
    chip.innerHTML = `${escHtml(u.display_name || u.username)} <span style="color:var(--text-3)">×</span>`;
    chip.onclick = () => { selectedGroupUsers = selectedGroupUsers.filter(x => x.id !== u.id); renderSelectedMembers(); };
    el.appendChild(chip);
  });
}

async function createGroup() {
  const name = document.getElementById('group-name-input').value.trim();
  if (!name) { document.getElementById('group-error').textContent = 'Group name required.'; return; }

  const { error: convErr } = await SB.from('conversations').insert({ type: 'group', name, created_by: currentUser.id });
  if (convErr) { document.getElementById('group-error').textContent = 'Error creating group: ' + convErr.message; return; }

  const { data: convRow, error: fetchErr } = await SB.from('conversations')
    .select('id').eq('created_by', currentUser.id).eq('type', 'group').eq('name', name)
    .order('created_at', { ascending: false }).limit(1).single();
  if (fetchErr || !convRow) { document.getElementById('group-error').textContent = 'Error fetching group.'; return; }

  const members = [
    { conversation_id: convRow.id, user_id: currentUser.id, status: 'accepted', invited_by: currentUser.id },
    ...selectedGroupUsers.map(u => ({ conversation_id: convRow.id, user_id: u.id, status: 'pending', invited_by: currentUser.id }))
  ];
  await SB.from('conversation_members').insert(members);

  closeModal('new-group-modal');
  await loadConversations();
  openConversation(convRow.id);
}

// ============================================================
//  PENDING INVITES
// ============================================================
async function loadPendingInvites() {
  const { data } = await SB.from('conversation_members')
    .select('*, conversations(*)')
    .eq('user_id', currentUser.id)
    .eq('status', 'pending');
  pendingInviteCount = data?.length || 0;
  updateInviteBadge();
  return data || [];
}

function updateInviteBadge() {
  const btn = document.getElementById('invites-btn');
  // Remove old badge
  const old = btn.querySelector('.invite-badge');
  if (old) old.remove();
  if (pendingInviteCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'invite-badge';
    badge.textContent = pendingInviteCount;
    btn.appendChild(badge);
  }
}

function subscribeToInvites() {
  SB.channel('invites-' + currentUser.id)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'conversation_members',
      filter: `user_id=eq.${currentUser.id}`
    }, async () => {
      await loadPendingInvites();
    })
    .subscribe();
}

async function openInvitesModal() {
  const invites = await loadPendingInvites();
  const list = document.getElementById('invites-list');
  list.innerHTML = '';
  if (invites.length === 0) {
    list.innerHTML = '<p style="color:var(--text-3);font-size:0.85rem">No pending invites.</p>';
  } else {
    for (const inv of invites) {
      const inviter = await getProfile(inv.invited_by);
      const item = document.createElement('div');
      item.className = 'invite-item';
      const convName = inv.conversations?.type === 'dm'
        ? `DM from ${inviter?.display_name || inviter?.username || 'someone'}`
        : `Group: ${inv.conversations?.name || 'Unnamed'}`;
      item.innerHTML = `
        <div class="invite-info">
          <div class="invite-name">${escHtml(convName)}</div>
          <div class="invite-from">Invited by ${escHtml(inviter?.display_name || inviter?.username || 'unknown')}</div>
        </div>
        <div class="invite-actions">
          <button class="invite-btn accept" onclick="respondInvite('${inv.id}','${inv.conversation_id}','accepted',this)">Accept</button>
          <button class="invite-btn reject" onclick="respondInvite('${inv.id}','${inv.conversation_id}','rejected',this)">Decline</button>
        </div>
      `;
      list.appendChild(item);
    }
  }
  openModal('invites-modal');
}

async function respondInvite(memberId, convId, status, btn) {
  await SB.from('conversation_members').update({ status }).eq('id', memberId);
  btn.closest('.invite-item').remove();
  pendingInviteCount = Math.max(0, pendingInviteCount - 1);
  updateInviteBadge();
  if (status === 'accepted') {
    await loadConversations();
  }
}

// ============================================================
//  GROUP INFO + INVITE
// ============================================================
async function openGroupInfoModal() {
  const conv = conversations.find(c => c.id === currentConvId);
  if (!conv || conv.type !== 'group') return;
  document.getElementById('gi-title').textContent = conv.name || 'Group';

  // Load members
  const { data: members } = await SB.from('conversation_members')
    .select('user_id, status')
    .eq('conversation_id', currentConvId)
    .eq('status', 'accepted');

  const membersEl = document.getElementById('gi-members');
  membersEl.innerHTML = '<div style="font-size:0.78rem;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Members</div>';
  for (const m of (members || [])) {
    const p = await getProfile(m.user_id);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0';
    div.innerHTML = `${renderAvatarHtml(p, 28)}<span style="font-size:0.87rem">${escHtml(p?.display_name || p?.username || 'User')}${p?.id === currentUser.id ? ' <span style="color:var(--text-3)">(you)</span>' : ''}</span>`;
    membersEl.appendChild(div);
  }

  selectedGiUser = null;
  document.getElementById('gi-user-search').value = '';
  document.getElementById('gi-search-results').innerHTML = '';
  openModal('group-info-modal');
}

async function inviteToGroup() {
  if (!selectedGiUser) return;
  // Check if already member
  const { data: existing } = await SB.from('conversation_members')
    .select('id').eq('conversation_id', currentConvId).eq('user_id', selectedGiUser.id).maybeSingle();
  if (existing) return;
  await SB.from('conversation_members').insert({
    conversation_id: currentConvId, user_id: selectedGiUser.id,
    status: 'pending', invited_by: currentUser.id
  });
  closeModal('group-info-modal');
}

async function leaveGroup() {
  if (!currentConvId) return;
  await SB.from('conversation_members')
    .update({ status: 'rejected' })
    .eq('conversation_id', currentConvId)
    .eq('user_id', currentUser.id);
  closeModal('group-info-modal');
  currentConvId = null;
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('empty-state').style.display = 'flex';
  await loadConversations();
}

// ============================================================
//  ANNOUNCEMENTS
// ============================================================
function openAnnounceModal() {
  document.getElementById('announce-text').value = '';
  document.getElementById('announce-error').textContent = '';
  openModal('announce-modal');
}

async function sendAnnouncement() {
  const content = document.getElementById('announce-text').value.trim();
  if (!content) { document.getElementById('announce-error').textContent = 'Enter announcement text.'; return; }

  // Insert as message with is_announcement=true in all active conversations
  // Also insert into announcements table
  await SB.from('announcements').insert({ content, created_by: currentUser.id });

  // Send to current conversation if open
  if (currentConvId) {
    await SB.from('messages').insert({
      conversation_id: currentConvId,
      user_id: currentUser.id,
      content,
      is_announcement: true
    });
  }

  closeModal('announce-modal');
}

function subscribeToAnnouncements() {
  announceSub = SB.channel('announcements-global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, payload => {
      // If not in conversation, show a toast-like indicator
      if (!currentConvId) showAnnouncementToast(payload.new.content);
    })
    .subscribe();
}

function showAnnouncementToast(content) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;top:20px;left:50%;transform:translateX(-50%);
    background:linear-gradient(135deg,rgba(245,158,11,0.15),rgba(251,191,36,0.10));
    border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:12px 18px;
    font-size:0.85rem;color:var(--text);z-index:9999;
    max-width:360px;text-align:center;box-shadow:var(--shadow-md);
    animation:fadeUp 0.3s ease;
  `;
  toast.innerHTML = `<span style="color:var(--admin-gold);font-weight:700">📣 Announcement:</span> ${escHtml(content)}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ============================================================
//  REALTIME SUBSCRIPTIONS
// ============================================================
function subscribeToConversations() {
  if (memberSub) { SB.removeChannel(memberSub); memberSub = null; }
  memberSub = SB.channel('members-' + currentUser.id)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'conversation_members',
      filter: `user_id=eq.${currentUser.id}`
    }, async () => {
      await loadConversations();
    })
    .subscribe();
}

function unsubscribeMsgSub() {
  if (msgSub) { SB.removeChannel(msgSub); msgSub = null; }
}

function unsubscribeAll() {
  if (msgSub) SB.removeChannel(msgSub);
  if (memberSub) SB.removeChannel(memberSub);
  if (typingSub) SB.removeChannel(typingSub);
  if (announceSub) SB.removeChannel(announceSub);
  if (reactionSub) SB.removeChannel(reactionSub);
}

// ============================================================
//  MODAL HELPERS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// ============================================================
//  AVATAR HELPERS
// ============================================================
function getInitial(profile) {
  const name = profile?.display_name || profile?.username || '?';
  return name[0].toUpperCase();
}

function renderAvatarHtml(profile, size) {
  const initial = getInitial(profile);
  if (profile?.avatar_url) {
    return `<div class="msg-avatar" style="width:${size}px;height:${size}px"><img src="${profile.avatar_url}" alt=""/></div>`;
  }
  const fs = size > 30 ? '0.9rem' : '0.72rem';
  return `<div class="msg-avatar" style="width:${size}px;height:${size}px;font-size:${fs}">${initial}</div>`;
}

function renderAvatarEl(el, profile, size) {
  el.innerHTML = '';
  if (profile?.avatar_url) {
    const img = document.createElement('img');
    img.src = profile.avatar_url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    el.appendChild(img);
  } else {
    el.textContent = getInitial(profile);
  }
}

// ============================================================
//  UTILS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
