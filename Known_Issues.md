# 📘 รายละเอียดโปรเจกต์ และข้อจำกัดทางเทคนิค (Project Overview & Known Issues)
**โปรเจกต์:** ChatVerse — Real-time Chat, Multi-User Video Call & Music Streaming
**เวอร์ชันปัจจุบัน:** 1.1.0  
**ผู้พัฒนา:** Antigravity AI Team & Phalakorn223

---

## 🌐 1. ภาพรวมและฟีเจอร์หลักของเว็บ (Web Application Overview)

**ChatVerse** เป็นเว็บแอปพลิเคชันสื่อสารแบบ Real-time ที่รวมระบบแชท วิดีโอคอลแบบกลุ่ม การส่งสื่อ และห้องฟังเพลงร่วมกันไว้ในระบบเดียว พัฒนาด้วย Node.js, Express, Socket.io, Vanilla HTML5/CSS3 และ WebRTC Mesh Architecture

### ฟีเจอร์หลักของระบบ:
1. **ระบบยืนยันตัวตนและสถานะผู้ใช้ (Authentication & Online Presence):**
   - ล็อกอินด้วย Username โดยไม่ต้องผ่านรหัสผ่าน
   - แสดงรายการผู้ใช้งานออนไลน์ (Online Users List) แบบ Real-time
   - บันทึกสถานะสมาชิกในห้องแบบ Persistent (`active / inactive`) เมื่อผู้ใช้เข้า/ออกจากห้อง

2. **ระบบแชทกลุ่ม แชทส่วนตัว และส่งสื่อ (Group Chat, Direct Message & Media Sharing):**
   - ห้องแชทส่วนกลาง (Lobby) และสามารถสร้างห้องแชทใหม่ได้ตามต้องการ
   - ตัวนับจำนวนข้อความ (Message Count) แสดงผลข้างชื่อห้องแชท
   - ระบบส่งข้อความส่วนตัว (DM 1-on-1) พร้อม Unread Notification Counter Badges
   - ระบบส่งรูปภาพและวิดีโอในแชท (Media Attachments & Preview)
   - ระบบสถานะเปิดอ่านข้อความ (Read Receipts - ติ๊กอ่านแล้ว) และระบบแจ้งเตือนแบบ Toast

3. **ระบบวิดีโอคอลหลายคนพร้อมกัน (Multi-User WebRTC Group Video Call):**
   - รองรับ Group Video Call หลายคนพร้อมกันในห้องแชท ด้วยสถาปัตยกรรม Mesh WebRTC
   - แสดงผลวิดีโอแบบ **Dynamic Video Grid** ปรับขนาดตามจำนวนผู้เข้าร่วมอัตโนมัติ
   - แสดงสถานะควบคุมสื่อ (`Mic Muted` / `Camera Off`) บนวิดีโอของสมาชิกแต่ละคน พร้อม Avatar สำรองเมื่อปิดกล้อง

4. **ระบบย่อหน้าต่างวิดีโอคอลลอย (Minimizable Floating PIP Window):**
   - ปุ่มย่อหน้าต่างวิดีโอคอลเป็น **Floating Picture-in-Picture Widget** มุมขวาล่าง
   - รองรับการลากย้ายตำแหน่งหน้าต่าง (Draggable Header Bar) บนหน้าจอ
   - ช่วยให้ผู้ใช้สามารถพิมพ์แชท สลับห้อง หรือใช้งานฟังก์ชันอื่นๆ ได้โดยไม่หลุดจากการคอล

5. **ระบบห้องสตรีมมิ่งเพลง (Music Room & YouTube Integration):**
   - ซิงค์เพลงและสถานะการเล่น (Play / Pause / Seek / Progress Bar) ให้ทุกคนฟังพร้อมกัน
   - อัปโหลดไฟล์เสียง (Audio Uploads) บันทึกลง Server เพื่อเล่นในห้องเพลง
   - ดึงข้อมูลเพลงและเล่นวิดีโอจาก **YouTube** ผ่าน YouTube iFrame API & oEmbed Metadata

---

## 🛠️ 2. สรุปประวัติการแก้ไขฟีเจอร์และบั๊ก (Resolved Features & Bug Fixes Log)

| หมวดหมู่ | ฟีเจอร์/บั๊กที่ดำเนินการ | สถานะ | สิ่งที่เพิ่ม/แก้ไข |
| :--- | :--- | :---: | :--- |
| **แชทส่วนตัว** | Direct Message & Unread Badges | ✅ แก้แล้ว | เพิ่ม Unread badge, Toast แจ้งเตือน และประวัติ DM ย้อนหลังฝั่ง Server |
| **ห้องเพลง** | Audio Upload & Streaming | ✅ แก้แล้ว | เพิ่มปุ่ม Upload Audio, บันทึกลง Server และ Broadcast Playlist ทั้งระบบ |
| **สมาชิกห้อง** | Persistent Room Presence | ✅ แก้แล้ว | เก็บรายชื่อสมาชิกห้องแบบ persistent แสดงสถานะ active/inactive |
| **สถานะวิดีโอคอล** | Mic/Cam Mute Indicators | ✅ แก้แล้ว | เพิ่ม Socket Event ส่งสถานะ Mute/Unmute และ Badge บนวิดีโอของคู่สนทนา |
| **วิดีโอคอลหลายคน** | Group Call & Floating PIP | ✅ แก้แล้ว | เปลี่ยนเป็น Mesh WebRTC รองรับคอลหลายคนพร้อมกันใน Video Grid + ปุ่มย่อหน้าต่างลอย |
| **ส่งสื่อในแชท** | Image & Video Sharing | ✅ แก้แล้ว | รองรับการอัปโหลดและส่งรูปภาพ/วิดีโอในห้องแชท พร้อมพรีวิวสื่อ |
| **ห้องแชท** | Room Message Counter | ✅ แก้แล้ว | แสดงตัวนับจำนวนข้อความที่ส่งในแต่ละห้องแชทแบบ Real-time |
| **แก้ไขบั๊ก CSS** | Syntax Error (`at-rule or selector expected`) | ✅ แก้แล้ว | ลบเศษโค้ด `right: 4px; }`, วงเล็บปีกกาปิดส่วนเกิน และ Selector ซ้ำซ้อนใน `public/style.css` (L1728-1786) |
| **โครงสร้างโค้ด** | Code Refactor & Optimization | ✅ เสร็จแล้ว | Refactor โค้ดฝั่ง Server (`server.js`) จัดกลุ่ม Helper & Socket Event Controllers ปรับปรุงความเสถียรและความสะอาดของโค้ด |

---

## ⚠️ 3. ปัญหาและข้อจำกัดทางเทคนิคที่พบ (Known Issues & Technical Caveats)

แม้อยู่ในสถานะทำงานได้ครบถ้วน แต่างมีข้อจำกัดทางเทคนิคตามสภาพแวดล้อมการใช้งาน ดังนี้:

### 1. การเชื่อมต่อ WebRTC ข้ามเครือข่ายภายนอก (NAT Traversal & TURN Server)
* **ข้อจำกัด:** ปัจจุบันระบบใช้ **Google Public STUN Server** (`stun:stun.l.google.com:19302`) สำหรับการจับคู่ IP Address ระหว่างเครื่องผู้ใช้
* **ผลกระทบ:** หากใช้งานข้ามเครือข่ายที่มีการบล็อก UDP Strict Firewall หรือ Symmetric NAT (เช่น เครือข่ายองค์กร/มหาวิทยาลัย) สัญญาณ WebRTC อาจไม่สามารถส่งข้อมูลภาพ/เสียงหากันได้
* **แนวทางแก้ไขอนาคต:** ติดตั้งและเปิดใช้งาน **TURN Server** (เช่น Coturn) เพิ่มเติมใน `rtcConfig` เพื่อรีเลย์ข้อมูลเมื่อไม่สามารถเชื่อมต่อแบบ P2P ได้โดยตรง

### 2. ข้อจำกัดจำนวนผู้ร่วมคอลใน Mesh WebRTC (Mesh Scaling Limitation)
* **ข้อจำกัด:** ระบบใช้สถาปัตยกรรม **Full Mesh WebRTC** ซึ่งผู้เข้าร่วมทุกคนต้องสร้าง peer connection แยกไปยังผู้ใช้คนอื่นทุกคน (ปริมาณภาระการเชื่อมต่อ = `N * (N-1)`)
* **ผลกระทบ:** เหมาะสมดีสำหรับการคอลขนาดเล็กถึงปานกลาง (ประมาณ 2–8 คนต่อคอล) หากมีผู้เข้าร่วมคอลพร้อมกันจำนวนมาก (เช่น 15–20+ คน) อาจทำให้เน็ตเวิร์กและ CPU ของเครื่องผู้ใช้ภาระสูง
* **แนวทางแก้ไขอนาคต:** หากต้องการขยายสเกลเพื่อรองรับผู้ร่วมคอลหลักร้อยคน ควรเปลี่ยนสถาปัตยกรรมไปใช้ **SFU (Selective Forwarding Unit)** เช่น Mediasoup หรือ Janus

### 3. นโยบายการเล่นสื่ออัตโนมัติของเบราว์เซอร์ (Browser Autoplay Policy)
* **ข้อจำกัด:** เว็บเบราว์เซอร์สมัยใหม่ (Chrome, Safari, Firefox) มีนโยบายจำกัดการเล่นไฟล์เสียง/วิดีโออัตโนมัติหากผู้ใช้ยังไม่ได้โต้ตอบกับหน้าเว็บ (User Gesture)
* **ผลกระทบ:** เมื่อเข้า Music Room หรือรับคอลเข้ามา เสียงอาจถูกบล็อกโดยเบราว์เซอร์จนกว่าผู้ใช้จะคลิกส่วนใดส่วนหนึ่งบนหน้าเว็บก่อน
* **แนวทางแก้ไข:** ระบบมี Toast แจ้งเตือนผู้ใช้ และแนะนำให้คลิกหน้าเว็บ 1 ครั้งเมื่อเข้าใช้งาน

### 4. ข้อจำกัดของคลิปวิดีโอ YouTube (YouTube Playback Restrictions & CORS)
* **ข้อจำกัด:** คลิป YouTube บางวิดีโออาจถูกเจ้าของลิขสิทธิ์ตั้งค่า **"Disable Embedding"** หรือจำกัดประเทศการรับชม
* **ผลกระทบ:** เมื่อนำ URL มาใส่ใน Music Room อาจเล่นวิดีโอไม่ได้หรือเกิดข้อผิดพลาดจากฝั่ง YouTube Player
* **แนวทางแก้ไข:** ใช้เพลงจากอัปโหลดไฟล์เสียงตรงเข้า Server หรือเลือก URL วิดีโอ YouTube ที่อนุญาตให้เปิดบนเว็บภายนอกได้

### 5. ประวัติการแก้ไข CSS Syntax Error (`at-rule or selector expected @[public/style.css:L1746]`)
* **สาเหตุของปัญหา:** เกิดจากเศษโค้ด CSS Property (`right: 4px; }`) อยู่นอก Selector Block และมีวงเล็บปีกกาปิด (`}`) ค้างจากอดีต `@media` query รวมทั้งมีบล็อก `.video-controls` และ `.btn-video` ซ้ำซ้อนที่หลุดมาจากกิ่งการพัฒนาเก่า
* **การแก้ไขที่ดำเนินการแล้ว:** ทำการ Clean up โค้ดส่วนเกินช่วงบรรทัดที่ 1728–1786 ใน `public/style.css` ออก ส่งผลให้โครงสร้าง CSS ถูกต้องตามมาตรฐาน และไม่มี Syntax Error รบกวนการ Build/Lint อีกต่อไป
