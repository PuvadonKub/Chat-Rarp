// ==================== CHATVERSE CLIENT ====================
const socket = io();

// ==================== STATE ====================
let currentUser = null;
let currentRoom = null;
let currentDMUser = null;
let localStream = null;
let peerConnection = null;
let callTarget = null;
let musicPlayer = null;
let currentTrackIndex = -1;
let playlist = [];
let isMusicHost = false;

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
const welcomePanel = $('welcome-panel');
const chatPanel = $('chat-panel');
const musicPanel = $('music-panel');
const backBtn = $('back-btn');
const chatMessages = $('chat-messages');
const chatInput = $('chat-input');
const sendBtn = $('send-btn');
const leaveRoomBtn = $('leave-room-btn');

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
const localVideo = $('local-video');
const remoteVideo = $('remote-video');
const remoteLabel = $('remote-label');
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
const playlistItems = $('playlist-items');
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
        } else {
            loginError.textContent = res.error;
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Join ChatVerse</span><i class="fas fa-arrow-right"></i>';
        }
    });
}

// ==================== ROOM LIST ====================
socket.on('room-list', (rooms) => {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const isMusic = room.type === 'music';
        const isActive = currentRoom && currentRoom.id === room.id;
        const div = document.createElement('div');
        div.className = `room-item ${isActive ? 'active' : ''}`;
        div.innerHTML = `
      <div class="room-icon ${room.type}">
        <i class="fas fa-${isMusic ? 'music' : 'hashtag'}"></i>
      </div>
      <div class="room-info">
        <div class="room-title">${escapeHtml(room.name)}</div>
        <div class="room-meta">${room.memberCount} member${room.memberCount !== 1 ? 's' : ''}</div>
      </div>
    `;
        div.addEventListener('click', () => joinRoom(room.id));
        roomList.appendChild(div);
    });
});

// ==================== ONLINE USERS ====================
socket.on('online-users', (users) => {
    onlineCount.textContent = users.length;
    onlineUsers.innerHTML = '';
    users.forEach(user => {
        const isMe = currentUser && user.username === currentUser.username;
        const div = document.createElement('div');
        div.className = `user-item ${isMe ? 'is-me' : ''}`;
        div.innerHTML = `
      <div class="avatar-sm ${getAvatarColor(user.username)}">${getInitials(user.username)}</div>
      <span class="status-dot"></span>
      <span class="user-name">${escapeHtml(user.username)}${isMe ? ' (you)' : ''}</span>
      ${!isMe ? '<span class="dm-badge"><i class="fas fa-envelope"></i></span>' : ''}
    `;
        if (!isMe) {
            div.addEventListener('click', () => openDM(user.username));
        }
        onlineUsers.appendChild(div);
    });
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

        if (res.room.type === 'music') {
            showPanel(musicPanel);
            musicRoomMembers.textContent = `${res.room.members.length} listening`;
            playlist = res.playlist || [];
            renderPlaylist();
            renderMusicChat(res.room.messages);
            if (playlist.length > 0 && currentTrackIndex === -1) loadTrack(0);
        } else {
            showPanel(chatPanel);
            roomNameEl.textContent = res.room.name;
            roomMembersCount.textContent = `${res.room.members.length} members`;
            activeChatAvatar.innerHTML = `<i class="fas fa-users"></i>`;
            activeChatAvatar.className = `avatar-sm avatar-color-5`;
            renderChatMessages(res.room.messages);
            updateMembersList(res.room.members);
            chatInput.focus();
        }
        renderUnifiedList();
    });
}

function openDM(username) {
    currentChat = { type: 'dm', id: username, name: username };
    showPanel(chatPanel);
    roomNameEl.textContent = username;
    roomMembersCount.textContent = 'Active now';
    activeChatAvatar.innerHTML = getInitials(username);
    activeChatAvatar.className = `avatar-sm ${getAvatarColor(username)}`;

    socket.emit('get-private-chat', username, (res) => {
        renderChatMessages(res.messages || []);
        res.messages.filter(m => m.from === username && !m.read).forEach(m => {
            socket.emit('message-read', { messageId: m.id, from: m.from });
        });
    });
    renderUnifiedList();
    chatInput.focus();
}

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
    showPanel(welcomePanel);
    membersSidebar.classList.remove('active');
    if (musicPlayer) {
        musicPlayer.pause();
        vinylSpin.classList.remove('spinning');
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
    renderUnifiedList();
}

// ==================== CHAT MESSAGES ====================

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
    row.className = `ms-msg-row ${isSent ? 'sent' : 'received'}`;

    row.innerHTML = `
        ${!isSent ? `<div class="avatar-sm ${getAvatarColor(msg.from)}" style="width:28px;height:28px;font-size:12px;margin-right:8px;align-self:flex-end;">${getInitials(msg.from)}</div>` : ''}
        <div class="ms-msg-bubble" title="${formatTime(msg.timestamp)}">${escapeHtml(msg.text)}</div>
    `;
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentChat) return;

    const msg = {
        id: Date.now().toString(),
        from: currentUser.username,
        text,
        timestamp: new Date().toISOString(),
        type: 'message'
    };

    appendMessageUI(msg);
    if (currentChat.type === 'room') {
        socket.emit('room-message', { text });
    } else {
        socket.emit('private-message', { to: currentChat.id, text });
    }
    chatInput.value = '';
}

socket.on('room-message', (msg) => {
    if (currentChat && currentChat.type === 'room') {
        if (currentChat.data && currentChat.data.type === 'music') appendMusicChatMessage(msg);
        else appendMessageUI(msg);
    }
});

socket.on('private-message', (msg) => {
    if (currentChat && currentChat.type === 'dm' && currentChat.id === msg.from) {
        appendMessageUI(msg);
        socket.emit('message-read', { messageId: msg.id, from: msg.from });
    } else {
        showToast(`💬 New DM from ${msg.from}`, 'info');
    }
});

socket.on('user-joined-room', (data) => {
    if (currentChat && currentChat.type === 'room' && currentChat.id === data.roomId) {
        if (!currentChat.data.members.includes(data.username)) currentChat.data.members.push(data.username);
        updateMembersList(currentChat.data.members);
        roomMembersCount.textContent = `${currentChat.data.members.length} members`;
        showToast(`${data.username} joined`, 'info');
    }
});
socket.on('user-left-room', (data) => {
    if (currentChat && currentChat.type === 'room' && currentChat.id === data.roomId) {
        currentChat.data.members = currentChat.data.members.filter(m => m !== data.username);
        updateMembersList(currentChat.data.members);
        roomMembersCount.textContent = `${currentChat.data.members.length} members`;
        showToast(`${data.username} left`, 'warning');
    }
});

roomMembersBtn.addEventListener('click', () => membersSidebar.classList.toggle('active'));
closeMembersBtn.addEventListener('click', () => membersSidebar.classList.remove('active'));

function updateMembersList(members) {
    if (!membersList) return;
    membersList.innerHTML = '';
    members.forEach(m => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.innerHTML = `<div class="avatar-sm ${getAvatarColor(m)}">${getInitials(m)}</div> <span>${escapeHtml(m)}</span>`;
        membersList.appendChild(div);
    });
}

// Music room chat logic
musicSendBtn.addEventListener('click', sendMusicChat);
musicChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMusicChat(); });
function sendMusicChat() {
    const text = musicChatInput.value.trim();
    if (!text || !currentChat) return;
    const msg = { id: Date.now().toString(), from: currentUser.username, text, timestamp: new Date().toISOString(), type: 'message' };
    appendMusicChatMessage(msg);
    socket.emit('room-message', { text });
    musicChatInput.value = '';
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
        row.className = `ms-msg-row ${isSent ? 'sent' : 'received'}`;
        row.innerHTML = `<div class="ms-msg-bubble">${escapeHtml(msg.text)}</div>`;
        musicChatMessages.appendChild(row);
    }
    musicChatMessages.scrollTop = musicChatMessages.scrollHeight;
}

// ==================== VIDEO CALL (WebRTC) ====================

const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

videoCallBtn.addEventListener('click', () => {
    if (!currentChat) return;
    let target = currentChat.type === 'dm' ? currentChat.id : currentChat.data.members.filter(m => m !== currentUser.username)[0];
    if (target) startCall(target);
    else showToast('No one to call', 'warning');
});



async function startCall(username) {
    callTarget = username;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        videoOverlay.classList.add('active');
        remoteLabel.textContent = username;

        peerConnection = new RTCPeerConnection(rtcConfig);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        peerConnection.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('ice-candidate', { to: callTarget, candidate: e.candidate });
            }
        };

        peerConnection.ontrack = (e) => {
            remoteVideo.srcObject = e.streams[0];
        };

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('call-user', { to: username, offer });
        showToast(`Calling ${username}...`, 'info');
    } catch (err) {
        showToast('Camera/Microphone access denied', 'error');
        endCall();
    }
}

// Incoming call
socket.on('incoming-call', async (data) => {
    callTarget = data.from;
    callerName.textContent = `${data.from} is calling you...`;
    incomingCallModal.classList.add('active');

    acceptCallBtn.onclick = async () => {
        incomingCallModal.classList.remove('active');
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            videoOverlay.classList.add('active');
            remoteLabel.textContent = data.from;

            peerConnection = new RTCPeerConnection(rtcConfig);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            peerConnection.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('ice-candidate', { to: callTarget, candidate: e.candidate });
                }
            };

            peerConnection.ontrack = (e) => {
                remoteVideo.srcObject = e.streams[0];
            };

            await peerConnection.setRemoteDescription(data.offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('call-accepted', { to: data.from, answer });
        } catch (err) {
            showToast('Camera/Microphone access denied', 'error');
            endCall();
        }
    };

    rejectCallBtn.onclick = () => {
        incomingCallModal.classList.remove('active');
        socket.emit('call-rejected', { to: data.from });
    };
});

socket.on('call-accepted', async (data) => {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
    }
});

socket.on('ice-candidate', async (data) => {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(data.candidate);
        } catch (e) { /* ignore */ }
    }
});

socket.on('call-rejected', (data) => {
    showToast(`${data.from} rejected the call`, 'warning');
    endCall();
});

socket.on('call-ended', () => {
    showToast('Call ended', 'info');
    endCall();
});

// Toggle mic/cam
toggleMicBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
            toggleMicBtn.innerHTML = `<i class="fas fa-microphone${audioTrack.enabled ? '' : '-slash'}"></i>`;
        }
    }
});

toggleCamBtn.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            toggleCamBtn.classList.toggle('muted', !videoTrack.enabled);
            toggleCamBtn.innerHTML = `<i class="fas fa-video${videoTrack.enabled ? '' : '-slash'}"></i>`;
        }
    }
});

endCallBtn.addEventListener('click', () => {
    socket.emit('end-call', { to: callTarget });
    endCall();
});

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    videoOverlay.classList.remove('active');
    callTarget = null;
    toggleMicBtn.classList.remove('muted');
    toggleCamBtn.classList.remove('muted');
    toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    toggleCamBtn.innerHTML = '<i class="fas fa-video"></i>';
}

// ==================== MUSIC ROOM ====================
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
    `;
        div.addEventListener('click', () => {
            loadTrack(i);
            musicPlayer.play().catch(() => { });
            vinylSpin.classList.add('spinning');
            playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            // Sync to others
            socket.emit('music-control', { action: 'play', trackId: i, currentTime: 0 });
        });
        playlistItems.appendChild(div);
    });
}

function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;
    currentTrackIndex = index;
    const track = playlist[index];
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    albumArt.querySelector('.album-art-placeholder').innerHTML = `<span style="font-size:48px">${track.cover}</span>`;
    musicPlayer.src = track.file;
    musicPlayer.load();
    renderPlaylist();
}

playBtn.addEventListener('click', () => {
    if (currentTrackIndex === -1 && playlist.length > 0) {
        loadTrack(0);
    }
    if (musicPlayer.paused) {
        musicPlayer.play().catch(() => { });
        vinylSpin.classList.add('spinning');
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        socket.emit('music-control', { action: 'resume', trackId: currentTrackIndex, currentTime: musicPlayer.currentTime });
    } else {
        musicPlayer.pause();
        vinylSpin.classList.remove('spinning');
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        socket.emit('music-control', { action: 'pause', trackId: currentTrackIndex, currentTime: musicPlayer.currentTime });
    }
});

prevBtn.addEventListener('click', () => {
    const idx = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    loadTrack(idx);
    musicPlayer.play().catch(() => { });
    vinylSpin.classList.add('spinning');
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
});

nextBtn.addEventListener('click', () => {
    const idx = (currentTrackIndex + 1) % playlist.length;
    loadTrack(idx);
    musicPlayer.play().catch(() => { });
    vinylSpin.classList.add('spinning');
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
});

musicPlayer.addEventListener('timeupdate', () => {
    if (musicPlayer.duration) {
        const pct = (musicPlayer.currentTime / musicPlayer.duration) * 100;
        progressFill.style.width = pct + '%';
        currentTimeEl.textContent = formatAudioTime(musicPlayer.currentTime);
        totalTimeEl.textContent = formatAudioTime(musicPlayer.duration);
    }
});

musicPlayer.addEventListener('ended', () => {
    const idx = (currentTrackIndex + 1) % playlist.length;
    loadTrack(idx);
    musicPlayer.play().catch(() => { });
    socket.emit('music-control', { action: 'play', trackId: idx, currentTime: 0 });
});

progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    musicPlayer.currentTime = pct * musicPlayer.duration;
    socket.emit('music-control', { action: 'seek', trackId: currentTrackIndex, currentTime: musicPlayer.currentTime });
});

volumeSlider.addEventListener('input', () => {
    musicPlayer.volume = volumeSlider.value / 100;
});

// Receive music control from others
socket.on('music-control', (data) => {
    if (data.action === 'play') {
        loadTrack(data.trackId);
        musicPlayer.currentTime = data.currentTime || 0;
        musicPlayer.play().catch(() => { });
        vinylSpin.classList.add('spinning');
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        showToast(`${data.username} is playing: ${playlist[data.trackId]?.title}`, 'info');
    } else if (data.action === 'pause') {
        musicPlayer.pause();
        vinylSpin.classList.remove('spinning');
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
    } else if (data.action === 'resume') {
        if (data.trackId !== currentTrackIndex) loadTrack(data.trackId);
        musicPlayer.currentTime = data.currentTime || 0;
        musicPlayer.play().catch(() => { });
        vinylSpin.classList.add('spinning');
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else if (data.action === 'seek') {
        musicPlayer.currentTime = data.currentTime;
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
