const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ==================== DATA STORE ====================
const rooms = new Map();       // roomId -> { id, name, type, members: Set, messages: [] }
const users = new Map();       // socketId -> { id, username, socketId, currentRoom }
const privateChats = new Map(); // chatKey -> [{ from, to, text, timestamp, read }]
const onlineUsers = new Map(); // username -> socketId

// Create default rooms
function createDefaultRooms() {
  const lobby = {
    id: 'lobby',
    name: '🏠 Lobby',
    type: 'general',
    members: new Set(),
    messages: []
  };
  const musicRoom = {
    id: 'music-room',
    name: '🎵 Music Room',
    type: 'music',
    members: new Set(),
    messages: []
  };
  rooms.set('lobby', lobby);
  rooms.set('music-room', musicRoom);
}
createDefaultRooms();

// Music playlist
const musicPlaylist = [
  { id: 1, title: 'Chill Vibes', artist: 'Ambient Sounds', file: '/music/song1.mp3', duration: '3:24', cover: '🎶' },
  { id: 2, title: 'Summer Breeze', artist: 'Lo-Fi Beats', file: '/music/song2.mp3', duration: '2:58', cover: '🌅' },
  { id: 3, title: 'Night Drive', artist: 'Synthwave', file: '/music/song3.mp3', duration: '4:12', cover: '🌃' },
  { id: 4, title: 'Coffee Morning', artist: 'Jazz Hop', file: '/music/song4.mp3', duration: '3:45', cover: '☕' },
  { id: 5, title: 'Ocean Waves', artist: 'Nature Sounds', file: '/music/song5.mp3', duration: '5:01', cover: '🌊' }
];

// Helper: get private chat key
function getChatKey(user1, user2) {
  return [user1, user2].sort().join('::');
}

// Helper: get room list for clients
function getRoomList() {
  const list = [];
  rooms.forEach((room) => {
    list.push({
      id: room.id,
      name: room.name,
      type: room.type,
      memberCount: room.members.size
    });
  });
  return list;
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
    io.emit('room-list', getRoomList());
  });

  // --- Create Room ---
  socket.on('create-room', (roomName, callback) => {
    const roomId = 'room-' + uuidv4().substring(0, 8);
    const room = {
      id: roomId,
      name: roomName,
      type: 'general',
      members: new Set(),
      messages: []
    };
    rooms.set(roomId, room);

    console.log(`[SERVER] 🏠 Room created: ${roomName} (${roomId})`);

    callback({ success: true, room: { id: roomId, name: roomName, type: 'general' } });
    io.emit('room-list', getRoomList());
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

    // Leave previous room
    if (user.currentRoom && user.currentRoom !== roomId) {
      const prevRoom = rooms.get(user.currentRoom);
      if (prevRoom) {
        prevRoom.members.delete(user.username);
        socket.leave(user.currentRoom);
        // Notify room members that user left
        socket.to(user.currentRoom).emit('user-left-room', {
          username: user.username,
          roomId: user.currentRoom,
          timestamp: new Date().toISOString()
        });
        io.emit('room-list', getRoomList());
      }
    }

    // Join new room
    room.members.add(user.username);
    user.currentRoom = roomId;
    socket.join(roomId);

    console.log(`[SERVER] ➡️  ${user.username} joined room: ${room.name}`);

    // Notify room members
    socket.to(roomId).emit('user-joined-room', {
      username: user.username,
      roomId,
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
        members: Array.from(room.members),
        messages: recentMessages
      },
      playlist: room.type === 'music' ? musicPlaylist : undefined
    });

    io.emit('room-list', getRoomList());
  });

  // --- Leave Room ---
  socket.on('leave-room', (callback) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (room) {
      room.members.delete(user.username);
      socket.leave(user.currentRoom);

      console.log(`[SERVER] ⬅️  ${user.username} left room: ${room.name}`);

      socket.to(user.currentRoom).emit('user-left-room', {
        username: user.username,
        roomId: user.currentRoom,
        timestamp: new Date().toISOString()
      });

      io.emit('room-list', getRoomList());
    }

    user.currentRoom = null;
    if (callback) callback({ success: true });
  });

  // --- Room Message (Group Chat) ---
  // Server does NOT echo back to sender (requirement #7)
  socket.on('room-message', (data) => {
    const user = users.get(socket.id);
    if (!user || !user.currentRoom) return;

    const room = rooms.get(user.currentRoom);
    if (!room) return;

    const message = {
      id: uuidv4(),
      from: user.username,
      text: data.text,
      timestamp: new Date().toISOString(),
      type: 'message'
    };

    room.messages.push(message);

    // Keep only last 200 messages
    if (room.messages.length > 200) {
      room.messages = room.messages.slice(-200);
    }

    // Broadcast to room EXCEPT sender (requirement #7)
    socket.to(user.currentRoom).emit('room-message', message);
  });

  // --- Private Message (1-on-1) ---
  socket.on('private-message', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const targetSocketId = onlineUsers.get(data.to);
    if (!targetSocketId) return;

    const message = {
      id: uuidv4(),
      from: user.username,
      to: data.to,
      text: data.text,
      timestamp: new Date().toISOString(),
      read: false
    };

    // Store message
    const chatKey = getChatKey(user.username, data.to);
    if (!privateChats.has(chatKey)) {
      privateChats.set(chatKey, []);
    }
    privateChats.get(chatKey).push(message);

    // Send to target user only
    io.to(targetSocketId).emit('private-message', message);
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

  // --- Video Call Signaling ---
  socket.on('call-user', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming-call', {
        from: user.username,
        offer: data.offer
      });
    }
  });

  socket.on('call-accepted', (data) => {
    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-accepted', {
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

  socket.on('ice-candidate', (data) => {
    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', {
        candidate: data.candidate
      });
    }
  });

  socket.on('end-call', (data) => {
    const targetSocketId = onlineUsers.get(data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended', {
        from: users.get(socket.id)?.username
      });
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

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`[SERVER] ❌ Disconnected: ${user.username} (${socket.id})`);

      // Remove from current room
      if (user.currentRoom) {
        const room = rooms.get(user.currentRoom);
        if (room) {
          room.members.delete(user.username);
          socket.to(user.currentRoom).emit('user-left-room', {
            username: user.username,
            roomId: user.currentRoom,
            timestamp: new Date().toISOString()
          });
        }
      }

      onlineUsers.delete(user.username);
      users.delete(socket.id);

      io.emit('online-users', getOnlineUsersList());
      io.emit('room-list', getRoomList());
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
