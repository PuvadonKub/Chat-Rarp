const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8
});

const PORT = process.env.PORT || 3000;
const musicUploadDir = path.join(__dirname, 'public', 'music', 'uploads');
const chatUploadDir = path.join(__dirname, 'public', 'uploads', 'chat');

fs.mkdirSync(musicUploadDir, { recursive: true });
fs.mkdirSync(chatUploadDir, { recursive: true });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATA STORE ====================
const rooms = new Map();       // roomId -> { id, name, type, members: Set, messages: [] }
const users = new Map();       // socketId -> { id, username, socketId, currentRoom }
const privateChats = new Map(); // chatKey -> [{ from, to, text, timestamp, read }]
const onlineUsers = new Map(); // username -> socketId
const roomCalls = new Map();   // roomId -> Map<username, socketId>
let musicPlaylist = []; // Start empty - only YouTube tracks supported

// Create default rooms
function createDefaultRooms() {
  const lobby = {
    id: 'lobby',
    name: '🏠 Lobby',
    type: 'general',
    owner: 'system',
    hidden: false,
    isPrivate: false,
    allowedUsers: new Set(),
    blockedUsers: new Set(),
    members: new Set(),
    presence: new Map(),
    messages: [],
    messageCount: 0
  };
  const musicRoom = {
    id: 'music-room',
    name: '🎵 Music Room',
    type: 'music',
    owner: 'system',
    hidden: false,
    isPrivate: false,
    allowedUsers: new Set(),
    blockedUsers: new Set(),
    members: new Set(),
    presence: new Map(),
    messages: [],
    messageCount: 0
  };
  rooms.set('lobby', lobby);
  rooms.set('music-room', musicRoom);
}
createDefaultRooms();

// Helper: get private chat key
function getChatKey(user1, user2) {
  return [user1, user2].sort().join('::');
}

// Helper: get room list filtered for a specific user
function getRoomListForUser(username) {
  const list = [];
  rooms.forEach((room) => {
    if (!room.presence) room.presence = new Map();
    if (!room.members) room.members = new Set();
    if (!room.allowedUsers) room.allowedUsers = new Set();
    if (!room.blockedUsers) room.blockedUsers = new Set();

    // Hidden room filter: visible only to owner and allowed users
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

function broadcastRoomList() {
  users.forEach((user, socketId) => {
    const s = io.sockets.sockets.get(socketId);
    if (s) {
      s.emit('room-list', getRoomListForUser(user.username));
    }
  });
}

function getRoomMembers(room) {
  if (!room.presence) room.presence = new Map();
  if (!room.members) room.members = new Set();
  return Array.from(room.members).map((username) => ({
    username,
    active: room.presence.get(username) === true
  }));
}

function setRoomPresence(roomId, username, active) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (!room.presence) room.presence = new Map();
  if (!room.members) room.members = new Set();
  room.members.add(username);
  room.presence.set(username, active);
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Helper: get online users list
function getOnlineUsersList() {
  const list = [];
  users.forEach((user) => {
    list.push({ id: user.id, username: user.username });
  });
  return list;
}

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`[SERVER] ✅ New connection: ${socket.id}`);

  // --- User Registration ---
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

    // Broadcast updated users/rooms
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

  // --- Create Room ---
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
        name: roomName,
        type: 'general',
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

  // --- Join Room ---
  socket.on('join-room', (roomId, callback) => {
    const user = users.get(socket.id);
    if (!user) return;

    const room = rooms.get(roomId);
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }

    // Access control: blocked check
    if (room.blockedUsers && room.blockedUsers.has(user.username)) {
      callback({ success: false, error: 'คุณถูกบล็อกไม่ให้เข้าห้องนี้ (You are blocked from this room)' });
      return;
    }

    // Access control: private room check
    if (room.isPrivate && room.owner !== user.username && (!room.allowedUsers || !room.allowedUsers.has(user.username))) {
      callback({ success: false, error: 'ห้องนี้เป็นห้องส่วนตัว เฉพาะผู้ได้รับอนุญาตเท่านั้น (Private room - Access denied)' });
      return;
    }

    // Leave previous room
    if (user.currentRoom && user.currentRoom !== roomId) {
      const prevRoom = rooms.get(user.currentRoom);
      if (prevRoom) {
        setRoomPresence(user.currentRoom, user.username, false);
        socket.leave(user.currentRoom);
        // Notify room members that user left
        socket.to(user.currentRoom).emit('user-left-room', {
          username: user.username,
          roomId: user.currentRoom,
          active: false,
          timestamp: new Date().toISOString()
        });
        broadcastRoomList();
      }
    }

    // Join new room
    setRoomPresence(roomId, user.username, true);
    user.currentRoom = roomId;
    socket.join(roomId);

    console.log(`[SERVER] ➡️  ${user.username} joined room: ${room.name}`);

    // Notify room members
    socket.to(roomId).emit('user-joined-room', {
      username: user.username,
      roomId,
      active: true,
      timestamp: new Date().toISOString()
    });

    // Send room data to user
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

  // --- Leave Room ---
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

  // --- Update Room Settings (Owner Only) ---
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

    // Kick users who are blocked or no longer allowed
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

  // --- Delete Room (Owner Only) ---
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

    // Notify occupants
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

  // --- Chat File Upload ---
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

      const safeName = `${Date.now()}-${uuidv4().substring(0, 6)}-${sanitizeFileName(data.fileName)}`;
      const filePath = path.join(chatUploadDir, safeName);
      const buffer = Buffer.from(data.base64, 'base64');
      await fsp.writeFile(filePath, buffer);

      const fileUrl = `/uploads/chat/${safeName}`;
      const mimeType = data.mimeType || 'application/octet-stream';
      const fileSize = buffer.length;

      let mediaType = 'file';
      if (mimeType.startsWith('image/')) mediaType = 'image';
      else if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';

      console.log(`[SERVER] 📎 Chat file uploaded by ${user.username}: ${safeName} (${mediaType}, ${fileSize} bytes)`);

      callback?.({
        success: true,
        attachment: {
          url: fileUrl,
          fileName: data.fileName,
          mimeType,
          fileSize,
          mediaType
        }
      });
    } catch (error) {
      console.error('[SERVER] Failed to upload chat file:', error);
      callback?.({ success: false, error: 'Failed to save file on server' });
    }
  });

  // --- Room Message (Group Chat) ---
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

    // Keep only last 200 messages
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }

    // Broadcast message to allowed online users (excluding sender)
    users.forEach((targetUser, targetSocketId) => {
      if (targetSocketId === socket.id) return;

      if (room.isPrivate) {
        if (room.owner !== targetUser.username && (!room.allowedUsers || !room.allowedUsers.has(targetUser.username))) {
          return;
        }
      }
      if (room.blockedUsers && room.blockedUsers.has(targetUser.username)) {
        return;
      }

      io.to(targetSocketId).emit('room-message', message);
    });
  });

  // --- Private Message (1-on-1) ---
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

    // Store message
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

  // --- Read Receipt ---
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

    // Update stored message
    const chatKey = getChatKey(user.username, data.from);
    const chat = privateChats.get(chatKey);
    if (chat) {
      const msg = chat.find(m => m.id === data.messageId);
      if (msg) msg.read = true;
    }
  });

  // --- Get Private Chat History ---
  socket.on('get-private-chat', (targetUsername, callback) => {
    const user = users.get(socket.id);
    if (!user) return;

    const chatKey = getChatKey(user.username, targetUsername);
    const messages = privateChats.get(chatKey) || [];
    callback({ messages: messages.slice(-50) });
  });

  // --- Multi-User Video Call Signaling ---
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

    // Notify existing participants that a new user joined
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

  // --- Music Room ---
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

    // Broadcast music control to all in room except sender
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

      const safeName = `${Date.now()}-${sanitizeFileName(data.fileName)}`;
      const filePath = path.join(musicUploadDir, safeName);
      const buffer = Buffer.from(data.base64, 'base64');
      await fsp.writeFile(filePath, buffer);

      const uploadedTrack = {
        id: Date.now(),
        title: data.title || path.parse(data.fileName).name,
        artist: data.artist || user.username,
        file: `/music/uploads/${safeName}`,
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

  // Add YouTube track to playlist (no file storage needed)
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

  // Fetch YouTube metadata (title, duration)
  socket.on('fetch-youtube-metadata', async (videoUrl, callback) => {
    try {
      const videoId = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/)?.[1];
      if (!videoId) {
        callback?.({ success: false, error: 'Invalid YouTube URL' });
        return;
      }

      // Try to fetch from YouTube oEmbed API
      const oembed = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`);
      if (!oembed.ok) {
        // Fallback: return empty metadata
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

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`[SERVER] ❌ Disconnected: ${user.username} (${socket.id})`);

      // Remove from current room
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

      // Clean up room video calls
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
