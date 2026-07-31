// ==================== CHATVERSE CLIENT ====================
const socket = io();

// ==================== STATE ====================
let currentUser = null;
let currentRoom = null;
let currentChat = null;
let currentDMUser = null;
let localStream = null;
let peerConnections = new Map(); // username -> RTCPeerConnection
let activeCallRoomId = null;
let activeCallTargetDM = null;
let callMediaStates = new Map(); // username -> { audioEnabled, videoEnabled }
let isCallMinimized = false;
let callTarget = null;
let musicPlayer = null;
let currentTrackIndex = -1;
let playlist = [];
let isMusicHost = false;
let roomListCache = [];
let onlineUsersCache = [];
let unreadDmCounts = new Map();
let pendingChatFiles = [];
let pendingMusicFiles = [];

// ==================== DOM ELEMENTS ====================
const $ = (id) => document.getElementById(id);
const loginScreen = $('login-screen');
const appScreen = $('app-screen');
const usernameInput = $('username-input');
const loginBtn = $('login-btn');
const loginError = $('login-error');
const myUsername = $('my-username');
const myAvatar = $('my-avatar');
const roomList = $('room-list');
const onlineUsers = $('online-users');
const onlineCount = $('online-count');
const createRoomBtn = $('create-room-btn');
const createRoomModal = $('create-room-modal');
const roomNameInput = $('room-name-input');
const confirmCreateRoom = $('confirm-create-room');
const cancelCreateRoom = $('cancel-create-room');
const roomNameEl = $('room-name');
const roomMembersCount = $('room-members-count');
const activeChatAvatar = $('active-chat-avatar');
const welcomePanel = $('welcome-panel');
const chatPanel = $('chat-panel');
const musicPanel = $('music-panel');
const backBtn = $('back-btn');
const chatMessages = $('chat-messages');
const chatInput = $('chat-input');
const sendBtn = $('send-btn');
const leaveRoomBtn = $('leave-room-btn');

const attachBtn = $('attach-btn');
const chatFileInput = $('chat-file-input');
const chatAttachmentPreview = $('chat-attachment-preview');

const dmAttachBtn = $('dm-attach-btn');
const dmFileInput = $('dm-file-input');
const dmAttachmentPreview = $('dm-attachment-preview');

const musicAttachBtn = $('music-attach-btn');
const musicFileInput = $('music-file-input');
const musicAttachmentPreview = $('music-attachment-preview');

const imageLightboxModal = $('image-lightbox-modal');
const lightboxImg = $('lightbox-img');
const lightboxFilename = $('lightbox-filename');
const lightboxDownloadLink = $('lightbox-download-link');
const closeLightboxBtn = $('close-lightbox-btn');

const roomSettingsBtn = $('room-settings-btn');
const roomSettingsModal = $('room-settings-modal');
const closeRoomSettingsBtn = $('close-room-settings');
const settingHiddenToggle = $('setting-hidden-toggle');
const settingPrivateToggle = $('setting-private-toggle');
const allowedMembersList = $('allowed-members-list');
const blockedMembersList = $('blocked-members-list');
const saveRoomSettingsBtn = $('save-room-settings-btn');
const deleteRoomBtn = $('delete-room-btn');

const videoCallBtn = $('video-call-btn');
const membersSidebar = $('members-sidebar');
const roomMembersBtn = $('room-members-btn');
const closeMembersBtn = $('close-members-btn');
const membersList = $('members-list');
const dmPanel = $('dm-panel');
const dmAvatar = $('dm-avatar');
const dmUsername = $('dm-username');
const dmMessages = $('dm-messages');
const dmInput = $('dm-input');
const dmSendBtn = $('dm-send-btn');
const closeDmBtn = $('close-dm-btn');
const dmVideoCallBtn = $('dm-video-call-btn');
const videoOverlay = $('video-overlay');
const videoGrid = $('video-grid');
const videoHeader = $('video-header');
const videoContainer = $('video-container');
const callTitleText = $('call-title-text');
const callParticipantCount = $('call-participant-count');
const minimizeCallBtn = $('minimize-call-btn');
const maximizeCallBtn = $('maximize-call-btn');
const togglePipBtn = $('toggle-pip-btn');
const toggleMicBtn = $('toggle-mic-btn');
const toggleCamBtn = $('toggle-cam-btn');
const endCallBtn = $('end-call-btn');
const incomingCallModal = $('incoming-call-modal');
const callerName = $('caller-name');
const acceptCallBtn = $('accept-call-btn');
const rejectCallBtn = $('reject-call-btn');
const logoutBtn = $('logout-btn');
const leaveMusicBtn = $('leave-music-btn');
const musicRoomMembers = $('music-room-members');
const trackTitle = $('track-title');
const trackArtist = $('track-artist');
const trackSource = $('track-source');
const albumArt = $('album-art');
const vinylSpin = $('vinyl-spin');
const playBtn = $('play-btn');
const prevBtn = $('prev-btn');
const nextBtn = $('next-btn');
const progressBar = $('progress-bar');
const progressFill = $('progress-fill');
const currentTimeEl = $('current-time');
const totalTimeEl = $('total-time');
const volumeSlider = $('volume-slider');
const volumeIcon = $('volume-icon');
const playlistItems = $('playlist-items');
const musicUploadBtn = $('music-upload-btn');
const musicUploadInput = $('music-upload-input');
const musicChatMessages = $('music-chat-messages');
const musicChatInput = $('music-chat-input');
const musicSendBtn = $('music-send-btn');

musicPlayer = $('music-player');

// ==================== HELPERS ====================
function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return `avatar-color-${Math.abs(hash) % 8}`;
}

function getInitials(name) {
    return name.charAt(0).toUpperCase();
}

function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString('th-TH', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function formatAudioTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
    const container = $('toast-container');
    const icons = { success: 'check-circle', info: 'info-circle', warning: 'exclamation-triangle', error: 'times-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${icons[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showPanel(panel) {
    [welcomePanel, chatPanel, musicPanel].forEach(p => p.classList.remove('active'));
    panel.classList.add('active');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function normalizeMembers(members) {
    return (members || []).map(member => {
        if (typeof member === 'string') {
            return { username: member, active: true };
        }
        return {
            username: member.username,
            active: member.active !== false
        };
    });
}

function getMemberUsername(member) {
    return typeof member === 'string' ? member : member.username;
}

function getMemberActive(member) {
    return typeof member === 'string' ? true : member.active !== false;
}

function formatMemberSummary(members) {
    const normalized = normalizeMembers(members);
    const activeCount = normalized.filter(member => member.active).length;
    return `${activeCount} active`;
}

function setActiveChatAvatar(label, avatarClass = '') {
    if (!activeChatAvatar) return;
    activeChatAvatar.textContent = '';
    activeChatAvatar.className = `avatar-sm ${avatarClass}`.trim();
    if (label?.startsWith('<i')) {
        activeChatAvatar.innerHTML = label;
    } else {
        activeChatAvatar.textContent = label;
    }
}

function getUnreadCount(username) {
    return unreadDmCounts.get(username) || 0;
}

function setUnreadCount(username, count) {
    if (count > 0) unreadDmCounts.set(username, count);
    else unreadDmCounts.delete(username);
    renderOnlineUsers(onlineUsersCache);
}

function bumpUnreadCount(username) {
    setUnreadCount(username, getUnreadCount(username) + 1);
}

let unreadRoomCounts = new Map();

function getRoomUnreadCount(roomId) {
    return unreadRoomCounts.get(roomId) || 0;
}

function setRoomUnreadCount(roomId, count) {
    if (count > 0) unreadRoomCounts.set(roomId, count);
    else unreadRoomCounts.delete(roomId);
    renderRoomList(roomListCache);
}

function bumpRoomUnreadCount(roomId) {
    setRoomUnreadCount(roomId, getRoomUnreadCount(roomId) + 1);
}

function clearRoomUnreadCount(roomId) {
    if (unreadRoomCounts.has(roomId)) {
        unreadRoomCounts.delete(roomId);
        renderRoomList(roomListCache);
    }
}

function renderRoomList(rooms) {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const isMusic = room.type === 'music';
        const isActive = currentChat && currentChat.type === 'room' && currentChat.id === room.id;
        const unreadCount = getRoomUnreadCount(room.id);
        const div = document.createElement('div');
        div.className = `room-item ${isActive ? 'active' : ''}`;
        div.innerHTML = `
      <div class="room-icon ${room.type}">
        <i class="fas fa-${isMusic ? 'music' : 'hashtag'}"></i>
      </div>
      <div class="room-info">
        <div class="room-title">${escapeHtml(room.name)}</div>
        <div class="room-meta">${room.activeMemberCount || 0} active</div>
      </div>
      ${unreadCount > 0 ? `<span class="unread-pill">${unreadCount}</span>` : ''}
    `;
        div.addEventListener('click', () => joinRoom(room.id));
        roomList.appendChild(div);
    });
}

function renderOnlineUsers(users) {
    onlineCount.textContent = users.length;
    onlineUsers.innerHTML = '';
    users.forEach(user => {
        const isMe = currentUser && user.username === currentUser.username;
        const unreadCount = getUnreadCount(user.username);
        const div = document.createElement('div');
        div.className = `user-item ${isMe ? 'is-me' : ''}`;
        div.innerHTML = `
      <div class="avatar-sm ${getAvatarColor(user.username)}">${getInitials(user.username)}</div>
      <span class="status-dot"></span>
      <span class="user-name">${escapeHtml(user.username)}${isMe ? ' (you)' : ''}</span>
      ${unreadCount > 0 ? `<span class="unread-pill">${unreadCount}</span>` : ''}
      ${!isMe ? '<span class="dm-badge"><i class="fas fa-envelope"></i></span>' : ''}
    `;
        if (!isMe) {
            div.addEventListener('click', () => openDM(user.username));
        }
        onlineUsers.appendChild(div);
    });
}

function renderUnifiedList() {
    renderRoomList(roomListCache);
    renderOnlineUsers(onlineUsersCache);
}

// ==================== LOGIN ====================
loginBtn.addEventListener('click', doLogin);
usernameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doLogin(); });

function doLogin() {
    const username = usernameInput.value.trim();
    if (!username) {
        loginError.textContent = 'Please enter a username';
        return;
    }
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

    socket.emit('register', username, (res) => {
        if (res.success) {
            currentUser = res.user;
            myUsername.textContent = currentUser.username;
            myAvatar.textContent = getInitials(currentUser.username);
            myAvatar.className = `avatar-sm ${getAvatarColor(currentUser.username)}`;

            loginScreen.classList.remove('active');
            appScreen.classList.add('active');
            showToast(`Welcome, ${currentUser.username}!`, 'success');

            socket.emit('get-dm-unread-summary', (summary) => {
                unreadDmCounts = new Map(Object.entries(summary?.unread || {}).map(([username, count]) => [username, Number(count)]));
                renderOnlineUsers(onlineUsersCache);
            });
        } else {
            loginError.textContent = res.error;
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Join ChatVerse</span><i class="fas fa-arrow-right"></i>';
        }
    });
}

// ==================== ROOM LIST ====================
socket.on('room-list', (rooms) => {
    roomListCache = rooms || [];
    renderRoomList(roomListCache);
});

// ==================== ONLINE USERS ====================
socket.on('online-users', (users) => {
    onlineUsersCache = users || [];
    renderOnlineUsers(onlineUsersCache);
});

// ==================== CREATE ROOM ====================
createRoomBtn.addEventListener('click', () => {
    createRoomModal.classList.add('active');
    roomNameInput.value = '';
    roomNameInput.focus();
});
cancelCreateRoom.addEventListener('click', () => createRoomModal.classList.remove('active'));
confirmCreateRoom.addEventListener('click', doCreateRoom);
roomNameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') doCreateRoom(); });

function doCreateRoom() {
    const name = roomNameInput.value.trim();
    if (!name) return;
    socket.emit('create-room', name, (res) => {
        if (res.success) {
            createRoomModal.classList.remove('active');
            showToast(`Room "${name}" created!`, 'success');
            joinRoom(res.room.id);
        }
    });
}

// ==================== JOIN / LEAVE ROOM ====================
function joinRoom(roomId) {
    socket.emit('join-room', roomId, (res) => {
        if (!res.success) { showToast(res.error, 'error'); return; }

        currentChat = { type: 'room', id: roomId, name: res.room.name, data: res.room };
        currentRoom = currentChat;

        clearRoomUnreadCount(roomId);

        const isOwner = currentUser && res.room.owner === currentUser.username;
        if (roomSettingsBtn) {
            roomSettingsBtn.style.display = (isOwner && res.room.id !== 'lobby' && res.room.id !== 'music-room') ? 'flex' : 'none';
        }

        if (res.room.type === 'music') {
            showPanel(musicPanel);
            musicRoomMembers.textContent = formatMemberSummary(res.room.members);
            playlist = res.playlist || [];
            renderPlaylist();
            renderMusicChat(res.room.messages);
            if (playlist.length > 0 && currentTrackIndex === -1) loadTrack(0);
        } else {
            showPanel(chatPanel);
            roomNameEl.textContent = res.room.name;
            roomMembersCount.textContent = formatMemberSummary(res.room.members);
            setActiveChatAvatar('<i class="fas fa-users"></i>', 'avatar-color-5');
            renderChatMessages(res.room.messages);
            updateMembersList(res.room.members);
            chatInput.focus();
        }
        renderUnifiedList();
    });
}

function openDM(username) {
    currentChat = { type: 'dm', id: username, name: username };
    currentDMUser = username;
    if (roomSettingsBtn) roomSettingsBtn.style.display = 'none';

    showPanel(chatPanel);
    roomNameEl.textContent = username;
    roomMembersCount.textContent = 'Active now';
    setActiveChatAvatar(getInitials(username), getAvatarColor(username));

    socket.emit('get-private-chat', username, (res) => {
        const messages = res.messages || [];
        renderChatMessages(messages);
        messages.filter(m => m.from === username && !m.read).forEach(m => {
            socket.emit('message-read', { messageId: m.id, from: m.from });
        });
        setUnreadCount(username, 0);
    });
    renderUnifiedList();
    chatInput.focus();
}

// ==================== ROOM SETTINGS MODAL ====================
let currentRoomAllowedUsers = new Set();
let currentRoomBlockedUsers = new Set();

function openRoomSettingsModal() {
    if (!currentChat || currentChat.type !== 'room' || !currentChat.data) return;
    const roomData = currentChat.data;

    settingHiddenToggle.checked = Boolean(roomData.hidden);
    settingPrivateToggle.checked = Boolean(roomData.isPrivate);

    currentRoomAllowedUsers = new Set(roomData.allowedUsers || []);
    currentRoomBlockedUsers = new Set(roomData.blockedUsers || []);

    renderRoomSettingsUsers();
    roomSettingsModal.classList.add('active');
}

function renderRoomSettingsUsers() {
    if (!allowedMembersList || !blockedMembersList) return;
    allowedMembersList.innerHTML = '';
    blockedMembersList.innerHTML = '';

    const candidateUsers = new Set();
    onlineUsersCache.forEach(u => candidateUsers.add(u.username));
    normalizeMembers(currentChat.data.members).forEach(m => candidateUsers.add(m.username));
    currentRoomAllowedUsers.forEach(u => candidateUsers.add(u));
    currentRoomBlockedUsers.forEach(u => candidateUsers.add(u));

    candidateUsers.forEach(username => {
        if (currentUser && username === currentUser.username) return;

        // Render in Allowed List
        const isAllowed = currentRoomAllowedUsers.has(username);
        const allowDiv = document.createElement('div');
        allowDiv.className = 'member-manage-item';
        allowDiv.innerHTML = `
            <div class="member-manage-user">
                <div class="avatar-sm ${getAvatarColor(username)}" style="width:24px;height:24px;font-size:11px;">${getInitials(username)}</div>
                <span>${escapeHtml(username)}</span>
            </div>
            <button class="btn-toggle-action ${isAllowed ? 'active' : ''}">
                ${isAllowed ? '<i class="fas fa-check"></i> Allowed' : 'Allow'}
            </button>
        `;
        const allowBtn = allowDiv.querySelector('button');
        allowBtn.addEventListener('click', () => {
            if (currentRoomAllowedUsers.has(username)) {
                currentRoomAllowedUsers.delete(username);
            } else {
                currentRoomAllowedUsers.add(username);
                currentRoomBlockedUsers.delete(username);
            }
            renderRoomSettingsUsers();
        });
        allowedMembersList.appendChild(allowDiv);

        // Render in Blocked List
        const isBlocked = currentRoomBlockedUsers.has(username);
        const blockDiv = document.createElement('div');
        blockDiv.className = 'member-manage-item';
        blockDiv.innerHTML = `
            <div class="member-manage-user">
                <div class="avatar-sm ${getAvatarColor(username)}" style="width:24px;height:24px;font-size:11px;">${getInitials(username)}</div>
                <span>${escapeHtml(username)}</span>
            </div>
            <button class="btn-toggle-action danger ${isBlocked ? 'active' : ''}">
                ${isBlocked ? '<i class="fas fa-ban"></i> Blocked' : 'Block'}
            </button>
        `;
        const blockBtn = blockDiv.querySelector('button');
        blockBtn.addEventListener('click', () => {
            if (currentRoomBlockedUsers.has(username)) {
                currentRoomBlockedUsers.delete(username);
            } else {
                currentRoomBlockedUsers.add(username);
                currentRoomAllowedUsers.delete(username);
            }
            renderRoomSettingsUsers();
        });
        blockedMembersList.appendChild(blockDiv);
    });
}

if (roomSettingsBtn) roomSettingsBtn.addEventListener('click', openRoomSettingsModal);
if (closeRoomSettingsBtn) closeRoomSettingsBtn.addEventListener('click', () => roomSettingsModal.classList.remove('active'));

if (saveRoomSettingsBtn) {
    saveRoomSettingsBtn.addEventListener('click', () => {
        if (!currentChat || currentChat.type !== 'room') return;

        const hidden = settingHiddenToggle.checked;
        const isPrivate = settingPrivateToggle.checked;
        const allowedUsers = Array.from(currentRoomAllowedUsers);
        const blockedUsers = Array.from(currentRoomBlockedUsers);

        socket.emit('update-room-settings', {
            roomId: currentChat.id,
            hidden,
            isPrivate,
            allowedUsers,
            blockedUsers
        }, (res) => {
            if (res && res.success) {
                currentChat.data.hidden = hidden;
                currentChat.data.isPrivate = isPrivate;
                currentChat.data.allowedUsers = allowedUsers;
                currentChat.data.blockedUsers = blockedUsers;
                roomSettingsModal.classList.remove('active');
                showToast('Room settings saved!', 'success');
            } else {
                showToast(res?.error || 'Failed to save room settings', 'error');
            }
        });
    });
}

if (deleteRoomBtn) {
    deleteRoomBtn.addEventListener('click', () => {
        if (!currentChat || currentChat.type !== 'room') return;
        if (!confirm(`Are you sure you want to delete room "${currentChat.name}"? This action cannot be undone.`)) return;

        socket.emit('delete-room', currentChat.id, (res) => {
            if (res && res.success) {
                roomSettingsModal.classList.remove('active');
                showToast(`Room "${currentChat.name}" was deleted`, 'info');
                leaveRoom();
            } else {
                showToast(res?.error || 'Failed to delete room', 'error');
            }
        });
    });
}

// Socket listeners for room moderation
socket.on('kicked-from-room', (data) => {
    showToast(data.reason || 'You were removed from the room', 'warning');
    closeChat();
});

socket.on('room-deleted', (data) => {
    if (currentChat && currentChat.type === 'room' && currentChat.id === data.roomId) {
        showToast(`Room "${data.roomName}" was deleted by owner (${data.deletedBy})`, 'warning');
        closeChat();
    }
});

socket.on('music-playlist-updated', (data) => {
    if (data?.playlist) {
        playlist = data.playlist;
        renderPlaylist();
    }
});

socket.on('room-message', (msg) => {
    const targetRoomId = msg.roomId || currentRoom?.id;
    const isCurrentActiveRoom = currentChat && currentChat.type === 'room' && currentChat.id === targetRoomId;

    if (isCurrentActiveRoom) {
        if (msg.from !== currentUser?.username) {
            if (currentChat.data?.type === 'music') {
                appendMusicChatMessage(msg);
            } else {
                appendMessageUI(msg);
            }
        }
    } else if (targetRoomId) {
        bumpRoomUnreadCount(targetRoomId);
        showToast(`ข้อความใหม่ใน ${escapeHtml(msg.roomName || 'ห้องแชท')} จาก ${escapeHtml(msg.from)}`, 'info');
    }
});

socket.on('private-message', (msg) => {
    const isCurrentActiveDM = currentChat && currentChat.type === 'dm' && currentChat.id === msg.from;

    if (isCurrentActiveDM) {
        appendMessageUI(msg);
        socket.emit('message-read', { messageId: msg.id, from: msg.from });
    } else {
        bumpUnreadCount(msg.from);
        showToast(`ข้อความส่วนตัวใหม่จาก ${escapeHtml(msg.from)}`, 'info');
    }
});

leaveRoomBtn.addEventListener('click', leaveRoom);
leaveMusicBtn.addEventListener('click', leaveRoom);
document.querySelectorAll('.back-to-lobby-btn').forEach(btn => btn.addEventListener('click', leaveRoom));
if (backBtn) backBtn.addEventListener('click', leaveRoom);

function leaveRoom() {
    if (currentChat && currentChat.type === 'room') {
        socket.emit('leave-room', () => { closeChat(); });
    } else {
        closeChat();
    }
}

function closeChat() {
    currentChat = null;
    currentDMUser = null;
    showPanel(welcomePanel);
    membersSidebar.classList.remove('active');
    if (musicPlayer) {
        musicPlayer.pause();
        stopYouTubePlayer();
        setPlayingUI(false);
    }
    renderUnifiedList();
}

// ==================== CHAT MESSAGES ====================

// ==================== CHAT MESSAGES & ATTACHMENTS ====================

function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(mimeType = '', fileName = '') {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (mimeType.startsWith('image/')) return 'fa-file-image';
    if (mimeType.startsWith('video/')) return 'fa-file-video';
    if (mimeType.startsWith('audio/')) return 'fa-file-audio';
    if (ext === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(ext)) return 'fa-file-powerpoint';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-file-archive';
    if (['js', 'html', 'css', 'json', 'py', 'java', 'cpp', 'c', 'ts', 'php'].includes(ext)) return 'fa-file-code';
    if (['txt', 'md', 'log'].includes(ext)) return 'fa-file-alt';
    return 'fa-file';
}

function renderPendingPreview(target = 'chat') {
    const files = target === 'music' ? pendingMusicFiles : pendingChatFiles;
    const container = target === 'music' ? musicAttachmentPreview : (chatAttachmentPreview || dmAttachmentPreview);
    if (!container) return;

    container.innerHTML = '';
    if (files.length === 0) return;

    files.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'attachment-preview-card';

        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            card.appendChild(img);
        } else {
            const icon = document.createElement('i');
            icon.className = `fas ${getFileIcon(file.type, file.name)} attachment-preview-icon`;
            card.appendChild(icon);
        }

        const info = document.createElement('div');
        info.className = 'attachment-preview-info';
        info.innerHTML = `
            <span class="attachment-preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="attachment-preview-size">${formatBytes(file.size)}</span>
        `;
        card.appendChild(info);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'attachment-preview-remove';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', () => {
            files.splice(index, 1);
            renderPendingPreview(target);
        });
        card.appendChild(removeBtn);

        container.appendChild(card);
    });
}

function addFilesToPending(fileList, target = 'chat') {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const targetArray = target === 'music' ? pendingMusicFiles : pendingChatFiles;
    files.forEach(f => targetArray.push(f));
    renderPendingPreview(target);
}

function renderAttachmentHTML(attachment) {
    if (!attachment || !attachment.url) return '';
    const { url, fileName, mimeType, fileSize, mediaType } = attachment;
    const safeName = escapeHtml(fileName || 'file');
    const safeUrl = escapeHtml(url);
    const sizeStr = formatBytes(fileSize);

    if (mediaType === 'image') {
        return `
            <div class="msg-attachment msg-attachment-image" onclick="openLightbox('${safeUrl}', '${safeName}')">
                <img src="${safeUrl}" alt="${safeName}" loading="lazy">
            </div>
        `;
    } else if (mediaType === 'video') {
        return `
            <div class="msg-attachment msg-attachment-video">
                <video src="${safeUrl}" controls preload="metadata"></video>
            </div>
        `;
    } else if (mediaType === 'audio') {
        return `
            <div class="msg-attachment msg-attachment-audio">
                <audio src="${safeUrl}" controls preload="none"></audio>
            </div>
        `;
    } else {
        const iconClass = getFileIcon(mimeType, fileName);
        return `
            <div class="msg-attachment">
                <a href="${safeUrl}" download="${safeName}" target="_blank" class="msg-attachment-file">
                    <i class="fas ${iconClass} msg-file-icon"></i>
                    <div class="msg-file-info">
                        <span class="msg-file-name" title="${safeName}">${safeName}</span>
                        <span class="msg-file-size">${sizeStr}</span>
                    </div>
                    <span class="msg-file-download-btn"><i class="fas fa-download"></i> Download</span>
                </a>
            </div>
        `;
    }
}

function openLightbox(imgUrl, fileName) {
    if (!imageLightboxModal || !lightboxImg) return;
    lightboxImg.src = imgUrl;
    if (lightboxFilename) lightboxFilename.textContent = fileName || 'Image';
    if (lightboxDownloadLink) {
        lightboxDownloadLink.href = imgUrl;
        lightboxDownloadLink.download = fileName || 'download';
    }
    imageLightboxModal.classList.add('active');
}

function closeLightbox() {
    if (imageLightboxModal) imageLightboxModal.classList.remove('active');
}

if (closeLightboxBtn) {
    closeLightboxBtn.addEventListener('click', closeLightbox);
}
if (imageLightboxModal) {
    imageLightboxModal.addEventListener('click', (e) => {
        if (e.target === imageLightboxModal) closeLightbox();
    });
}

function renderChatMessages(messages) {
    chatMessages.innerHTML = '';
    messages.forEach(msg => appendMessageUI(msg));
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessageUI(msg) {
    if (msg.type === 'system') {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.innerHTML = `<i class="fas fa-info-circle"></i> ${escapeHtml(msg.text)}`;
        chatMessages.appendChild(div);
        return;
    }

    const isSent = msg.from === currentUser?.username;
    const row = document.createElement('div');
    row.className = `ms-msg-row message ${isSent ? 'sent' : 'received'}`;

    const cleanText = msg.text ? String(msg.text).trim() : '';
    const textHtml = cleanText ? `<span class="msg-text">${escapeHtml(cleanText)}</span>` : '';
    const attachmentHtml = renderAttachmentHTML(msg.attachment);
    const timeFormatted = formatTime(msg.timestamp || new Date().toISOString());
    const fullDateTime = formatDateTime(msg.timestamp || new Date().toISOString());

    row.innerHTML = `
        ${!isSent ? `<div class="avatar-sm ${getAvatarColor(msg.from)}" style="width:28px;height:28px;font-size:12px;margin-right:8px;align-self:flex-end;">${getInitials(msg.from)}</div>` : ''}
        <div class="ms-msg-bubble-container" style="max-width:75%;">
            ${!isSent ? `<div class="msg-sender">${escapeHtml(msg.from)}</div>` : ''}
            <div class="ms-msg-bubble msg-bubble" title="${fullDateTime}">${textHtml}${attachmentHtml}</div>
            <div class="msg-meta"><span class="msg-time" title="${fullDateTime}">${timeFormatted}</span></div>
        </div>
    `;
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const text = chatInput ? chatInput.value.trim() : '';
    uploadAndSend(text, pendingChatFiles, 'chat');
}

async function uploadAndSend(text, files, target = 'chat') {
    if (!currentChat) return;

    const hasText = Boolean(text.trim());
    const hasFiles = files && files.length > 0;
    if (!hasText && !hasFiles) return;

    const isMusic = target === 'music';
    const activeSendBtn = isMusic ? musicSendBtn : sendBtn;
    if (activeSendBtn) activeSendBtn.disabled = true;

    try {
        if (hasFiles) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const base64 = await readFileAsBase64(file);

                const res = await new Promise((resolve) => {
                    socket.emit('chat-upload-file', {
                        fileName: file.name,
                        mimeType: file.type,
                        base64
                    }, (response) => resolve(response));
                });

                if (res && res.success) {
                    const messageText = (i === 0 && hasText) ? text.trim() : '';
                    const msg = {
                        id: Date.now().toString() + '-' + i,
                        from: currentUser.username,
                        text: messageText,
                        attachment: res.attachment,
                        timestamp: new Date().toISOString(),
                        type: 'message'
                    };

                    if (isMusic) {
                        appendMusicChatMessage(msg);
                        socket.emit('room-message', { text: messageText, attachment: res.attachment });
                    } else if (currentChat.type === 'room') {
                        appendMessageUI(msg);
                        socket.emit('room-message', { text: messageText, attachment: res.attachment });
                    } else {
                        appendMessageUI(msg);
                        socket.emit('private-message', { to: currentChat.id, text: messageText, attachment: res.attachment });
                    }
                } else {
                    showToast(res?.error || `Failed to upload ${file.name}`, 'error');
                }
            }
        } else if (hasText) {
            const messageText = text.trim();
            const msg = {
                id: Date.now().toString(),
                from: currentUser.username,
                text: messageText,
                attachment: null,
                timestamp: new Date().toISOString(),
                type: 'message'
            };

            if (isMusic) {
                appendMusicChatMessage(msg);
                socket.emit('room-message', { text: messageText });
            } else if (currentChat.type === 'room') {
                appendMessageUI(msg);
                socket.emit('room-message', { text: messageText });
            } else {
                appendMessageUI(msg);
                socket.emit('private-message', { to: currentChat.id, text: messageText });
            }
        }
    } catch (err) {
        console.error('Error sending message/files:', err);
        showToast('Failed to send message', 'error');
    } finally {
        if (isMusic) {
            pendingMusicFiles = [];
            renderPendingPreview('music');
            if (musicChatInput) musicChatInput.value = '';
        } else {
            pendingChatFiles = [];
            renderPendingPreview('chat');
            if (chatInput) chatInput.value = '';
        }
        if (activeSendBtn) activeSendBtn.disabled = false;
    }
}

// Attachment button & file input listeners
if (attachBtn && chatFileInput) {
    attachBtn.addEventListener('click', () => chatFileInput.click());
    chatFileInput.addEventListener('change', () => {
        addFilesToPending(chatFileInput.files, 'chat');
        chatFileInput.value = '';
    });
}
if (dmAttachBtn && dmFileInput) {
    dmAttachBtn.addEventListener('click', () => dmFileInput.click());
    dmFileInput.addEventListener('change', () => {
        addFilesToPending(dmFileInput.files, 'chat');
        dmFileInput.value = '';
    });
}
if (musicAttachBtn && musicFileInput) {
    musicAttachBtn.addEventListener('click', () => musicFileInput.click());
    musicFileInput.addEventListener('change', () => {
        addFilesToPending(musicFileInput.files, 'music');
        musicFileInput.value = '';
    });
}

// Clipboard Paste & Drag and Drop
window.addEventListener('paste', (e) => {
    if (!currentUser || !currentChat) return;
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
        e.preventDefault();
        const isMusic = currentChat.type === 'room' && currentChat.data?.type === 'music';
        addFilesToPending(files, isMusic ? 'music' : 'chat');
        showToast(`Pasted ${files.length} file(s) from clipboard`, 'info');
    }
});

function setupDragAndDrop(element, target) {
    if (!element) return;
    ['dragenter', 'dragover'].forEach(eventName => {
        element.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        element.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('drag-over');
        }, false);
    });

    element.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
            addFilesToPending(files, target);
            showToast(`Attached ${files.length} file(s)`, 'info');
        }
    });
}

setupDragAndDrop(chatMessages, 'chat');
setupDragAndDrop(musicChatMessages, 'music');
setupDragAndDrop(dmMessages, 'chat');

// Music room chat logic
if (musicSendBtn) musicSendBtn.addEventListener('click', sendMusicChat);
if (musicChatInput) musicChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMusicChat(); });
function sendMusicChat() {
    const text = musicChatInput ? musicChatInput.value.trim() : '';
    uploadAndSend(text, pendingMusicFiles, 'music');
}
function renderMusicChat(messages) { musicChatMessages.innerHTML = ''; messages.forEach(msg => appendMusicChatMessage(msg)); }
function appendMusicChatMessage(msg) {
    if (msg.type === 'system') {
        const div = document.createElement('div');
        div.className = 'system-message';
        div.innerHTML = `<i class="fas fa-info-circle"></i> ${escapeHtml(msg.text)}`;
        musicChatMessages.appendChild(div);
    } else {
        const isSent = msg.from === currentUser?.username;
        const row = document.createElement('div');
        row.className = `ms-msg-row message ${isSent ? 'sent' : 'received'}`;
        const cleanText = msg.text ? String(msg.text).trim() : '';
        const textHtml = cleanText ? `<span class="msg-text">${escapeHtml(cleanText)}</span>` : '';
        const attachmentHtml = renderAttachmentHTML(msg.attachment);
        const timeFormatted = formatTime(msg.timestamp || new Date().toISOString());
        const fullDateTime = formatDateTime(msg.timestamp || new Date().toISOString());
        row.innerHTML = `
            <div class="ms-msg-bubble-container" style="max-width:75%;">
                ${!isSent ? `<div class="msg-sender">${escapeHtml(msg.from)}</div>` : ''}
                <div class="ms-msg-bubble msg-bubble" title="${fullDateTime}">${textHtml}${attachmentHtml}</div>
                <div class="msg-meta"><span class="msg-time" title="${fullDateTime}">${timeFormatted}</span></div>
            </div>
        `;
        musicChatMessages.appendChild(row);
    }
    musicChatMessages.scrollTop = musicChatMessages.scrollHeight;
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.split(',')[1] || '');
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

if (musicUploadBtn && musicUploadInput) {
    musicUploadBtn.addEventListener('click', () => musicUploadInput.click());
    musicUploadInput.addEventListener('change', async () => {
        const file = musicUploadInput.files && musicUploadInput.files[0];
        if (!file) return;

        if (!file.type.startsWith('audio/')) {
            showToast('Please choose an audio file', 'error');
            musicUploadInput.value = '';
            return;
        }

        try {
            const base64 = await readFileAsBase64(file);
            socket.emit('music-upload-track', {
                fileName: file.name,
                mimeType: file.type,
                base64,
                title: file.name.replace(/\.[^.]+$/, ''),
                artist: currentUser?.username || 'Unknown',
                cover: '🎧'
            }, (res) => {
                if (res?.success) {
                    playlist = res.playlist || playlist;
                    renderPlaylist();
                    showToast(`Uploaded ${res.track.title}`, 'success');
                } else {
                    showToast(res?.error || 'Failed to upload track', 'error');
                }
            });
        } catch (error) {
            showToast('Failed to read audio file', 'error');
        } finally {
            musicUploadInput.value = '';
        }
    });
}

// ==================== YOUTUBE MUSIC ====================
const youtubeBtn = $('youtube-btn');
const youtubeInputWrapper = $('youtube-input-wrapper');
const youtubeUrlInput = $('youtube-url-input');
const youtubeAddBtn = $('youtube-add-btn');
const youtubeCancelBtn = $('youtube-cancel-btn');

if (youtubeBtn) {
    youtubeBtn.addEventListener('click', () => {
        youtubeInputWrapper.style.display = youtubeInputWrapper.style.display === 'none' ? 'block' : 'none';
        if (youtubeInputWrapper.style.display !== 'none') {
            youtubeUrlInput.focus();
        }
    });
}

if (youtubeAddBtn) {
    youtubeAddBtn.addEventListener('click', async () => {
        const url = youtubeUrlInput.value.trim();
        if (!url) {
            showToast('Paste a YouTube URL', 'error');
            return;
        }

        const videoId = extractYouTubeId(url);
        if (!videoId) {
            showToast('Invalid YouTube URL. Use: youtube.com/watch?v=... or youtu.be/...', 'error');
            return;
        }

        showToast('Fetching video info...', 'info');

        // Fetch metadata from server
        socket.emit('fetch-youtube-metadata', url, (res) => {
            const title = res?.title || `YouTube Video - ${videoId.substring(0, 8)}`;
            const duration = res?.duration || 'Unknown';

            const newTrack = {
                id: `youtube-${Date.now()}`,
                title: title,
                artist: currentUser?.username || 'Unknown',
                file: url,
                type: 'youtube',
                cover: '▶️',
                duration: duration
            };

            // Emit to server to add to everyone's playlist
            socket.emit('music-add-youtube', newTrack, (res) => {
                if (res?.success) {
                    playlist = res.playlist || playlist;
                    renderPlaylist();
                    youtubeUrlInput.value = '';
                    youtubeInputWrapper.style.display = 'none';
                    showToast(`Added: ${title}`, 'success');
                } else {
                    showToast(res?.error || 'Failed to add YouTube track', 'error');
                }
            });
        });
    });
}

if (youtubeCancelBtn) {
    youtubeCancelBtn.addEventListener('click', () => {
        youtubeInputWrapper.style.display = 'none';
        youtubeUrlInput.value = '';
    });
}

// Allow Enter key in YouTube URL input
if (youtubeUrlInput) {
    youtubeUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') youtubeAddBtn.click();
    });
}

// ==================== MULTI-USER VIDEO CALL (WebRTC Mesh) & FLOATING PIP ====================

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Event listeners for starting calls
if (videoCallBtn) {
    videoCallBtn.addEventListener('click', () => {
        if (!currentChat) return;
        if (currentChat.type === 'room') {
            startOrJoinRoomCall(currentChat.id, currentChat.name);
        } else if (currentChat.type === 'dm') {
            startDirectCall(currentChat.id);
        }
    });
}

if (dmVideoCallBtn) {
    dmVideoCallBtn.addEventListener('click', () => {
        if (currentDMUser) {
            startDirectCall(currentDMUser);
        }
    });
}

// Minimize / Maximize / Floating PIP Toggle
if (minimizeCallBtn) minimizeCallBtn.addEventListener('click', minimizeCall);
if (maximizeCallBtn) maximizeCallBtn.addEventListener('click', maximizeCall);
if (togglePipBtn) togglePipBtn.addEventListener('click', toggleCallMinimize);

function minimizeCall() {
    isCallMinimized = true;
    videoOverlay.classList.add('minimized');
    if (minimizeCallBtn) minimizeCallBtn.style.display = 'none';
    if (maximizeCallBtn) maximizeCallBtn.style.display = 'flex';
}

function maximizeCall() {
    isCallMinimized = false;
    videoOverlay.classList.remove('minimized');
    videoOverlay.style.left = '';
    videoOverlay.style.top = '';
    videoOverlay.style.bottom = '';
    videoOverlay.style.right = '';
    if (minimizeCallBtn) minimizeCallBtn.style.display = 'flex';
    if (maximizeCallBtn) maximizeCallBtn.style.display = 'none';
}

function toggleCallMinimize() {
    if (isCallMinimized) maximizeCall();
    else minimizeCall();
}

// Make floating window draggable when minimized
let isDraggingCall = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

if (videoHeader) {
    videoHeader.addEventListener('mousedown', (e) => {
        if (!isCallMinimized) return;
        if (e.target.closest('button')) return;
        isDraggingCall = true;
        const rect = videoOverlay.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        document.addEventListener('mousemove', onDragCall);
        document.addEventListener('mouseup', onStopDragCall);
    });
}

function onDragCall(e) {
    if (!isDraggingCall) return;
    const x = Math.max(10, Math.min(window.innerWidth - 370, e.clientX - dragOffsetX));
    const y = Math.max(10, Math.min(window.innerHeight - 290, e.clientY - dragOffsetY));
    videoOverlay.style.left = `${x}px`;
    videoOverlay.style.top = `${y}px`;
    videoOverlay.style.right = 'auto';
    videoOverlay.style.bottom = 'auto';
}

function onStopDragCall() {
    isDraggingCall = false;
    document.removeEventListener('mousemove', onDragCall);
    document.removeEventListener('mouseup', onStopDragCall);
}

// --- Start or Join Room Group Call ---
async function startOrJoinRoomCall(roomId, roomName) {
    if (activeCallRoomId || peerConnections.size > 0) {
        showToast('You are already in a video call', 'warning');
        return;
    }

    try {
        activeCallRoomId = roomId;
        activeCallTargetDM = null;
        if (callTitleText) callTitleText.textContent = `📹 Call — ${roomName || roomId}`;

        await acquireLocalMedia();
        videoOverlay.classList.add('active');

        // Join room video call session on server
        socket.emit('join-video-call', { roomId }, (res) => {
            if (!res?.success) {
                showToast(res?.error || 'Failed to join video call', 'error');
                endCall();
                return;
            }

            const existingParticipants = res.participants || [];
            updateCallHeader(existingParticipants.length + 1);
            showToast(`Joined video call with ${existingParticipants.length} member(s)`, 'success');

            // Connect to each existing participant via WebRTC
            existingParticipants.forEach((username) => {
                createPeerConnection(username, true);
            });
        });
    } catch (err) {
        console.error('Error starting video call:', err);
        showToast('Camera/Microphone access denied', 'error');
        endCall();
    }
}

// --- Start Direct 1-on-1 Call ---
async function startDirectCall(targetUsername) {
    if (activeCallRoomId || peerConnections.size > 0) {
        showToast('You are already in a video call', 'warning');
        return;
    }

    try {
        activeCallTargetDM = targetUsername;
        activeCallRoomId = null;
        if (callTitleText) callTitleText.textContent = `📹 Call — ${targetUsername}`;

        await acquireLocalMedia();
        videoOverlay.classList.add('active');

        createPeerConnection(targetUsername, true);
        showToast(`Calling ${targetUsername}...`, 'info');
    } catch (err) {
        console.error('Error starting direct call:', err);
        showToast('Camera/Microphone access denied', 'error');
        endCall();
    }
}

// --- Media Acquisition & Video Tile Rendering ---
async function acquireLocalMedia() {
    if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    renderVideoTile(currentUser.username, true, localStream);
    sendLocalMediaState();
}

function updateCallHeader(totalCount) {
    const count = totalCount !== undefined ? totalCount : (peerConnections.size + 1);
    if (callParticipantCount) {
        callParticipantCount.textContent = `${count} participant${count > 1 ? 's' : ''}`;
    }
}

function renderVideoTile(username, isSelf, stream) {
    let tile = $(`video-tile-${username}`);
    if (!tile) {
        tile = document.createElement('div');
        tile.id = `video-tile-${username}`;
        tile.className = `video-box ${isSelf ? 'video-self-tile' : ''}`;
        tile.innerHTML = `
            <video id="video-elem-${username}" autoplay playsinline ${isSelf ? 'muted' : ''}></video>
            <div class="video-avatar-fallback" id="video-fallback-${username}">
                <div class="avatar-lg ${getAvatarColor(username)}">${getInitials(username)}</div>
            </div>
            <span class="video-label">
                <i class="fas fa-${isSelf ? 'user' : 'video'}"></i> ${escapeHtml(username)}${isSelf ? ' (You)' : ''}
            </span>
            <div class="video-status" id="video-status-${username}"></div>
        `;
        if (videoGrid) videoGrid.appendChild(tile);
    }

    const videoElem = $(`video-elem-${username}`);
    if (videoElem && stream) {
        videoElem.srcObject = stream;
    }

    updateVideoTileMediaState(username);
}

function removeVideoTile(username) {
    const tile = $(`video-tile-${username}`);
    if (tile) tile.remove();
}

function updateVideoTileMediaState(username) {
    const isSelf = currentUser && username === currentUser.username;
    let audioEnabled = true;
    let videoEnabled = true;

    if (isSelf) {
        audioEnabled = !!localStream?.getAudioTracks()[0]?.enabled;
        videoEnabled = !!localStream?.getVideoTracks()[0]?.enabled;
    } else {
        const state = callMediaStates.get(username);
        if (state) {
            audioEnabled = state.audioEnabled !== false;
            videoEnabled = state.videoEnabled !== false;
        }
    }

    const fallback = $(`video-fallback-${username}`);
    if (fallback) {
        fallback.style.display = videoEnabled ? 'none' : 'flex';
    }

    const statusElem = $(`video-status-${username}`);
    if (statusElem) {
        const labels = [];
        if (!audioEnabled) labels.push('<i class="fas fa-microphone-slash"></i> Muted');
        if (!videoEnabled) labels.push('<i class="fas fa-video-slash"></i> Cam Off');
        statusElem.innerHTML = labels.join(' ');
        statusElem.classList.toggle('active', labels.length > 0);
    }
}

// --- WebRTC Peer Connection Helper ---
function createPeerConnection(targetUsername, isInitiator) {
    if (peerConnections.has(targetUsername)) {
        peerConnections.get(targetUsername).close();
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnections.set(targetUsername, pc);

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('ice-candidate', { to: targetUsername, candidate: e.candidate });
        }
    };

    pc.ontrack = (e) => {
        if (e.streams && e.streams[0]) {
            renderVideoTile(targetUsername, false, e.streams[0]);
            updateCallHeader();
        }
    };

    if (isInitiator) {
        pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer).then(() => {
                socket.emit('call-user', { to: targetUsername, offer });
            });
        }).catch(err => console.error('Error creating offer:', err));
    }

    return pc;
}

// ==================== CALL RINGTONE & NOTIFICATIONS ====================
let ringtoneAudioCtx = null;
let ringtoneTimer = null;

function startRingtone() {
    stopRingtone();
    try {
        ringtoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let step = 0;
        ringtoneTimer = setInterval(() => {
            if (!ringtoneAudioCtx || ringtoneAudioCtx.state === 'closed') return;
            const osc = ringtoneAudioCtx.createOscillator();
            const gain = ringtoneAudioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(step % 2 === 0 ? 440 : 554.37, ringtoneAudioCtx.currentTime);
            gain.gain.setValueAtTime(0.12, ringtoneAudioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ringtoneAudioCtx.currentTime + 0.35);
            osc.connect(gain);
            gain.connect(ringtoneAudioCtx.destination);
            osc.start();
            osc.stop(ringtoneAudioCtx.currentTime + 0.35);
            step++;
        }, 450);
    } catch (e) {
        console.log('Ringtone sound init error:', e);
    }
}

function stopRingtone() {
    if (ringtoneTimer) {
        clearInterval(ringtoneTimer);
        ringtoneTimer = null;
    }
    if (ringtoneAudioCtx) {
        try { ringtoneAudioCtx.close(); } catch (e) { }
        ringtoneAudioCtx = null;
    }
}

// --- WebRTC Signaling Socket Listeners ---
socket.on('user-joined-video-call', (data) => {
    if (activeCallRoomId && data.roomId === activeCallRoomId) {
        showToast(`${data.username} joined the video call`, 'info');
        createPeerConnection(data.username, true);
    }
});

socket.on('incoming-call-offer', async (data) => {
    if (!activeCallRoomId && peerConnections.size === 0) {
        callTarget = data.from;
        startRingtone();
        showToast(`📞 Incoming Video Call from ${escapeHtml(data.from)}!`, 'warning');
        if (callerName) callerName.textContent = `📞 ${data.from} is calling you...`;
        if (incomingCallModal) incomingCallModal.classList.add('active');

        if (acceptCallBtn) {
            acceptCallBtn.onclick = async () => {
                stopRingtone();
                if (incomingCallModal) incomingCallModal.classList.remove('active');
                try {
                    activeCallTargetDM = data.from;
                    if (callTitleText) callTitleText.textContent = `📹 Private Call — ${data.from}`;
                    await acquireLocalMedia();
                    videoOverlay.classList.add('active');

                    const pc = createPeerConnection(data.from, false);
                    await pc.setRemoteDescription(data.offer);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('call-accepted', { to: data.from, answer });
                } catch (err) {
                    showToast('Camera/Microphone access denied', 'error');
                    endCall();
                }
            };
        }

        if (rejectCallBtn) {
            rejectCallBtn.onclick = () => {
                stopRingtone();
                if (incomingCallModal) incomingCallModal.classList.remove('active');
                socket.emit('call-rejected', { to: data.from });
            };
        }
    } else if (activeCallRoomId) {
        try {
            const pc = createPeerConnection(data.from, false);
            await pc.setRemoteDescription(data.offer);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('call-accepted', { to: data.from, answer });
        } catch (err) {
            console.error('Error answering room peer offer:', err);
        }
    }
});

socket.on('incoming-room-video-call', (data) => {
    if (!activeCallRoomId && peerConnections.size === 0) {
        startRingtone();
        showToast(`📹 Incoming Group Call in ${escapeHtml(data.roomName)} from ${escapeHtml(data.from)}!`, 'warning');
        if (callerName) callerName.textContent = `📹 ${data.from} started a video call in ${data.roomName}`;
        if (incomingCallModal) incomingCallModal.classList.add('active');

        if (acceptCallBtn) {
            acceptCallBtn.onclick = async () => {
                stopRingtone();
                if (incomingCallModal) incomingCallModal.classList.remove('active');
                joinRoom(data.roomId);
                startOrJoinRoomCall(data.roomId, data.roomName);
            };
        }

        if (rejectCallBtn) {
            rejectCallBtn.onclick = () => {
                stopRingtone();
                if (incomingCallModal) incomingCallModal.classList.remove('active');
            };
        }
    }
});

socket.on('call-accepted', async (data) => {
    const pc = peerConnections.get(data.from);
    if (pc && data.answer) {
        try {
            await pc.setRemoteDescription(data.answer);
        } catch (err) {
            console.error('Error setting remote description:', err);
        }
    }
});

socket.on('ice-candidate', async (data) => {
    const pc = peerConnections.get(data.from);
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(data.candidate);
        } catch (err) { /* ignore candidate errors */ }
    }
});

socket.on('call-rejected', (data) => {
    showToast(`${data.from} rejected the call`, 'warning');
    endCall();
});

socket.on('user-left-video-call', (data) => {
    showToast(`${data.username} left the video call`, 'info');
    if (peerConnections.has(data.username)) {
        peerConnections.get(data.username).close();
        peerConnections.delete(data.username);
    }
    callMediaStates.delete(data.username);
    removeVideoTile(data.username);
    updateCallHeader();
});

socket.on('call-ended', (data) => {
    if (data.from && peerConnections.has(data.from)) {
        peerConnections.get(data.from).close();
        peerConnections.delete(data.from);
        removeVideoTile(data.from);
        updateCallHeader();
    }
    if (activeCallTargetDM && data.from === activeCallTargetDM) {
        showToast('Call ended', 'info');
        endCall();
    }
});

socket.on('call-media-state', (data) => {
    if (!data.from) return;
    callMediaStates.set(data.from, {
        audioEnabled: data.audioEnabled !== false,
        videoEnabled: data.videoEnabled !== false
    });
    updateVideoTileMediaState(data.from);
});

// Toggle Local Mic / Camera
if (toggleMicBtn) {
    toggleMicBtn.addEventListener('click', () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
                toggleMicBtn.innerHTML = `<i class="fas fa-microphone${audioTrack.enabled ? '' : '-slash'}"></i>`;
                sendLocalMediaState();
                updateVideoTileMediaState(currentUser.username);
            }
        }
    });
}

if (toggleCamBtn) {
    toggleCamBtn.addEventListener('click', () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                toggleCamBtn.classList.toggle('muted', !videoTrack.enabled);
                toggleCamBtn.innerHTML = `<i class="fas fa-video${videoTrack.enabled ? '' : '-slash'}"></i>`;
                sendLocalMediaState();
                updateVideoTileMediaState(currentUser.username);
            }
        }
    });
}

function sendLocalMediaState() {
    if (!localStream) return;
    const audioEnabled = !!localStream.getAudioTracks()[0]?.enabled;
    const videoEnabled = !!localStream.getVideoTracks()[0]?.enabled;

    if (activeCallRoomId) {
        socket.emit('call-media-state', { roomId: activeCallRoomId, audioEnabled, videoEnabled });
    } else if (activeCallTargetDM) {
        socket.emit('call-media-state', { to: activeCallTargetDM, audioEnabled, videoEnabled });
    }
}

if (endCallBtn) endCallBtn.addEventListener('click', endCall);

function endCall() {
    if (activeCallRoomId) {
        socket.emit('leave-video-call', { roomId: activeCallRoomId });
    } else if (activeCallTargetDM) {
        socket.emit('end-call', { to: activeCallTargetDM });
    }

    peerConnections.forEach((pc) => pc.close());
    peerConnections.clear();
    callMediaStates.clear();

    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }

    if (videoGrid) videoGrid.innerHTML = '';
    if (videoOverlay) videoOverlay.classList.remove('active');
    maximizeCall(); // Reset minimize state

    activeCallRoomId = null;
    activeCallTargetDM = null;

    if (toggleMicBtn) {
        toggleMicBtn.classList.remove('muted');
        toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    }
    if (toggleCamBtn) {
        toggleCamBtn.classList.remove('muted');
        toggleCamBtn.innerHTML = '<i class="fas fa-video"></i>';
    }
}

// ==================== MUSIC ROOM ====================
let ytPlayer = null;
let isYouTubeMode = false;
let progressInterval = null;
let ytApiPromise = null;

function loadYouTubeAPI() {
    if (window.YT?.Player) return Promise.resolve();
    if (ytApiPromise) return ytApiPromise;
    ytApiPromise = new Promise((resolve) => {
        window.onYouTubeIframeAPIReady = () => resolve();
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    });
    return ytApiPromise;
}

function updateProgressUI(current, duration) {
    if (!duration || isNaN(duration)) return;
    progressFill.style.width = ((current / duration) * 100) + '%';
    currentTimeEl.textContent = formatAudioTime(current);
    totalTimeEl.textContent = formatAudioTime(duration);
}

function resetProgressUI() {
    progressFill.style.width = '0%';
    currentTimeEl.textContent = '0:00';
    totalTimeEl.textContent = '0:00';
}

function startProgressPolling() {
    stopProgressPolling();
    progressInterval = setInterval(() => {
        if (isYouTubeMode && ytPlayer?.getCurrentTime) {
            updateProgressUI(ytPlayer.getCurrentTime(), ytPlayer.getDuration());
        }
    }, 500);
}

function stopProgressPolling() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

function setPlayingUI(playing) {
    if (playing) {
        vinylSpin.classList.add('spinning');
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        startProgressPolling();
    } else {
        vinylSpin.classList.remove('spinning');
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        stopProgressPolling();
    }
}

function isCurrentlyPlaying() {
    if (isYouTubeMode && ytPlayer?.getPlayerState) {
        return ytPlayer.getPlayerState() === 1; // YT.PlayerState.PLAYING
    }
    return !musicPlayer.paused && !!musicPlayer.src;
}

function getCurrentPlaybackTime() {
    if (isYouTubeMode && ytPlayer?.getCurrentTime) return ytPlayer.getCurrentTime();
    return musicPlayer.currentTime || 0;
}

function playCurrentTrack() {
    if (isYouTubeMode && ytPlayer?.playVideo) {
        ytPlayer.playVideo();
    } else {
        musicPlayer.play().catch(() => { });
    }
    setPlayingUI(true);
}

function pauseCurrentTrack() {
    if (isYouTubeMode && ytPlayer?.pauseVideo) {
        ytPlayer.pauseVideo();
    } else {
        musicPlayer.pause();
    }
    setPlayingUI(false);
}

function seekCurrentTrack(time) {
    if (isYouTubeMode && ytPlayer?.seekTo) {
        ytPlayer.seekTo(time, true);
        updateProgressUI(time, ytPlayer.getDuration());
    } else {
        musicPlayer.currentTime = time;
    }
}

function stopYouTubePlayer() {
    if (ytPlayer?.stopVideo) ytPlayer.stopVideo();
    isYouTubeMode = false;
}

function updateTrackSourceBadge(track) {
    if (!trackSource) return;
    if (!track || currentTrackIndex < 0) {
        trackSource.className = 'track-source-badge';
        trackSource.innerHTML = '';
        return;
    }
    if (track.type === 'youtube') {
        trackSource.className = 'track-source-badge visible youtube';
        trackSource.innerHTML = '<i class="fab fa-youtube"></i> YouTube';
    } else {
        trackSource.className = 'track-source-badge visible local';
        trackSource.innerHTML = '<i class="fas fa-file-audio"></i> Local Audio';
    }
}

function updateAlbumArt(track) {
    if (!albumArt) return;
    albumArt.classList.toggle('youtube-source', track?.type === 'youtube');
    const placeholder = albumArt.querySelector('.album-art-placeholder');
    if (!placeholder) return;
    if (track?.type === 'youtube') {
        placeholder.innerHTML = '<i class="fab fa-youtube"></i>';
    } else if (track) {
        placeholder.innerHTML = `<span style="font-size:48px">${track.cover || '🎧'}</span>`;
    } else {
        placeholder.innerHTML = '<i class="fas fa-music"></i>';
    }
}

async function loadYouTubeTrack(videoId, startSeconds = 0) {
    await loadYouTubeAPI();
    isYouTubeMode = true;
    if (musicPlayer) {
        musicPlayer.pause();
        musicPlayer.src = '';
    }

    const playerVars = {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        playsinline: 1
    };

    if (!ytPlayer) {
        ytPlayer = new YT.Player('youtube-player', {
            height: '1',
            width: '1',
            videoId,
            playerVars,
            events: {
                onReady: (e) => {
                    e.target.setVolume(volumeSlider.value);
                    if (startSeconds > 0) e.target.seekTo(startSeconds, true);
                    e.target.playVideo();
                },
                onStateChange: (e) => {
                    if (e.data === 1) { // PLAYING
                        setPlayingUI(true);
                        const dur = e.target.getDuration();
                        if (dur) totalTimeEl.textContent = formatAudioTime(dur);
                    } else if (e.data === 2) { // PAUSED
                        setPlayingUI(false);
                    } else if (e.data === 0) { // ENDED
                        setPlayingUI(false);
                        const idx = (currentTrackIndex + 1) % playlist.length;
                        loadTrack(idx);
                        playCurrentTrack();
                        socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
                    }
                }
            }
        });
    } else {
        ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startSeconds) });
        setPlayingUI(true);
    }
}

function renderPlaylist() {
    playlistItems.innerHTML = '';
    playlist.forEach((track, i) => {
        const div = document.createElement('div');
        div.className = `playlist-item ${i === currentTrackIndex ? 'active' : ''}`;
        div.innerHTML = `
      <div class="track-num">${i === currentTrackIndex ? '<i class="fas fa-volume-up"></i>' : (i + 1)}</div>
      <div class="track-details">
        <div class="track-name">${track.cover} ${escapeHtml(track.title)}</div>
        <div class="track-by">${escapeHtml(track.artist)}</div>
      </div>
      <div class="track-dur">${track.duration}</div>
      <button class="btn-remove-track" title="Remove track" onclick="event.stopPropagation();removeTrack('${escapeHtml(track.id)}')"><i class="fas fa-trash-alt"></i></button>
    `;
        div.addEventListener('click', () => {
            loadTrack(i, 0);
            const t = playlist[i];
            if (t.type !== 'youtube') playCurrentTrack();
            socket.emit('music-control', { action: 'play', trackId: i, currentTime: 0 });
        });
        playlistItems.appendChild(div);
    });
}

function removeTrack(trackId) {
    socket.emit('music-remove-track', { trackId }, (res) => {
        if (res?.success) {
            playlist = res.playlist;
            // If removed track was currently playing, stop and reset
            const removedWasPlaying = playlist.findIndex(t => t.id === trackId) === -1 && currentTrackIndex >= playlist.length;
            if (removedWasPlaying) {
                currentTrackIndex = -1;
                if (musicPlayer) { musicPlayer.pause(); musicPlayer.src = ''; }
                stopYouTubePlayer();
                setPlayingUI(false);
            } else if (currentTrackIndex >= playlist.length) {
                currentTrackIndex = playlist.length - 1;
            }
            renderPlaylist();
            showToast('Track removed', 'info');
        } else {
            showToast(res?.error || 'Failed to remove track', 'error');
        }
    });
}

// Extract YouTube video ID from URL
function extractYouTubeId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
    ];
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Get YouTube embed or proxy URL

function loadTrack(index, startSeconds = 0) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const track = playlist[index];
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    updateAlbumArt(track);
    updateTrackSourceBadge(track);
    resetProgressUI();

    if (track.type === 'youtube' && track.file) {
        const videoId = extractYouTubeId(track.file);
        if (videoId) {
            loadYouTubeTrack(videoId, startSeconds);
        } else {
            showToast('Invalid YouTube URL', 'error');
        }
    } else {
        stopYouTubePlayer();
        if (musicPlayer) {
            musicPlayer.src = track.file;
            musicPlayer.load();
            if (startSeconds > 0) musicPlayer.currentTime = startSeconds;
        }
    }
    renderPlaylist();
    return track;
}

playBtn.addEventListener('click', () => {
    if (currentTrackIndex === -1 && playlist.length > 0) {
        loadTrack(0, 0);
        if (playlist[0]?.type !== 'youtube') playCurrentTrack();
        socket.emit('music-control', { action: 'play', trackId: 0, currentTime: 0 });
        return;
    }
    if (isCurrentlyPlaying()) {
        pauseCurrentTrack();
        socket.emit('music-control', { action: 'pause', trackId: currentTrackIndex, currentTime: getCurrentPlaybackTime() });
    } else {
        playCurrentTrack();
        socket.emit('music-control', { action: 'resume', trackId: currentTrackIndex, currentTime: getCurrentPlaybackTime() });
    }
});

prevBtn.addEventListener('click', () => {
    const idx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrack(idx, 0);
    if (playlist[idx]?.type !== 'youtube') playCurrentTrack();
    socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
});

nextBtn.addEventListener('click', () => {
    const idx = (currentTrackIndex + 1) % playlist.length;
    loadTrack(idx, 0);
    if (playlist[idx]?.type !== 'youtube') playCurrentTrack();
    socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
});

musicPlayer.addEventListener('timeupdate', () => {
    if (!isYouTubeMode && musicPlayer.duration) {
        updateProgressUI(musicPlayer.currentTime, musicPlayer.duration);
    }
});

musicPlayer.addEventListener('ended', () => {
    if (isYouTubeMode) return;
    const idx = (currentTrackIndex + 1) % playlist.length;
    loadTrack(idx);
    playCurrentTrack();
    socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
});

progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (isYouTubeMode && ytPlayer?.getDuration) {
        seekCurrentTrack(pct * ytPlayer.getDuration());
    } else if (musicPlayer.duration) {
        seekCurrentTrack(pct * musicPlayer.duration);
    }
    socket.emit('music-control', { action: 'seek', trackId: currentTrackIndex, currentTime: getCurrentPlaybackTime() });
});

volumeSlider.addEventListener('input', () => {
    const vol = volumeSlider.value;
    musicPlayer.volume = vol / 100;
    if (ytPlayer?.setVolume) ytPlayer.setVolume(vol);
    if (volumeIcon) {
        volumeIcon.className = vol == 0 ? 'fas fa-volume-mute' : vol < 50 ? 'fas fa-volume-down' : 'fas fa-volume-up';
    }
});

// Receive music control from others
socket.on('music-control', (data) => {
    const track = playlist[data.trackId];
    if (data.action === 'play') {
        loadTrack(data.trackId, data.currentTime || 0);
        if (track?.type !== 'youtube') playCurrentTrack();
        showToast(`${data.username} is playing: ${track?.title}`, 'info');
    } else if (data.action === 'pause') {
        pauseCurrentTrack();
    } else if (data.action === 'resume') {
        if (data.trackId !== currentTrackIndex) {
            loadTrack(data.trackId, data.currentTime || 0);
        } else {
            seekCurrentTrack(data.currentTime || 0);
        }
        if (track?.type !== 'youtube' || data.trackId === currentTrackIndex) playCurrentTrack();
    } else if (data.action === 'seek') {
        seekCurrentTrack(data.currentTime);
    }
});

socket.on('music-playlist-updated', (data) => {
    playlist = data.playlist || playlist;
    if (currentChat && currentChat.type === 'room' && currentChat.data?.type === 'music') {
        renderPlaylist();
    }
});

// ==================== LOGOUT ====================
logoutBtn.addEventListener('click', () => {
    socket.disconnect();
    location.reload();
});

// ==================== CLOSE MODAL ON OVERLAY CLICK ====================
createRoomModal.addEventListener('click', (e) => {
    if (e.target === createRoomModal) createRoomModal.classList.remove('active');
});

// ==================== INITIAL VOLUME ====================
musicPlayer.volume = 0.7;

// ==================== MOBILE SIDEBAR ====================
const mobileMenuToggle = $('mobile-menu-toggle');
const sidebarEl = $('sidebar');
const sidebarOverlay = $('sidebar-overlay');

function openSidebar() {
    if (sidebarEl) sidebarEl.classList.add('active');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
}

function closeSidebar() {
    if (sidebarEl) sidebarEl.classList.remove('active');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        if (sidebarEl && sidebarEl.classList.contains('active')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
}

// Auto-close sidebar on mobile when joining a room or opening DM
const originalJoinRoom = joinRoom;
joinRoom = function (roomId) {
    closeSidebar();
    originalJoinRoom(roomId);
};

const originalOpenDM = openDM;
openDM = function (username) {
    closeSidebar();
    originalOpenDM(username);
};

// Desktop Sidebar Collapse Toggle
const collapseSidebarBtn = $('collapse-sidebar-btn');
if (collapseSidebarBtn) {
    collapseSidebarBtn.addEventListener('click', () => {
        if (sidebarEl) {
            sidebarEl.classList.toggle('collapsed');
            const isCollapsed = sidebarEl.classList.contains('collapsed');
            collapseSidebarBtn.innerHTML = `<i class="fas fa-chevron-${isCollapsed ? 'right' : 'left'}"></i>`;
            collapseSidebarBtn.title = isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
        }
    });
}

// Room Members Sidebar & View Members Button
function updateMembersList(members) {
    if (!membersList) return;
    membersList.innerHTML = '';
    const normalized = normalizeMembers(members);
    normalized.forEach(m => {
        const item = document.createElement('div');
        item.className = `member-item ${m.active ? 'active' : 'inactive'}`;
        item.innerHTML = `
            <div class="avatar-sm ${getAvatarColor(m.username)}" style="width:28px;height:28px;font-size:12px;">${getInitials(m.username)}</div>
            <span class="member-name" style="font-weight:600;font-size:13px;">${escapeHtml(m.username)}</span>
            <span class="member-state ${m.active ? 'active' : 'inactive'}">${m.active ? 'Active' : 'Offline'}</span>
        `;
        membersList.appendChild(item);
    });
}

if (roomMembersBtn) {
    roomMembersBtn.addEventListener('click', () => {
        if (membersSidebar) {
            membersSidebar.classList.toggle('active');
            if (currentChat && currentChat.type === 'room' && currentChat.data?.members) {
                updateMembersList(currentChat.data.members);
            }
        }
    });
}

if (closeMembersBtn) {
    closeMembersBtn.addEventListener('click', () => {
        if (membersSidebar) membersSidebar.classList.remove('active');
    });
}

// ==================== EMOJI & GIF PICKERS ====================
const emojiBtn = $('emoji-btn');
const musicEmojiBtn = $('music-emoji-btn');
const emojiPickerPopover = $('emoji-picker-popover');
const closeEmojiPicker = $('close-emoji-picker');
const emojiGrid = $('emoji-grid');
const emojiTabs = document.querySelectorAll('.emoji-tab');

const gifBtn = $('gif-btn');
const musicGifBtn = $('music-gif-btn');
const gifPickerPopover = $('gif-picker-popover');
const closeGifPicker = $('close-gif-picker');
const gifGrid = $('gif-grid');
const gifSearchInput = $('gif-search-input');
const gifTags = document.querySelectorAll('.gif-tag');

let activeInputTarget = chatInput;

const emojiData = {
    smileys: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷'],
    gestures: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🖐️', '✋', '🖖', '👋', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '<ctrl42>', '💪', '🦾', '👂', '👃', '🧠', '👀', '👁️', '舌', '👄'],
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '<ctrl42>', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'],
    objects: ['🎉', '🎊', '🎈', '🎂', '🎁', '🎗️', '🎟️', '🎫', '🎖️', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜']
};

const gifData = {
    trending: [
        { url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', title: 'Happy Dance' },
        { url: 'https://media.giphy.com/media/3o7TKsjN42gScbefsY/giphy.gif', title: 'Thumbs Up' },
        { url: 'https://media.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif', title: 'Clapping' },
        { url: 'https://media.giphy.com/media/l3fQf1OEAq0iri9RC/giphy.gif', title: 'Party Cat' },
        { url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif', title: 'Cheers' },
        { url: 'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif', title: 'Mind Blown' }
    ],
    happy: [
        { url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', title: 'Happy Dance' },
        { url: 'https://media.giphy.com/media/13m24iFmhomZi0/giphy.gif', title: 'Excited' },
        { url: 'https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif', title: 'Woohoo' }
    ],
    dance: [
        { url: 'https://media.giphy.com/media/l3vRlT2k2L35Cbo52/giphy.gif', title: 'Disco Dance' },
        { url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif', title: 'Groove Dance' }
    ],
    lol: [
        { url: 'https://media.giphy.com/media/10JhviFuU2gWD6/giphy.gif', title: 'LOL Laugh' },
        { url: 'https://media.giphy.com/media/bC9czlgCM8gJA8abfZ/giphy.gif', title: 'Hahaha' }
    ],
    love: [
        { url: 'https://media.giphy.com/media/26hpKMTa5Hg1XUA12/giphy.gif', title: 'Heart Eyes' },
        { url: 'https://media.giphy.com/media/l4pTdcifPZLpDjL1e/giphy.gif', title: 'Sending Love' }
    ],
    fire: [
        { url: 'https://media.giphy.com/media/nrXif4Ytz4hxe/giphy.gif', title: 'On Fire' },
        { url: 'https://media.giphy.com/media/l0IXYWD715lzUK3le/giphy.gif', title: 'Fire Lit' }
    ]
};

function renderEmojiCategory(cat = 'smileys') {
    if (!emojiGrid) return;
    emojiGrid.innerHTML = '';
    const list = emojiData[cat] || emojiData.smileys;
    list.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-btn-item';
        btn.textContent = emoji;
        btn.addEventListener('click', () => {
            if (activeInputTarget) {
                activeInputTarget.value += emoji;
                activeInputTarget.focus();
            }
        });
        emojiGrid.appendChild(btn);
    });
}

function renderGifs(category = 'trending', query = '') {
    if (!gifGrid) return;
    gifGrid.innerHTML = '';
    let list = gifData[category] || gifData.trending;
    if (query) {
        const q = query.toLowerCase();
        list = list.filter(g => g.title.toLowerCase().includes(q) || category.includes(q));
        if (list.length === 0) {
            list = [{ url: 'https://media.giphy.com/media/3o7TKsjN42gScbefsY/giphy.gif', title: query }];
        }
    }

    list.forEach(gif => {
        const img = document.createElement('img');
        img.src = gif.url;
        img.alt = gif.title;
        img.className = 'gif-item';
        img.loading = 'lazy';
        img.addEventListener('click', () => {
            const gifAttachment = {
                url: gif.url,
                fileName: `${gif.title}.gif`,
                mimeType: 'image/gif',
                fileSize: 0,
                mediaType: 'image'
            };

            if (currentChat) {
                const msgObj = {
                    id: Date.now().toString(),
                    from: currentUser?.username || 'me',
                    to: currentChat.type === 'dm' ? currentDMUser : undefined,
                    roomId: currentChat.type === 'room' ? currentChat.id : undefined,
                    text: '',
                    attachment: gifAttachment,
                    timestamp: new Date().toISOString()
                };

                if (currentChat.type === 'dm') {
                    socket.emit('private-message', { to: currentDMUser, text: '', attachment: gifAttachment });
                } else if (currentChat.type === 'room') {
                    socket.emit('room-message', { text: '', attachment: gifAttachment });
                }

                if (currentChat.data?.type === 'music') {
                    appendMusicChatMessage(msgObj);
                } else {
                    appendMessageUI(msgObj);
                }
            }
            if (gifPickerPopover) gifPickerPopover.classList.add('hidden');
        });
        gifGrid.appendChild(img);
    });
}

// Emoji button events
if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInputTarget = chatInput;
        if (gifPickerPopover) gifPickerPopover.classList.add('hidden');
        if (emojiPickerPopover) {
            emojiPickerPopover.classList.toggle('hidden');
            if (!emojiPickerPopover.classList.contains('hidden')) renderEmojiCategory('smileys');
        }
    });
}
if (musicEmojiBtn) {
    musicEmojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInputTarget = musicChatInput;
        if (gifPickerPopover) gifPickerPopover.classList.add('hidden');
        if (emojiPickerPopover) {
            emojiPickerPopover.classList.toggle('hidden');
            if (!emojiPickerPopover.classList.contains('hidden')) renderEmojiCategory('smileys');
        }
    });
}
if (closeEmojiPicker) {
    closeEmojiPicker.addEventListener('click', () => {
        if (emojiPickerPopover) emojiPickerPopover.classList.add('hidden');
    });
}
emojiTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        emojiTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderEmojiCategory(tab.dataset.category);
    });
});

// GIF button events
if (gifBtn) {
    gifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInputTarget = chatInput;
        if (emojiPickerPopover) emojiPickerPopover.classList.add('hidden');
        if (gifPickerPopover) {
            gifPickerPopover.classList.toggle('hidden');
            if (!gifPickerPopover.classList.contains('hidden')) renderGifs('trending');
        }
    });
}
if (musicGifBtn) {
    musicGifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeInputTarget = musicChatInput;
        if (emojiPickerPopover) emojiPickerPopover.classList.add('hidden');
        if (gifPickerPopover) {
            gifPickerPopover.classList.toggle('hidden');
            if (!gifPickerPopover.classList.contains('hidden')) renderGifs('trending');
        }
    });
}
if (closeGifPicker) {
    closeGifPicker.addEventListener('click', () => {
        if (gifPickerPopover) gifPickerPopover.classList.add('hidden');
    });
}
gifTags.forEach(tag => {
    tag.addEventListener('click', () => {
        gifTags.forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        renderGifs(tag.dataset.tag, gifSearchInput ? gifSearchInput.value : '');
    });
});
if (gifSearchInput) {
    gifSearchInput.addEventListener('input', () => {
        const activeTag = document.querySelector('.gif-tag.active')?.dataset?.tag || 'trending';
        renderGifs(activeTag, gifSearchInput.value);
    });
}

// Close pickers on outside click
document.addEventListener('click', (e) => {
    if (emojiPickerPopover && !emojiPickerPopover.contains(e.target) && e.target !== emojiBtn && e.target !== musicEmojiBtn) {
        emojiPickerPopover.classList.add('hidden');
    }
    if (gifPickerPopover && !gifPickerPopover.contains(e.target) && e.target !== gifBtn && e.target !== musicGifBtn) {
        gifPickerPopover.classList.add('hidden');
    }
});
