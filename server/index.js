/**
 * SueoRing WebRTC Signaling Server
 * Socket.IO 시그널링 + OpenAI TTS/STT API 프록시
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { OpenAI, toFile } = require('openai');
const { WebSocket } = require('ws');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Render 프록시 60초 타임아웃 대응: ping으로 연결 유지
  pingInterval: 25000,
  pingTimeout: 10000,
});

app.use(cors());
app.use(express.json());

// 연결된 사용자 관리
const users = new Map(); // socketId -> { userId, userType, userName }
const rooms = new Map(); // roomId -> { users: [socketId], callStarted: boolean }

// 양방향 영상통화 방 코드 관리
const codeRooms = new Map(); // roomCode -> { creator: socketId, partner: socketId|null, roles: {} }

// OpenAI Realtime API WebSocket 세션 (소켓당 1개)
const realtimeSessions = new Map(); // socketId -> WebSocket

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    users: users.size,
    rooms: rooms.size,
    tts: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Realtime API 연결 테스트 엔드포인트
app.get('/api/realtime-test', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.json({ ok: false, error: 'API key missing' });
  const ws = new WebSocket(
    'wss://api.openai.com/v1/realtime?intent=transcription',
    { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } }
  );
  const result = await new Promise((resolve) => {
    const timer = setTimeout(() => { ws.terminate(); resolve({ ok: false, error: 'timeout (5s)' }); }, 5000);
    ws.on('open', () => { clearTimeout(timer); ws.close(); resolve({ ok: true }); });
    ws.on('message', (data) => {
      try {
        const e = JSON.parse(data.toString());
        if (e.type === 'session.created') { clearTimeout(timer); ws.close(); resolve({ ok: true, model: e.session?.model }); }
      } catch { /* 무시 */ }
    });
    ws.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, error: err.message }); });
  });
  res.json(result);
});

// ── OpenAI TTS 프록시 ──────────────────────────────────────
// POST /api/tts  { text: "안녕하세요" }  →  mp3 오디오 반환
app.post('/api/tts', express.json(), async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OpenAI API key not configured' });

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',      // 한국어에 가장 자연스러운 보이스
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

// ── OpenAI Whisper STT 프록시 ──────────────────────────────
// POST /api/stt  multipart: audio 파일  →  { text: "..." } 반환
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audio file required' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OpenAI API key not configured' });

  try {
    // multer 메모리 버퍼 → OpenAI SDK가 읽을 수 있는 File 객체로 변환
    const ext = req.file.mimetype.includes('mp4') ? 'mp4'
              : req.file.mimetype.includes('ogg')  ? 'ogg'
              : 'webm';
    const file = await toFile(req.file.buffer, `audio.${ext}`, { type: req.file.mimetype });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ko',
      temperature: 0,          // 0 = 결정론적 출력 → 환각 최소화
      prompt: '안녕하세요.',   // 한국어 일상 대화 컨텍스트 힌트
    });
    res.json({ text: transcription.text || '' });
  } catch (err) {
    console.error('STT error:', err.message);
    res.status(500).json({ error: 'STT failed' });
  }
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  console.log(`✅ 새 연결: ${socket.id}`);

  // 사용자 등록
  socket.on('register', ({ userId, userType, userName }) => {
    users.set(socket.id, { userId, userType, userName });
    console.log(`👤 사용자 등록: ${userName} (${userType})`);

    // 현재 온라인 사용자 목록 전송
    socket.emit('registered', { socketId: socket.id });
    io.emit('users-updated', getUsersList());
  });

  // 통화 요청 (발신)
  socket.on('call-user', ({ targetSocketId, offer, callerInfo }) => {
    console.log(`📞 통화 요청: ${socket.id} -> ${targetSocketId}`);

    const caller = users.get(socket.id);
    if (!caller) {
      socket.emit('error', { message: '등록되지 않은 사용자입니다' });
      return;
    }

    // 상대방에게 통화 요청 전송
    io.to(targetSocketId).emit('incoming-call', {
      callerSocketId: socket.id,
      callerInfo: {
        ...callerInfo,
        socketId: socket.id
      },
      offer
    });
  });

  // 통화 수락
  socket.on('accept-call', ({ callerSocketId, answer }) => {
    console.log(`✅ 통화 수락: ${socket.id} -> ${callerSocketId}`);

    // 발신자에게 통화 수락 전송
    io.to(callerSocketId).emit('call-accepted', {
      answererSocketId: socket.id,
      answer
    });

    // 방 생성
    const roomId = `${callerSocketId}-${socket.id}`;
    rooms.set(roomId, {
      users: [callerSocketId, socket.id],
      callStarted: true,
      startTime: Date.now()
    });

    // 두 사용자를 방에 참가시킴
    socket.join(roomId);
    io.sockets.sockets.get(callerSocketId)?.join(roomId);

    console.log(`🏠 방 생성: ${roomId}`);
  });

  // 통화 거절
  socket.on('reject-call', ({ callerSocketId }) => {
    console.log(`❌ 통화 거절: ${socket.id} -> ${callerSocketId}`);

    io.to(callerSocketId).emit('call-rejected', {
      rejectorSocketId: socket.id
    });
  });

  // ICE Candidate 교환
  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', {
      candidate,
      senderSocketId: socket.id
    });
  });

  // 통화 종료
  socket.on('end-call', ({ targetSocketId }) => {
    console.log(`📴 통화 종료: ${socket.id} -> ${targetSocketId}`);

    // 상대방에게 통화 종료 알림
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-ended', {
        endedBy: socket.id
      });
    }

    // 방 정리
    cleanupUserRooms(socket.id);
  });

  // 수어 제스처 전송 (실시간 자막)
  socket.on('send-gesture', ({ targetSocketId, gesture, timestamp }) => {
    io.to(targetSocketId).emit('receive-gesture', {
      gesture,
      timestamp,
      senderSocketId: socket.id
    });
  });

  // ── 양방향 영상통화 방 코드 기반 시그널링 ──

  // 방 참가 (없으면 생성, 있으면 입장)
  socket.on('room-join', ({ roomCode, role }) => {
    const room = codeRooms.get(roomCode);
    if (!room) {
      // 방 생성 (첫 번째 참여자)
      codeRooms.set(roomCode, { creator: socket.id, partner: null, roles: { [socket.id]: role } });
      socket.join(`room-${roomCode}`);
      socket.emit('room-created', { roomCode });
      console.log(`🏠 방 생성: ${roomCode} (${socket.id})`);
    } else if (!room.partner) {
      // 방 입장 (두 번째 참여자) → WebRTC 협상 시작
      room.partner = socket.id;
      room.roles[socket.id] = role;
      socket.join(`room-${roomCode}`);
      // 방장(initiator)에게 먼저 알림 → offer 생성 시작
      io.to(room.creator).emit('room-ready', { roomCode, isInitiator: true, partnerRole: role });
      // 입장자는 offer 대기
      socket.emit('room-ready', { roomCode, isInitiator: false, partnerRole: room.roles[room.creator] });
      console.log(`✅ 방 입장: ${roomCode} (${socket.id}) — 통화 시작`);
    } else {
      socket.emit('room-full', { roomCode });
    }
  });

  // WebRTC SDP Offer 중계
  socket.on('room-offer', ({ roomCode, offer }) => {
    socket.to(`room-${roomCode}`).emit('room-offer', { offer });
  });

  // WebRTC SDP Answer 중계
  socket.on('room-answer', ({ roomCode, answer }) => {
    socket.to(`room-${roomCode}`).emit('room-answer', { answer });
  });

  // ICE Candidate 중계
  socket.on('room-ice', ({ roomCode, candidate }) => {
    socket.to(`room-${roomCode}`).emit('room-ice', { candidate });
  });

  // 영상 프레임 릴레이 (ICE 실패 시 Socket.IO 경유 폴백)
  socket.on('room-frame', ({ roomCode, frame }) => {
    socket.to(`room-${roomCode}`).emit('room-frame', { frame });
  });

  // 텍스트 릴레이 (DataChannel 불가 시 Socket.IO 경유 폴백)
  socket.on('room-text', ({ roomCode, type, text }) => {
    socket.to(`room-${roomCode}`).emit('room-text', { type, text });
  });

  // ── OpenAI Realtime API STT 프록시 (청인 전용) ──────────────

  socket.on('realtime-start', () => {
    if (!process.env.OPENAI_API_KEY) return;

    // 기존 세션 정리
    const existing = realtimeSessions.get(socket.id);
    if (existing) { try { existing.close(); } catch { /* 무시 */ } }

    // GA Realtime Transcription API: intent=transcription
    const ws = new WebSocket(
      'wss://api.openai.com/v1/realtime?intent=transcription',
      { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } }
    );
    realtimeSessions.set(socket.id, ws);

    ws.on('open', () => {
      // transcription_session.update: flat 구조, session.update와 다름
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          input_audio_format: 'pcm16',
          input_audio_transcription: { model: 'gpt-4o-transcribe' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.3,
            prefix_padding_ms: 300,
            silence_duration_ms: 800,
          },
        },
      }));
      console.log(`🎙️  Realtime STT 시작: ${socket.id}`);
    });

    ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log(`[Realtime] ${event.type}`);
        if (event.type === 'input_audio_buffer.speech_started') {
          socket.emit('realtime-transcript', { type: 'start', text: '' });
        } else if (event.type === 'conversation.item.input_audio_transcription.delta') {
          socket.emit('realtime-transcript', { type: 'delta', text: event.delta || '' });
        } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
          socket.emit('realtime-transcript', { type: 'final', text: event.transcript || '' });
        } else if (event.type === 'error') {
          console.error('Realtime API error:', JSON.stringify(event.error));
          socket.emit('realtime-error', { message: event.error?.message || 'Realtime API error' });
        }
      } catch { /* 무시 */ }
    });

    ws.on('error', (err) => {
      console.error('Realtime WS error:', err.message);
      socket.emit('realtime-error', { message: err.message });
    });
    ws.on('close', (code) => {
      realtimeSessions.delete(socket.id);
      console.log(`🔌 Realtime STT 종료: ${socket.id} (code: ${code})`);
    });
  });

  socket.on('realtime-audio', ({ audio }) => {
    const ws = realtimeSessions.get(socket.id);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
    }
  });

  socket.on('realtime-stop', () => {
    const ws = realtimeSessions.get(socket.id);
    if (ws) { try { ws.close(); } catch { /* 무시 */ } realtimeSessions.delete(socket.id); }
  });

  // 방 나가기
  socket.on('room-leave', ({ roomCode }) => {
    socket.to(`room-${roomCode}`).emit('room-partner-left');
    socket.leave(`room-${roomCode}`);
    const room = codeRooms.get(roomCode);
    if (room) {
      if (room.creator === socket.id) room.creator = null;
      else room.partner = null;
      if (!room.creator && !room.partner) {
        codeRooms.delete(roomCode);
        console.log(`🗑️  방 삭제: ${roomCode}`);
      }
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`❌ 연결 해제: ${socket.id}`);

    const user = users.get(socket.id);
    if (user) {
      console.log(`👋 ${user.userName} 퇴장`);
    }

    // Realtime STT 세션 정리
    const realtimeWS = realtimeSessions.get(socket.id);
    if (realtimeWS) { try { realtimeWS.close(); } catch { /* 무시 */ } realtimeSessions.delete(socket.id); }

    // 방 정리 및 상대방에게 알림
    cleanupUserRooms(socket.id);

    // 양방향 방 코드 방 정리
    for (const [roomCode, room] of codeRooms.entries()) {
      if (room.creator === socket.id || room.partner === socket.id) {
        socket.to(`room-${roomCode}`).emit('room-partner-left');
        if (room.creator === socket.id) room.creator = null;
        else room.partner = null;
        if (!room.creator && !room.partner) {
          codeRooms.delete(roomCode);
          console.log(`🗑️  방 삭제(disconnect): ${roomCode}`);
        }
      }
    }

    // 사용자 목록에서 제거
    users.delete(socket.id);

    // 업데이트된 사용자 목록 전송
    io.emit('users-updated', getUsersList());
  });
});

// 유틸리티 함수
function getUsersList() {
  return Array.from(users.entries()).map(([socketId, user]) => ({
    socketId,
    ...user
  }));
}

function cleanupUserRooms(socketId) {
  // 사용자가 속한 방 찾기
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.includes(socketId)) {
      // 상대방 찾기
      const otherUser = room.users.find(id => id !== socketId);
      if (otherUser) {
        // 상대방에게 통화 종료 알림
        io.to(otherUser).emit('call-ended', {
          endedBy: socketId,
          reason: 'disconnect'
        });
      }

      // 방 삭제
      rooms.delete(roomId);
      console.log(`🗑️  방 삭제: ${roomId}`);
    }
  }
}

// 서버 시작
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 SueoRing Signaling Server running on port ${PORT}`);
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
