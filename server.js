const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// ==================== APPLICATION SETUP ====================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8 // 100MB max payload size
});

const PORT = process.env.PORT || 3000;
const musicUploadDir = path.join(__dirname, 'public', 'uploads', 'music');
const chatUploadDir = path.join(__dirname, 'public', 'uploads', 'chat');

// Ensure upload directories exist
fs.mkdirSync(musicUploadDir, { recursive: true });
fs.mkdirSync(chatUploadDir, { recursive: true });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ==================== IN-MEMORY DATA STORE ====================
const rooms = new Map();        // roomId -> { id, name, type, owner, hidden, isPrivate, allowedUsers: Set, blockedUsers: Set, members: Set, presence: Map, messages: [], messageCount }
const users = new Map();        // socketId -> { id, username, socketId, currentRoom }
const privateChats = new Map(); // chatKey -> [{ id, from, to, text, attachment, timestamp, read }]
const onlineUsers = new Map();  // username -> socketId
const roomCalls = new Map();    // roomId -> Map<username, socketId>
let musicPlaylist = [];         // Array of music track objects

// Initialize default system rooms
function createDefaultRooms() {
  const createRoomObj = (id, name, type) => ({
    id,
    name,
    type,
    owner: 'system',
    hidden: false,
    isPrivate: false,
    allowedUsers: new Set(),
    blockedUsers: new Set(),
    members: new Set(),
    presence: new Map(),
    messages: [],
    messageCount: 0
  });

  rooms.set('lobby', createRoomObj('lobby', '🏠 Lobby', 'general'));
  rooms.set('music-room', createRoomObj('music-room', '🎵 Music Room', 'music'));
}
createDefaultRooms();

// ==================== HELPER FUNCTIONS ====================

/** Ensures room data structures are properly initialized */
function ensureRoomDefaults(room) {
  if (!room.presence) room.presence = new Map();
  if (!room.members) room.members = new Set();
  if (!room.allowedUsers) room.allowedUsers = new Set();
  if (!room.blockedUsers) room.blockedUsers = new Set();
}

/** Generates deterministic sorting key for 1-on-1 private chats */
function getChatKey(user1, user2) {
  return [user1, user2].sort().join('::');
}

/** Sanitizes file names to prevent path traversal or unsafe characters */
function sanitizeFileName(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Validates whether a user is allowed to access a given room */
function canUserAccessRoom(room, username) {
  ensureRoomDefaults(room);

  if (room.blockedUsers.has(username)) {
    return { allowed: false, reason: 'คุณถูกบล็อกไม่ให้เข้าห้องนี้ (You are blocked from this room)' };
  }

  if (room.isPrivate && room.owner !== username && !room.allowedUsers.has(username)) {
    return { allowed: false, reason: 'ห้องนี้เป็นห้องส่วนตัว เฉพาะผู้ได้รับอนุญาตเท่านั้น (Private room - Access denied)' };
  }

  return { allowed: true };
}

/** Prepares a user-customized list of accessible rooms */
function getRoomListForUser(username) {
  const list = [];
  rooms.forEach((room) => {
    ensureRoomDefaults(room);

    // Filter hidden rooms: visible only to owner and explicitly allowed users
    if (room.hidden && room.owner !== username && !room.allowedUsers.has(username)) {
      return;
    }

    const activeMemberCount = Array.from(room.presence.values()).filter(Boolean).length;
    list.push({
      id: room.id,
      name: room.name,
      type: room.type,
      owner: room.owner || 'system',
      hidden: Boolean(room.hidden),
      isPrivate: Boolean(room.isPrivate),
      memberCount: room.members.size,
      activeMemberCount,
      messageCount: room.messageCount || 0
    });
  });
  return list;
}

/** Broadcasts updated room list to all connected users */
function broadcastRoomList() {
  users.forEach((user, socketId) => {
    const s = io.sockets.sockets.get(socketId);
    if (s) {
      s.emit('room-list', getRoomListForUser(user.username));
    }
  });
}

/** Returns formatted room members with active status */
function getRoomMembers(room) {
  ensureRoomDefaults(room);
  return Array.from(room.members).map((username) => ({
    username,
    active: room.presence.get(username) === true
  }));
}

/** Sets user room presence state (active / inactive) */
function setRoomPresence(roomId, username, active) {
  const room = rooms.get(roomId);
  if (!room) return;
  ensureRoomDefaults(room);
  room.members.add(username);
  room.presence.set(username, active);
}

/** Helper to list currently registered online users */
function getOnlineUsersList() {
  const list = [];
  users.forEach((user) => {
    list.push({ id: user.id, username: user.username });
  });
  return list;
}

/** Saves base64 encoded file to disk safely */
async function saveBase64File(targetDir, rawFileName, base64Data) {
  const safeName = `${Date.now()}-${uuidv4().substring(0, 6)}-${sanitizeFileName(rawFileName)}`;
  const filePath = path.join(targetDir, safeName);
  const buffer = Buffer.from(base64Data, 'base64');
  await fsp.writeFile(filePath, buffer);
  return { safeName, filePath, bufferLength: buffer.length };
}

// ==================== SOCKET.IO CONTROLLERS ====================
io.on('connection', (socket) => {
  console.log(`[SERVER] ✅ New connection: ${socket.id}`);

  /* ----------------- 1. User & Presence Handlers ----------------- */

  socket.on('register', (username, callback) => {
    if (onlineUsers.has(username)) {
      callback({ success: false, error: 'Username already taken' });
      return;
    }

    const user = {
      id: uuidv4(),
      username,
      socketId: socket.id,
      currentRoom: null
    };

    users.set(socket.id, user);
    onlineUsers.set(username, socket.id);

    console.log(`[SERVER] 👤 User registered: ${username} (${socket.id})`);

    callback({ success: true, user: { id: user.id, username: user.username } });

    io.emit('online-users', getOnlineUsersList());
    broadcastRoomList();
  });

  socket.on('get-dm-unread-summary', (callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ unread: {} });
      return;
    }

    const unread = {};
    privateChats.forEach((messages) => {
      messages.forEach((message) => {
        if (message.to === user.username && !message.read) {
          unread[message.from] = (unread[message.from] || 0) + 1;
        }
      });
    });

    callback?.({ unread });
  });

  /* ----------------- 2. Room Management Handlers ----------------- */

  socket.on('create-room', (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ success: false, error: 'Unregistered user' });
      return;
    }

    const roomName = typeof data === 'string' ? data : data?.name;
    if (!roomName || !roomName.trim()) {
      callback?.({ success: false, error: 'Room name is required' });
      return;
    }

    const roomId = 'room-' + uuidv4().substring(0, 8);
    const room = {
      id: roomId,
      name: roomName.trim(),
      type: 'general',
      owner: user.username,
      hidden: Boolean(data?.hidden),
      isPrivate: Boolean(data?.isPrivate),
      allowedUsers: new Set([user.username]),
      blockedUsers: new Set(),
      members: new Set(),
      presence: new Map(),
      messages: [],
      messageCount: 0
    };
    rooms.set(roomId, room);

    console.log(`[SERVER] 🏠 Room created by ${user.username}: ${roomName} (${roomId})`);

    callback({
      success: true,
      room: {
        id: roomId,
        name: room.name,
        type: room.type,
        owner: user.username,
        hidden: room.hidden,
        isPrivate: room.isPrivate,
        allowedUsers: Array.from(room.allowedUsers),
        blockedUsers: Array.from(room.blockedUsers),
        messageCount: 0
      }
    });
    broadcastRoomList();
  });

  socket.on('join-room', (roomId, callback) => {
    const user = users.get(socket.id);
    if (!user) return;

    const room = rooms.get(roomId);
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    const access = canUserAccessRoom(room, user.username);
    if (!access.allowed) {
      callback({ success: false, error: access.reason });
      return;
    }

    // Leave previous room if currently inside one
    if (user.currentRoom && user.currentRoom !== roomId) {
      const prevRoom = rooms.get(user.currentRoom);
      if (prevRoom) {
        setRoomPresence(user.currentRoom, user.username, false);
        socket.leave(user.currentRoom);
        socket.to(user.currentRoom).emit('user-left-room', {
          username: user.username,
          roomId: user.currentRoom,
          active: false,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Join target room
    setRoomPresence(roomId, user.username, true);
    user.currentRoom = roomId;
    socket.join(roomId);

    console.log(`[SERVER] ➡️  ${user.username} joined room: ${room.name}`);

    socket.to(roomId).emit('user-joined-room', {
      username: user.username,
      roomId,
      active: true,
      timestamp: new Date().toISOString()
    });

    const recentMessages = room.messages.slice(-50);
    callback({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        owner: room.owner || 'system',
        hidden: Boolean(room.hidden),
        isPrivate: Boolean(room.isPrivate),
        allowedUsers: Array.from(room.allowedUsers || []),
        blockedUsers: Array.from(room.blockedUsers || []),
        members: getRoomMembers(room),
        messages: recentMessages,
        messageCount: room.messageCount || 0
      },
      playlist: room.type === 'music' ? musicPlaylist : undefined
    });

    broadcastRoomList();
  });

  socket.on('leave-room', (callback) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (room) {
      setRoomPresence(user.currentRoom, user.username, false);
      socket.leave(user.currentRoom);

      console.log(`[SERVER] ⬅️  ${user.username} left room: ${room.name}`);

      socket.to(user.currentRoom).emit('user-left-room', {
        username: user.username,
        roomId: user.currentRoom,
        active: false,
        timestamp: new Date().toISOString()
      });

      broadcastRoomList();
    }

    user.currentRoom = null;
    if (callback) callback({ success: true });
  });

  socket.on('update-room-settings', (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ success: false, error: 'Unregistered user' });
      return;
    }

    const room = rooms.get(data?.roomId);
    if (!room) {
      callback?.({ success: false, error: 'Room not found' });
      return;
    }

    if (room.owner !== user.username) {
      callback?.({ success: false, error: 'Only the room owner can modify room settings' });
      return;
    }

    if (typeof data.hidden === 'boolean') room.hidden = data.hidden;
    if (typeof data.isPrivate === 'boolean') room.isPrivate = data.isPrivate;

    if (Array.isArray(data.allowedUsers)) {
      room.allowedUsers = new Set(data.allowedUsers);
      room.allowedUsers.add(room.owner);
    }

    if (Array.isArray(data.blockedUsers)) {
      room.blockedUsers = new Set(data.blockedUsers.filter(u => u !== room.owner));
    }

    console.log(`[SERVER] ⚙️ Room settings updated for ${room.name} by ${user.username}`);

    // Evict blocked or unallowed active members
    users.forEach((u, sId) => {
      if (u.currentRoom === room.id && u.username !== room.owner) {
        const isBlocked = room.blockedUsers.has(u.username);
        const isNotAllowed = room.isPrivate && !room.allowedUsers.has(u.username);

        if (isBlocked || isNotAllowed) {
          const targetSocket = io.sockets.sockets.get(sId);
          if (targetSocket) {
            setRoomPresence(room.id, u.username, false);
            u.currentRoom = null;
            targetSocket.leave(room.id);
            targetSocket.emit('kicked-from-room', {
              roomId: room.id,
              reason: isBlocked ? 'คุณถูกบล็อกโดยเจ้าของห้อง (Blocked by owner)' : 'สิทธิ์การเข้าห้องถูกยกเลิก (Access revoked)'
            });
            socket.to(room.id).emit('user-left-room', {
              username: u.username,
              roomId: room.id,
              active: false,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    });

    broadcastRoomList();
    callback?.({
      success: true,
      roomSettings: {
        hidden: room.hidden,
        isPrivate: room.isPrivate,
        allowedUsers: Array.from(room.allowedUsers),
        blockedUsers: Array.from(room.blockedUsers)
      }
    });
  });

  socket.on('delete-room', (roomId, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ success: false, error: 'Unregistered user' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      callback?.({ success: false, error: 'Room not found' });
      return;
    }

    if (room.owner !== user.username) {
      callback?.({ success: false, error: 'Only the room owner can delete this room' });
      return;
    }

    if (room.id === 'lobby' || room.id === 'music-room') {
      callback?.({ success: false, error: 'System default rooms cannot be deleted' });
      return;
    }

    console.log(`[SERVER] 🗑️ Room deleted by ${user.username}: ${room.name} (${roomId})`);

    io.to(roomId).emit('room-deleted', {
      roomId,
      roomName: room.name,
      deletedBy: user.username
    });

    users.forEach((u) => {
      if (u.currentRoom === roomId) {
        u.currentRoom = null;
      }
    });

    rooms.delete(roomId);
    broadcastRoomList();
    callback?.({ success: true });
  });

  /* ----------------- 3. Messaging & File Upload Handlers ----------------- */

  socket.on('chat-upload-file', async (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ success: false, error: 'User not registered' });
      return;
    }

    try {
      if (!data?.fileName || !data?.base64) {
        callback?.({ success: false, error: 'Invalid file payload' });
        return;
      }

      const { safeName, bufferLength } = await saveBase64File(chatUploadDir, data.fileName, data.base64);
      const fileUrl = `/uploads/chat/${safeName}`;
      const mimeType = data.mimeType || 'application/octet-stream';

      let mediaType = 'file';
      if (mimeType.startsWith('image/')) mediaType = 'image';
      else if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';

      console.log(`[SERVER] 📎 Chat file uploaded by ${user.username}: ${safeName} (${mediaType}, ${bufferLength} bytes)`);

      callback?.({
        success: true,
        attachment: {
          url: fileUrl,
          fileName: data.fileName,
          mimeType,
          fileSize: bufferLength,
          mediaType
        }
      });
    } catch (error) {
      console.error('[SERVER] Failed to upload chat file:', error);
      callback?.({ success: false, error: 'Failed to save file on server' });
    }
  });

  socket.on('room-message', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    const message = {
      id: uuidv4(),
      roomId: room.id,
      roomName: room.name,
      from: user.username,
      text: data.text || '',
      attachment: data.attachment || null,
      timestamp: new Date().toISOString(),
      type: 'message'
    };

    room.messages.push(message);
    room.messageCount = (room.messageCount || 0) + 1;

    // Keep last 200 messages in memory
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }

    // Broadcast message to eligible online users
    users.forEach((targetUser, targetSocketId) => {
      if (targetSocketId === socket.id) return;

      if (room.isPrivate && room.owner !== targetUser.username && (!room.allowedUsers || !room.allowedUsers.has(targetUser.username))) {
        return;
      }
      if (room.blockedUsers && room.blockedUsers.has(targetUser.username)) {
        return;
      }

      io.to(targetSocketId).emit('room-message', message);
    });

    broadcastRoomList();
  });

  socket.on('private-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: uuidv4(),
      from: user.username,
      to: data.to,
      text: data.text || '',
      attachment: data.attachment || null,
      timestamp: new Date().toISOString(),
      read: false
    };

    const chatKey = getChatKey(user.username, data.to);
    if (!privateChats.has(chatKey)) {
      privateChats.set(chatKey, []);
    }
    privateChats.get(chatKey).push(message);

    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('private-message', message);
    }
  });

  socket.on('message-read', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const senderSocketId = onlineUsers.get(data.from);
    if (senderSocketId) {
      io.to(senderSocketId).emit('message-read', {
        messageId: data.messageId,
        readBy: user.username,
        timestamp: new Date().toISOString()
      });
    }

    const chatKey = getChatKey(user.username, data.from);
    const chat = privateChats.get(chatKey);
    if (chat) {
      const msg = chat.find(m => m.id === data.messageId);
      if (msg) msg.read = true;
    }
  });

  socket.on('get-private-chat', (targetUsername, callback) => {
    const user = users.get(socket.id);
    if (!user) return;

    const chatKey = getChatKey(user.username, targetUsername);
    const messages = privateChats.get(chatKey) || [];
    callback({ messages: messages.slice(-50) });
  });

  /* ----------------- 4. WebRTC Video Call Handlers ----------------- */

  socket.on('join-video-call', (data, callback) => {
    const user = users.get(socket.id);
    if (!user || !data?.roomId) {
      callback?.({ success: false, error: 'User not registered or invalid room' });
      return;
    }

    if (!roomCalls.has(data.roomId)) {
      roomCalls.set(data.roomId, new Map());
    }

    const callMap = roomCalls.get(data.roomId);
    const existingParticipants = Array.from(callMap.keys()).filter(name => name !== user.username);

    callMap.set(user.username, socket.id);
    console.log(`[SERVER] 📹 ${user.username} joined video call in room: ${data.roomId} (total: ${callMap.size})`);

    callMap.forEach((sId, name) => {
      if (name !== user.username) {
        io.to(sId).emit('user-joined-video-call', {
          username: user.username,
          roomId: data.roomId
        });
      }
    });

    callback?.({ success: true, participants: existingParticipants });
  });

  socket.on('leave-video-call', (data) => {
    const user = users.get(socket.id);
    if (!user || !data?.roomId) return;

    const callMap = roomCalls.get(data.roomId);
    if (callMap) {
      callMap.delete(user.username);
      console.log(`[SERVER] 📹 ${user.username} left video call in room: ${data.roomId} (remaining: ${callMap.size})`);

      callMap.forEach((sId) => {
        io.to(sId).emit('user-left-video-call', {
          username: user.username,
          roomId: data.roomId
        });
      });

      if (callMap.size === 0) {
        roomCalls.delete(data.roomId);
      }
    }
  });

  socket.on('call-user', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call-offer', {
        from: user.username,
        offer: data.offer
      });
    }
  });

  socket.on('call-accepted', (data) => {
    const user = users.get(socket.id);
    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-accepted', {
        from: user?.username,
        answer: data.answer
      });
    }
  });

  socket.on('call-rejected', (data) => {
    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-rejected', {
        from: users.get(socket.id)?.username
      });
    }
  });

  socket.on('call-media-state', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (data.to) {
      const targetSocketId = onlineUsers.get(data.to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-media-state', {
          from: user.username,
          audioEnabled: data.audioEnabled,
          videoEnabled: data.videoEnabled
        });
      }
    } else if (data.roomId && roomCalls.has(data.roomId)) {
      roomCalls.get(data.roomId).forEach((sId, name) => {
        if (name !== user.username) {
          io.to(sId).emit('call-media-state', {
            from: user.username,
            audioEnabled: data.audioEnabled,
            videoEnabled: data.videoEnabled
          });
        }
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        from: user.username,
        candidate: data.candidate
      });
    }
  });

  socket.on('end-call', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    if (data.to) {
      const targetSocketId = onlineUsers.get(data.to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-ended', {
          from: user.username
        });
      }
    }

    if (data.roomId && roomCalls.has(data.roomId)) {
      const callMap = roomCalls.get(data.roomId);
      callMap.delete(user.username);
      callMap.forEach((sId) => {
        io.to(sId).emit('user-left-video-call', {
          username: user.username,
          roomId: data.roomId
        });
      });
      if (callMap.size === 0) roomCalls.delete(data.roomId);
    }
  });

  /* ----------------- 5. Music Player & Playlist Handlers ----------------- */

  socket.on('music-sync-request', (roomId) => {
    socket.to(roomId).emit('music-sync-request', { from: socket.id });
  });

  socket.on('music-sync-response', (data) => {
    io.to(data.to).emit('music-sync-data', {
      currentTrack: data.currentTrack,
      currentTime: data.currentTime,
      isPlaying: data.isPlaying
    });
  });

  socket.on('music-control', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    socket.to(user.currentRoom).emit('music-control', {
      action: data.action,
      trackId: data.trackId,
      currentTime: data.currentTime,
      username: user.username
    });
  });

  socket.on('music-upload-track', async (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ success: false, error: 'User not registered' });
      return;
    }

    if (user.currentRoom !== 'music-room') {
      callback?.({ success: false, error: 'You must be in Music Room to upload tracks' });
      return;
    }

    try {
      if (!data?.fileName || !data?.mimeType || !data?.base64) {
        callback?.({ success: false, error: 'Invalid upload payload' });
        return;
      }

      const { safeName } = await saveBase64File(musicUploadDir, data.fileName, data.base64);

      const uploadedTrack = {
        id: Date.now(),
        title: data.title || path.parse(data.fileName).name,
        artist: data.artist || user.username,
        file: `/uploads/music/${safeName}`,
        duration: data.duration || 'Uploaded',
        cover: data.cover || '🎧'
      };

      musicPlaylist = [uploadedTrack, ...musicPlaylist];
      io.emit('music-playlist-updated', { playlist: musicPlaylist, track: uploadedTrack });
      callback?.({ success: true, track: uploadedTrack, playlist: musicPlaylist });
    } catch (error) {
      console.error('[SERVER] Failed to store uploaded track:', error);
      callback?.({ success: false, error: 'Failed to upload track' });
    }
  });

  socket.on('music-add-youtube', (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ success: false, error: 'User not registered' });
      return;
    }

    if (user.currentRoom !== 'music-room') {
      callback?.({ success: false, error: 'You must be in Music Room to add tracks' });
      return;
    }

    try {
      if (!data?.file || !data?.title) {
        callback?.({ success: false, error: 'Invalid YouTube track data' });
        return;
      }

      const youtubeTrack = {
        id: data.id || `youtube-${Date.now()}`,
        title: data.title || 'YouTube Track',
        artist: data.artist || user.username,
        file: data.file,
        type: 'youtube',
        cover: data.cover || '▶️',
        duration: data.duration || 'Live'
      };

      musicPlaylist = [youtubeTrack, ...musicPlaylist];
      console.log(`[SERVER] ▶️ Added YouTube track: ${youtubeTrack.title} by ${youtubeTrack.artist}`);

      io.emit('music-playlist-updated', { playlist: musicPlaylist, track: youtubeTrack });
      callback?.({ success: true, track: youtubeTrack, playlist: musicPlaylist });
    } catch (error) {
      console.error('[SERVER] Failed to add YouTube track:', error);
      callback?.({ success: false, error: 'Failed to add YouTube track' });
    }
  });

  socket.on('fetch-youtube-metadata', async (videoUrl, callback) => {
    try {
      const videoId = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/)?.[1];
      if (!videoId) {
        callback?.({ success: false, error: 'Invalid YouTube URL' });
        return;
      }

      const oembed = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
      if (!oembed.ok) {
        callback?.({ success: true, title: `YouTube - ${videoId.substring(0, 8)}`, duration: 'Unknown' });
        return;
      }

      const data = await oembed.json();
      callback?.({ success: true, title: data.title || 'YouTube Video', duration: 'Check YouTube' });
    } catch (error) {
      console.error('[SERVER] Failed to fetch YouTube metadata:', error);
      callback?.({ success: true, title: 'YouTube Video', duration: 'Unknown' });
    }
  });

  /* ----------------- 6. Disconnect Handler ----------------- */

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`[SERVER] ❌ Disconnected: ${user.username} (${socket.id})`);

      if (user.currentRoom) {
        const room = rooms.get(user.currentRoom);
        if (room) {
          setRoomPresence(user.currentRoom, user.username, false);
          socket.to(user.currentRoom).emit('user-left-room', {
            username: user.username,
            roomId: user.currentRoom,
            active: false,
            timestamp: new Date().toISOString()
          });
        }
      }

      roomCalls.forEach((callMap, roomId) => {
        if (callMap.has(user.username)) {
          callMap.delete(user.username);
          callMap.forEach((sId) => {
            io.to(sId).emit('user-left-video-call', {
              username: user.username,
              roomId
            });
          });
          if (callMap.size === 0) roomCalls.delete(roomId);
        }
      });

      onlineUsers.delete(user.username);
      users.delete(socket.id);

      io.emit('online-users', getOnlineUsersList());
      broadcastRoomList();
    } else {
      console.log(`[SERVER] ❌ Disconnected: ${socket.id} (unregistered)`);
    }
  });
});

// ==================== START SERVER ====================
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  🚀 Chat Server running on port ${PORT}`);
  console.log(`  📡 http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
