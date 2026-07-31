# 📘 รายละเอียดโค้ดโปรเจกต์ ChatVerse (Full Code Documentation)

**โปรเจกต์:** ChatVerse — Real-time Chat, Multi-User Video Call & Music Streaming
**เวอร์ชันปัจจุบัน:** 1.2.0
**ผู้พัฒนา:** Antigravity AI Team & Phalakorn223
**Stack:** Node.js · Express · Socket.IO · Vanilla HTML5 / CSS3 / JavaScript · WebRTC Mesh · YouTube IFrame API

---

## 🗂️ โครงสร้างไฟล์ (File Structure)

```
Chat-Rarp/
├── server.js                  ← Backend หลัก (Node.js + Express + Socket.IO)
├── package.json               ← Dependencies
├── generate-music.js          ← สคริปต์สร้างไฟล์เพลงตัวอย่าง
├── public/
│   ├── index.html             ← โครงสร้าง HTML (Single Page Application)
│   ├── style.css              ← สไตล์ชีตหลัก (~3,900 บรรทัด)
│   ├── app.js                 ← Logic ฝั่ง Client (~2,380 บรรทัด)
│   └── uploads/
│       ├── music/             ← ไฟล์เพลงที่อัปโหลด
│       └── chat/              ← ไฟล์แนบในแชท (รูป วิดีโอ เอกสาร)
```

---

## 🖥️ 1. server.js — Backend หลัก (1,021 บรรทัด)

### 1.1 การตั้งค่าเซิร์ฟเวอร์ (บรรทัด 1–27)

- รันบน Express + HTTP + Socket.IO
- รองรับไฟล์สูงสุด **100MB** ต่อ payload (maxHttpBufferSize: 1e8)
- Serve static files ทั้งหมดจาก /public
- สร้างโฟลเดอร์ uploads อัตโนมัติถ้ายังไม่มี

### 1.2 ข้อมูลใน Memory (บรรทัด 28–80)

| ตัวแปร | ประเภท | ข้อมูลที่เก็บ |
|:---|:---|:---|
| rooms | Map<roomId, RoomObj> | ทุกห้องแชท รวมถึงสมาชิกและข้อความ |
| users | Map<socketId, UserObj> | ผู้ใช้ที่เชื่อมต่ออยู่ขณะนี้ |
| privateChats | Map<chatKey, Message[]> | ประวัติ DM แต่ละคู่ (สูงสุด 50 ข้อความล่าสุด) |
| onlineUsers | Map<username, socketId> | Lookup socketId จาก username |
| roomCalls | Map<roomId, Map<username, socketId>> | ผู้เข้าร่วม Video Call แต่ละห้อง |
| musicPlaylist | Array<TrackObj> | Playlist เพลงกลาง (shared ทุกคน) |

**โครงสร้าง RoomObj:**
- id, name, type ('general' หรือ 'music')
- owner: username ของเจ้าของห้อง
- hidden: ซ่อนจากรายการห้อง
- isPrivate: ต้องได้รับอนุญาตจากเจ้าของก่อนเข้า
- allowedUsers: Set รายชื่อผู้ได้รับอนุญาต
- blockedUsers: Set รายชื่อผู้ถูกบล็อก
- members: Set สมาชิกที่เคยเข้าห้อง (Persistent)
- presence: Map<username, boolean> สถานะ active ปัจจุบัน
- messages: เก็บสูงสุด 200 ข้อความล่าสุด
- messageCount: จำนวนข้อความทั้งหมด

**โครงสร้าง TrackObj (เพลงใน Playlist):**
- id: Unique ID
- title: ชื่อเพลง
- artist: ชื่อศิลปิน
- file: URL เพลง หรือ YouTube URL
- type: 'youtube' หรือ undefined (uploaded file)
- cover: อีโมจิ
- duration: ความยาว เช่น '3:52' หรือ 'Live'

> ⚠️ **หมายเหตุ:** ข้อมูลทั้งหมดอยู่ใน Memory เท่านั้น ถ้า restart server ข้อมูลถูก reset ยกเว้นไฟล์ที่อยู่ใน /public/uploads/

### 1.3 Default Rooms (บรรทัด 82–102)

ระบบสร้างห้องเริ่มต้น 2 ห้องอัตโนมัติเมื่อ Server เริ่มทำงาน:

| roomId | ชื่อ | ประเภท |
|:---|:---|:---|
| lobby | 🏠 Lobby | general |
| music-room | 🎵 Music Room | music |

ทั้งสองห้องนี้ลบไม่ได้ (system rooms)

### 1.4 Helper Functions (บรรทัด 104–211)

| ฟังก์ชัน | หน้าที่ |
|:---|:---|
| ensureRoomDefaults(room) | ตรวจสอบและ init Map/Set ในห้องที่อาจ undefined |
| getChatKey(user1, user2) | สร้าง key ของ DM จาก 2 username เรียงตาม alphabet |
| sanitizeFileName(name) | ล้างตัวอักษรอันตรายในชื่อไฟล์ |
| canUserAccessRoom(room, username) | ตรวจสิทธิ์ว่า user เข้าห้องได้หรือไม่ |
| getRoomListForUser(username) | สร้างรายการห้องที่ user คนนั้นเห็นได้ |
| broadcastRoomList() | ส่งรายการห้องอัปเดตไปทุก client ที่ login อยู่ |
| getRoomMembers(room) | ดึงรายชื่อสมาชิกห้องพร้อมสถานะ active/inactive |
| setRoomPresence(roomId, username, active) | อัปเดตสถานะ active ของ user ในห้อง |
| getOnlineUsersList() | ดึงรายชื่อ user ที่ online อยู่ทั้งหมด |
| saveBase64File(dir, filename, base64) | แปลง base64 และบันทึกไฟล์ลง disk อย่างปลอดภัย |

### 1.5 Socket Event Handlers (บรรทัด 212–1011)

#### หมวด 1: User & Presence
| Event | ทิศทาง | หน้าที่ |
|:---|:---|:---|
| register | Client→Server | ลงทะเบียน username เข้าสู่ระบบ |
| get-dm-unread-summary | Client→Server | ดึงจำนวน DM ที่ยังไม่ได้อ่านทุกคู่ |
| online-users | Server→Client | broadcast รายชื่อ online users |
| room-list | Server→Client | broadcast รายการห้องที่ user เห็นได้ |

#### หมวด 2: Room Management
| Event | ทิศทาง | หน้าที่ |
|:---|:---|:---|
| create-room | Client→Server | สร้างห้องแชทใหม่ |
| join-room | Client→Server | เข้าร่วมห้อง ตรวจสิทธิ์ + ส่งประวัติ 50 ข้อความล่าสุด |
| leave-room | Client→Server | ออกจากห้อง |
| update-room-settings | Client→Server | อัปเดตการตั้งค่าห้อง (เฉพาะ owner) |
| delete-room | Client→Server | ลบห้อง (เฉพาะ owner ห้ามลบ lobby/music-room) |
| user-joined-room | Server→Client | แจ้งสมาชิกในห้องว่ามีคนเข้าใหม่ |
| user-left-room | Server→Client | แจ้งสมาชิกในห้องว่ามีคนออก |
| kicked-from-room | Server→Client | แจ้ง user ที่ถูก kick/block ออก |
| room-deleted | Server→Client | แจ้งสมาชิกทุกคนในห้องที่ถูกลบ |

#### หมวด 3: Messaging & File Upload
| Event | ทิศทาง | หน้าที่ |
|:---|:---|:---|
| chat-upload-file | Client→Server | อัปโหลดไฟล์ base64 ไปบันทึกใน /uploads/chat/ |
| room-message | สองทาง | ส่ง/รับข้อความในห้องแชท (เก็บสูงสุด 200 ข้อความ) |
| private-message | สองทาง | ส่ง/รับ DM ระหว่าง 2 คน |
| message-read | สองทาง | อัปเดตสถานะ "อ่านแล้ว" (Read Receipt) |
| get-private-chat | Client→Server | ดึงประวัติ DM กับอีกคน (50 ข้อความล่าสุด) |

#### หมวด 4: WebRTC Video Call
| Event | ทิศทาง | หน้าที่ |
|:---|:---|:---|
| join-video-call | Client→Server | เข้าร่วม Group Video Call ในห้อง |
| leave-video-call | Client→Server | ออกจาก Video Call |
| call-user | Client→Server | เริ่ม 1-on-1 DM Call ส่ง SDP Offer |
| call-accepted | Client→Server | ตอบรับ Call ส่ง SDP Answer |
| call-rejected | Client→Server | ปฏิเสธ Call |
| ice-candidate | สองทาง | ส่ง ICE Candidate ระหว่าง peers |
| call-media-state | สองทาง | ส่งสถานะ Mic/Camera On-Off |
| end-call | Client→Server | วางสาย |
| incoming-room-video-call | Server→Client | แจ้ง Group Call เข้าในห้อง |
| incoming-call-offer | Server→Client | แจ้ง DM Call เข้า |
| user-joined-video-call | Server→Client | เพิ่ม video tile |
| user-left-video-call | Server→Client | ลบ video tile |
| call-ended | Server→Client | แจ้งว่า Call สิ้นสุดแล้ว |

#### หมวด 5: Music Room
| Event | ทิศทาง | หน้าที่ |
|:---|:---|:---|
| music-sync-request | Client→Server | ขอซิงค์ state เพลงปัจจุบัน |
| music-sync-response | Client→Server | ตอบกลับ state เพลง |
| music-sync-data | Server→Client | ส่ง state เพลงไปยัง client ที่ขอซิงค์ |
| music-control | สองทาง | ส่งคำสั่งควบคุมเพลง play/pause/seek/next/prev |
| music-upload-track | Client→Server | อัปโหลดไฟล์เสียงลง Server |
| music-add-youtube | Client→Server | เพิ่ม YouTube track เข้า Playlist |
| music-remove-track | Client→Server | ลบ track ออกจาก Playlist |
| music-playlist-updated | Server→Client | broadcast Playlist ที่อัปเดตไปทุก client |
| fetch-youtube-metadata | Client→Server | ดึงชื่อวิดีโอจาก YouTube oEmbed API |

---

## 🌐 2. public/index.html — โครงสร้าง HTML (499 บรรทัด)

HTML โครงสร้างแบบ Single Page Application (SPA) — ไม่มีการ reload หน้า

### 2.1 Sidebar ซ้าย
| องค์ประกอบ | ID | หน้าที่ |
|:---|:---|:---|
| ปุ่มพับ Sidebar | collapse-sidebar-btn | Toggle .sidebar.collapsed |
| Avatar + Username | my-avatar, my-username | แสดง user ที่ login |
| รายการห้อง | room-list | render โดย renderRoomList() |
| รายการ Online Users | online-users | render โดย renderOnlineUsers() |
| ปุ่ม Logout | logout-btn | ตัดการเชื่อมต่อ |

### 2.2 Main Content Panels
| Panel | ID | แสดงเมื่อไหร่ |
|:---|:---|:---|
| Welcome | welcome-panel | ยังไม่ได้เลือกห้อง |
| Chat Room | chat-panel | เข้าห้องแชท |
| Music Room | music-panel | เข้าห้องเพลง |

### 2.3 Music Room Layout
- **Now Playing:** Album Art (วนหมุนตอนเล่น) + ชื่อเพลง + Progress Bar + ปุ่มควบคุม + Volume Slider
- **Hidden YouTube Player:** youtube-player-container (Audio Only ซ่อน UI)
- **Playlist:** playlist-items + YouTube URL Input Wrapper
- **Room Chat:** กล่องแชทย่อยในห้องเพลง

### 2.4 Modals & Overlays
| Modal | ID | หน้าที่ |
|:---|:---|:---|
| Video Call Overlay | video-overlay | แสดงวิดีโอทุก participant |
| Incoming Call Modal | incoming-call-modal | แจ้งเตือนสายเข้า |
| Create Room Modal | create-room-modal | กรอกชื่อห้องใหม่ |
| Image Lightbox | image-lightbox-modal | ดูรูปขนาดเต็ม |
| Room Settings Modal | room-settings-modal | ตั้งค่าห้อง Hidden/Private/Access |

---

## ⚙️ 3. public/app.js — Client Logic (~2,380 บรรทัด)

### 3.1 ตัวแปร Global สำคัญ (บรรทัด 1–135)

| ตัวแปร | ประเภท | หน้าที่ |
|:---|:---|:---|
| currentUser | Object | ข้อมูล user ที่ login อยู่ |
| currentChat | Object | ห้อง/DM ที่เปิดอยู่ตอนนี้ |
| playlist | Array | Playlist เพลงจาก Server |
| currentTrackIndex | number | ดัชนีเพลงที่กำลังเล่น (-1 = ยังไม่ได้เล่น) |
| isYouTubeMode | boolean | กำลังเล่น YouTube หรือ Upload file |
| ytPlayer | Object | YouTube IFrame Player object |
| pendingChatFiles | Array | ไฟล์แนบรอส่งในแชทห้อง |
| pendingMusicFiles | Array | ไฟล์แนบรอส่งในห้องเพลง |
| unreadDmCounts | Map | จำนวน DM ที่ยังไม่ได้อ่านแยกตาม username |

### 3.2 ฟังก์ชันหลักฝั่ง Client

#### Authentication & UI
| ฟังก์ชัน | หน้าที่ |
|:---|:---|
| loginBtn.click | ลงทะเบียน username กับ Server ผ่าน socket.emit('register') |
| showPanel(panel) | แสดง panel ที่ต้องการ ซ่อนทุก panel อื่น |
| showToast(msg, type) | แสดง Toast notification (success/error/info/warning) |
| escapeHtml(text) | ป้องกัน XSS ด้วยการแปลงอักขระพิเศษ HTML |
| formatTime(iso) | แปลง ISO timestamp เป็น HH:MM |
| formatDateTime(iso) | แปลง ISO timestamp เป็น DD/MM/YYYY HH:MM |

#### Room & Chat
| ฟังก์ชัน | หน้าที่ |
|:---|:---|
| joinRoom(roomId) | เข้าห้อง + render ข้อความและ playlist |
| leaveRoom() | ออกจากห้อง + กลับ Welcome Panel |
| closeChat() | reset currentChat + stop music/video |
| renderRoomList(rooms) | render รายการห้องใน Sidebar |
| renderOnlineUsers(users) | render รายชื่อ Online Users |
| appendMessageUI(msg) | เพิ่มกล่องข้อความใหม่ใน Chat Room |
| appendMusicChatMessage(msg) | เพิ่มกล่องข้อความใหม่ใน Music Chat |
| renderAttachmentHTML(attachment) | สร้าง HTML สำหรับไฟล์แนบ (รูป/วิดีโอ/เสียง/ไฟล์) |
| uploadAndSend(text, files, target) | อัปโหลดไฟล์แนบ แล้วส่งข้อความ |
| updateMembersList(members) | อัปเดต Members Sidebar |

#### Music Player
| ฟังก์ชัน | หน้าที่ |
|:---|:---|
| renderPlaylist() | render รายการเพลงทั้งหมดใน #playlist-items |
| loadTrack(index, startSeconds) | โหลดเพลงที่ index (ทั้ง Upload และ YouTube) |
| playCurrentTrack() | เล่นเพลงปัจจุบัน |
| pauseCurrentTrack() | หยุดเพลงชั่วคราว |
| setPlayingUI(isPlaying) | อัปเดต UI ปุ่ม Play/Pause + vinyl spin animation |
| loadYouTubeTrack(videoId, startTime) | โหลดและเล่น YouTube ผ่าน iFrame API |
| stopYouTubePlayer() | หยุด YouTube Player |
| removeTrack(trackId) | ลบเพลงออกจาก Playlist (ส่ง music-remove-track ไป Server) |
| extractYouTubeId(url) | แยก Video ID ออกจาก YouTube URL |

#### Video Call (WebRTC)
| ฟังก์ชัน | หน้าที่ |
|:---|:---|
| startOrJoinRoomCall(roomId, roomName) | เริ่มหรือเข้าร่วม Group Call ในห้อง |
| startDirectCall(targetUsername) | เริ่ม DM Call 1-on-1 |
| createPeerConnection(targetUsername) | สร้าง RTCPeerConnection สำหรับ 1 peer |
| addVideoTile(stream, username, isLocal) | เพิ่มกล่องวิดีโอของ participant |
| removeVideoTile(username) | ลบกล่องวิดีโอของ participant |
| endCall() | วางสายและ cleanup ทุก peer connection |
| minimizeCall() / maximizeCall() | ย่อ/ขยายหน้าต่าง Video Call |
| playRingtone() / stopRingtone() | เล่น/หยุดเสียงเรียกเข้า |

### 3.3 ระบบ Emoji & GIF Picker

**Emoji Picker:**
- มี 5 หมวด: smileys, gestures, hearts, objects, animals
- กดอีโมจิ → แทรกลงใน input ที่กำลัง active อยู่ (activeInputTarget)
- รองรับทั้ง Chat Room input และ Music Room Chat input

**GIF Picker:**
- ข้อมูล GIF embed ไว้ใน app.js โดยตรง (offline ไม่ต้องเรียก API)
- ค้นหาด้วย keyword หรือเลือก Category (Trending / Happy / Dance / LOL / Love / Fire)
- กด GIF → ส่งเป็น attachment ประเภท image ทันที (render ฝั่งผู้ส่งทันที)

---

## 🎨 4. public/style.css — สไตล์ชีต (~3,936 บรรทัด)

### 4.1 CSS Variables (บรรทัด 1–28)
ธีมสี Dark Mode หลัก:
- --bg-primary: #0a0a1a (พื้นหลังหลัก)
- --bg-secondary: #111128 (พื้นหลัง Sidebar)
- --accent-primary: #6c5ce7 (สีม่วง Accent)
- --accent-gradient: linear-gradient(135deg, #6c5ce7, #a855f7)
- --text-primary: #e8e8f0
- --text-secondary: #8888aa
- --border: rgba(255,255,255,0.08)

### 4.2 Layout Overview
```
.app-layout
├── .sidebar (260px ปกติ / 64px เมื่อ collapsed)
│   ├── .sidebar-header (ชื่อแอป + avatar + ปุ่มพับ)
│   ├── .room-list (รายการห้อง)
│   └── .user-list (รายชื่อ online users)
└── .main-content (flex:1)
    ├── #welcome-panel
    ├── #chat-panel
    │   ├── .chat-header
    │   ├── .members-sidebar (Drawer ด้านขวา slide-in)
    │   └── #chat-messages
    └── #music-panel
        └── .music-layout
            ├── .now-playing
            ├── .playlist
            └── .music-chat
```

### 4.3 Floating & Overlay Elements
- **Video Overlay** (#video-overlay): Fullscreen + Minimized PIP state (Draggable header)
- **DM Panel** (#dm-panel): Slide-in จากขวา (right: -450px → right: 0)
- **Members Sidebar** (#members-sidebar): Slide-in จากขวาในห้องแชท (right: -300px → right: 0)
- **Toast Container** (#toast-container): Fixed มุมล่างขวา
- **Picker Popovers**: #emoji-picker-popover และ #gif-picker-popover (แสดงเหนือ Input)

### 4.4 Message Bubble
- .ms-msg-bubble: display: block; width: fit-content; max-width: 100%; height: auto;
- .msg-text: display: inline; ป้องกัน block-level height stretch
- .message.sent: margin-left: auto; justify-content: flex-end (ชิดขวา)
- .message.received: ชิดซ้าย + มี Avatar
- .msg-meta: แสดงเวลาส่งข้อความใต้ bubble

---

## ⚠️ 5. ปัญหาและข้อจำกัดที่ทราบ (Known Issues)

### 5.1 WebRTC NAT Traversal
- ใช้ Google STUN เท่านั้น ถ้าเน็ตเวิร์กบล็อก UDP หรือ Symmetric NAT จะ connect ไม่ได้
- แนวทางแก้ไข: เพิ่ม TURN Server (Coturn)

### 5.2 Mesh WebRTC Scaling
- Full Mesh สร้าง peer connection N*(N-1) คู่ เหมาะสำหรับ 2–8 คน
- ถ้าต้องการรองรับมากกว่า ควรเปลี่ยนเป็น SFU (Mediasoup, Janus)

### 5.3 Browser Autoplay Policy
- เบราว์เซอร์บล็อกเสียงอัตโนมัติจนกว่า user จะ interact กับหน้าเว็บก่อน
- ระบบมี Toast แจ้งเตือนให้ user คลิก

### 5.4 YouTube Playback Restrictions
- บางวิดีโอ YouTube ปิด embedding หรือจำกัดประเทศ → เล่นไม่ได้
- แนะนำใช้วิดีโอที่อนุญาต embed หรืออัปโหลดไฟล์เสียงตรงแทน

### 5.5 ข้อมูลไม่ Persistent (No Database)
- ทุกข้อมูลอยู่ใน Memory เมื่อ restart server ทุกอย่างถูก reset
- เพลงที่อัปโหลดยังอยู่ใน /uploads/ แต่ Playlist จะ reset เป็น Default 5 เพลง
- แนวทางแก้ไข: เพิ่ม Database (MongoDB / SQLite)

### 5.6 การแก้ไข CSS Syntax Error ที่ผ่านมา
- เคยมีวงเล็บปีกกาปิดส่วนเกิน (}) ค้างอยู่หลัง .dm-panel.active (บรรทัด 1075)
- ทำให้ CSS rules ที่อยู่ด้านล่างทั้งหมดไม่มีผล แก้ไขแล้ว

---

## 📝 6. Changelog

| เวอร์ชัน | การเปลี่ยนแปลงหลัก |
|:---|:---|
| 1.0.0 | Initial: Login, Group Chat, Online Users |
| 1.1.0 | DM, File Upload, WebRTC Mesh Video Call, Music Room, YouTube Integration, Emoji/GIF, Ringtone |
| 1.2.0 | Default Playlist 5 เพลง, ปุ่มลบเพลง, แสดงเวลาส่งข้อความ, Collapsible Sidebar, Members Sidebar, แก้ UI กล่องข้อความ, สถานะ X active, แก้ CSS Syntax Error |

---

*อัปเดตล่าสุด: 2026-07-31*
