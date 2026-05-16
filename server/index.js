/**
 * SueoRing WebRTC Signaling Server
 * Socket.IO를 사용한 P2P 영상통화 시그널링
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// 연결된 사용자 관리
const users = new Map(); // socketId -> { userId, userType, userName }
const rooms = new Map(); // roomId -> { users: [socketId], callStarted: boolean }
const chatRooms = new Map(); // roomCode -> { code, members: [{socketId, userType, userName}] }
const validRoomCodes = new Set(); // 생성된 방 코드 (로비 검증용)

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function cleanupChatRooms(socketId) {
  for (const [code, room] of chatRooms.entries()) {
    const idx = room.members.findIndex(m => m.socketId === socketId);
    if (idx === -1) continue;
    room.members.splice(idx, 1);
    io.to(`chat-${code}`).emit('chat-member-left', { members: room.members, leftSocketId: socketId });
    if (room.members.length === 0) { chatRooms.delete(code); validRoomCodes.delete(code); }
  }
}

// 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    users: users.size,
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
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

  // ── 1:1 대화방 이벤트 ──────────────────────────────────────────
  // 로비: 방 코드 생성 (소켓 방에 참가하지 않음)
  socket.on('create-chat-room', ({ userType, userName }) => {
    let code;
    do { code = generateRoomCode(); } while (validRoomCodes.has(code));
    validRoomCodes.add(code);
    socket.emit('chat-room-created', { roomCode: code });
    console.log(`💬 방 코드 생성: ${code} by ${userName}(${userType})`);
  });

  // 로비: 방 코드 유효성 검증만 (소켓 방에 참가하지 않음)
  socket.on('check-room-code', ({ roomCode }) => {
    if (!validRoomCodes.has(roomCode)) {
      socket.emit('chat-room-error', { message: '존재하지 않는 방 코드입니다' });
    } else {
      socket.emit('room-code-valid', { roomCode });
    }
  });

  // ChatRoomScreen 전용: 실제 방 참가
  socket.on('join-chat-room', ({ roomCode, userType, userName }) => {
    if (!validRoomCodes.has(roomCode)) validRoomCodes.add(roomCode); // 엣지 케이스 대비
    let room = chatRooms.get(roomCode);
    if (!room) {
      room = { code: roomCode, members: [] };
      chatRooms.set(roomCode, room);
    }
    if (room.members.length >= 2) { socket.emit('chat-room-error', { message: '방이 가득 찼습니다' }); return; }
    if (!room.members.find(m => m.socketId === socket.id)) {
      room.members.push({ socketId: socket.id, userType, userName });
    }
    socket.join(`chat-${roomCode}`);
    io.to(`chat-${roomCode}`).emit('chat-member-joined', { members: room.members, newMember: { socketId: socket.id, userType, userName } });
    console.log(`💬 대화방 입장: ${roomCode} by ${userName}(${userType})`);
  });

  socket.on('chat-gesture', ({ roomCode, gesture, timestamp }) => {
    socket.to(`chat-${roomCode}`).emit('chat-gesture-received', { gesture, timestamp, senderSocketId: socket.id });
  });

  socket.on('chat-stt', ({ roomCode, text, timestamp }) => {
    socket.to(`chat-${roomCode}`).emit('chat-stt-received', { text, timestamp, senderSocketId: socket.id });
  });

  socket.on('leave-chat-room', ({ roomCode }) => {
    cleanupChatRooms(socket.id);
    socket.leave(`chat-${roomCode}`);
  });

  // ── 채팅방 WebRTC 시그널링 릴레이 ─────────────────────────────
  socket.on('chat-offer',         ({ targetSocketId, offer })     => io.to(targetSocketId).emit('chat-offer-received',         { offer,      fromSocketId: socket.id }));
  socket.on('chat-answer',        ({ targetSocketId, answer })    => io.to(targetSocketId).emit('chat-answer-received',        { answer,     fromSocketId: socket.id }));
  socket.on('chat-ice-candidate', ({ targetSocketId, candidate }) => io.to(targetSocketId).emit('chat-ice-candidate-received', { candidate, fromSocketId: socket.id }));
  // ───────────────────────────────────────────────────────────────

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`❌ 연결 해제: ${socket.id}`);

    const user = users.get(socket.id);
    if (user) {
      console.log(`👋 ${user.userName} 퇴장`);
    }

    // 방 정리 및 상대방에게 알림
    cleanupUserRooms(socket.id);
    cleanupChatRooms(socket.id);

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
