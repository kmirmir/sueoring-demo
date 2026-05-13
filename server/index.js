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

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`❌ 연결 해제: ${socket.id}`);

    const user = users.get(socket.id);
    if (user) {
      console.log(`👋 ${user.userName} 퇴장`);
    }

    // 방 정리 및 상대방에게 알림
    cleanupUserRooms(socket.id);

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
