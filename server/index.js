/**
 * SueoRing WebRTC Signaling Server
 * Socket.IO 시그널링 + OpenAI TTS/STT(Whisper) API 프록시
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { OpenAI, toFile } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 25000,
  pingTimeout: 10000,
});

app.use(cors());
app.use(express.json());

const users = new Map();    // socketId -> { userId, userType, userName }
const rooms = new Map();    // roomId -> { users: [socketId], callStarted: boolean }
const codeRooms = new Map(); // roomCode -> { creator, partner, roles }

// ── 헬스체크 ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    users: users.size,
    rooms: rooms.size,
    tts: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ── OpenAI TTS 프록시 ───────────────────────────────────────
app.post('/api/tts', express.json(), async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OpenAI API key not configured' });
  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: text.trim(),
      response_format: 'mp3',
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS failed' });
  }
});

// ── OpenAI Whisper STT 프록시 ───────────────────────────────
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OpenAI API key not configured' });
  try {
    const ext = req.file.mimetype.includes('mp4') ? 'mp4'
              : req.file.mimetype.includes('ogg')  ? 'ogg'
              : 'webm';
    const file = await toFile(req.file.buffer, `audio.${ext}`, { type: req.file.mimetype });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ko',
      temperature: 0,
      prompt: '안녕하세요.',
    });
    res.json({ text: transcription.text || '' });
  } catch (err) {
    console.error('STT error:', err.message);
    res.status(500).json({ error: err.message || 'STT failed' });
  }
});

// ── Socket.IO 연결 처리 ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`✅ 새 연결: ${socket.id}`);

  socket.on('register', ({ userId, userType, userName }) => {
    users.set(socket.id, { userId, userType, userName });
    socket.emit('registered', { socketId: socket.id });
    io.emit('users-updated', getUsersList());
  });

  socket.on('call-user', ({ targetSocketId, offer, callerInfo }) => {
    const caller = users.get(socket.id);
    if (!caller) { socket.emit('error', { message: '등록되지 않은 사용자입니다' }); return; }
    io.to(targetSocketId).emit('incoming-call', {
      callerSocketId: socket.id,
      callerInfo: { ...callerInfo, socketId: socket.id },
      offer,
    });
  });

  socket.on('accept-call', ({ callerSocketId, answer }) => {
    io.to(callerSocketId).emit('call-accepted', { answererSocketId: socket.id, answer });
    const roomId = `${callerSocketId}-${socket.id}`;
    rooms.set(roomId, { users: [callerSocketId, socket.id], callStarted: true, startTime: Date.now() });
    socket.join(roomId);
    io.sockets.sockets.get(callerSocketId)?.join(roomId);
  });

  socket.on('reject-call', ({ callerSocketId }) => {
    io.to(callerSocketId).emit('call-rejected', { rejectorSocketId: socket.id });
  });

  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', { candidate, senderSocketId: socket.id });
  });

  socket.on('end-call', ({ targetSocketId }) => {
    if (targetSocketId) io.to(targetSocketId).emit('call-ended', { endedBy: socket.id });
    cleanupUserRooms(socket.id);
  });

  socket.on('send-gesture', ({ targetSocketId, gesture, timestamp }) => {
    io.to(targetSocketId).emit('receive-gesture', { gesture, timestamp, senderSocketId: socket.id });
  });

  // ── 양방향 방 코드 기반 시그널링 ──────────────────────────
  socket.on('room-join', ({ roomCode, role }) => {
    const room = codeRooms.get(roomCode);
    if (!room) {
      codeRooms.set(roomCode, { creator: socket.id, partner: null, roles: { [socket.id]: role } });
      socket.join(`room-${roomCode}`);
      socket.emit('room-created', { roomCode });
      console.log(`🏠 방 생성: ${roomCode}`);
    } else if (!room.partner) {
      room.partner = socket.id;
      room.roles[socket.id] = role;
      socket.join(`room-${roomCode}`);
      io.to(room.creator).emit('room-ready', { roomCode, isInitiator: true, partnerRole: role });
      socket.emit('room-ready', { roomCode, isInitiator: false, partnerRole: room.roles[room.creator] });
      console.log(`✅ 방 입장: ${roomCode}`);
    } else {
      socket.emit('room-full', { roomCode });
    }
  });

  socket.on('room-offer',  ({ roomCode, offer })     => socket.to(`room-${roomCode}`).emit('room-offer',  { offer }));
  socket.on('room-answer', ({ roomCode, answer })    => socket.to(`room-${roomCode}`).emit('room-answer', { answer }));
  socket.on('room-ice',    ({ roomCode, candidate }) => socket.to(`room-${roomCode}`).emit('room-ice',    { candidate }));
  socket.on('room-frame',  ({ roomCode, frame })     => socket.to(`room-${roomCode}`).emit('room-frame',  { frame }));
  socket.on('room-text',   ({ roomCode, type, text }) => socket.to(`room-${roomCode}`).emit('room-text',  { type, text }));

  socket.on('room-leave', ({ roomCode }) => {
    socket.to(`room-${roomCode}`).emit('room-partner-left');
    socket.leave(`room-${roomCode}`);
    const room = codeRooms.get(roomCode);
    if (room) {
      if (room.creator === socket.id) room.creator = null;
      else room.partner = null;
      if (!room.creator && !room.partner) { codeRooms.delete(roomCode); console.log(`🗑️  방 삭제: ${roomCode}`); }
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ 연결 해제: ${socket.id}`);
    cleanupUserRooms(socket.id);
    for (const [roomCode, room] of codeRooms.entries()) {
      if (room.creator === socket.id || room.partner === socket.id) {
        socket.to(`room-${roomCode}`).emit('room-partner-left');
        if (room.creator === socket.id) room.creator = null;
        else room.partner = null;
        if (!room.creator && !room.partner) { codeRooms.delete(roomCode); }
      }
    }
    users.delete(socket.id);
    io.emit('users-updated', getUsersList());
  });
});

function getUsersList() {
  return Array.from(users.entries()).map(([socketId, user]) => ({ socketId, ...user }));
}

function cleanupUserRooms(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.includes(socketId)) {
      const other = room.users.find(id => id !== socketId);
      if (other) io.to(other).emit('call-ended', { endedBy: socketId, reason: 'disconnect' });
      rooms.delete(roomId);
    }
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 SueoRing Signaling Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
