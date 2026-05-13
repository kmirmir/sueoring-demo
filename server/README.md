# 수어링 (SueoRing) WebRTC 시그널링 서버

Socket.IO 기반 WebRTC 시그널링 서버입니다.

## 기능

- ✅ Socket.IO 기반 실시간 통신
- ✅ WebRTC Offer/Answer/ICE Candidate 교환
- ✅ 1:1 영상통화 시그널링
- ✅ 수어 제스처 실시간 전송
- ✅ 연결 상태 관리
- ✅ 자동 재연결 지원

## 설치

```bash
cd server
npm install
```

## 실행

### 개발 모드 (자동 재시작)
```bash
npm run dev
```

### 프로덕션 모드
```bash
npm start
```

서버는 기본적으로 **포트 3001**에서 실행됩니다.

## 환경 변수

`.env` 파일을 생성하여 설정할 수 있습니다:

```bash
PORT=3001
```

## API 엔드포인트

### HTTP

- `GET /health` - 서버 상태 확인
  ```json
  {
    "status": "ok",
    "users": 5,
    "rooms": 2,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
  ```

### Socket.IO 이벤트

#### 클라이언트 → 서버

| 이벤트 | 파라미터 | 설명 |
|--------|----------|------|
| `register` | `{ userId, userType, userName }` | 사용자 등록 |
| `call-user` | `{ targetSocketId, offer, callerInfo }` | 통화 요청 |
| `accept-call` | `{ callerSocketId, answer }` | 통화 수락 |
| `reject-call` | `{ callerSocketId }` | 통화 거절 |
| `ice-candidate` | `{ targetSocketId, candidate }` | ICE Candidate 전송 |
| `end-call` | `{ targetSocketId }` | 통화 종료 |
| `send-gesture` | `{ targetSocketId, gesture, timestamp }` | 수어 제스처 전송 |

#### 서버 → 클라이언트

| 이벤트 | 파라미터 | 설명 |
|--------|----------|------|
| `registered` | `{ socketId }` | 등록 완료 |
| `users-updated` | `[{ socketId, userId, userType, userName }]` | 사용자 목록 업데이트 |
| `incoming-call` | `{ callerSocketId, callerInfo, offer }` | 수신 전화 |
| `call-accepted` | `{ answererSocketId, answer }` | 통화 수락됨 |
| `call-rejected` | `{ rejectorSocketId }` | 통화 거절됨 |
| `ice-candidate` | `{ candidate, senderSocketId }` | ICE Candidate 수신 |
| `call-ended` | `{ endedBy, reason }` | 통화 종료 |
| `receive-gesture` | `{ gesture, timestamp, senderSocketId }` | 제스처 수신 |

## 통화 플로우

### 1. 연결 및 등록
```
Client A ─[connect]→ Server
Server ─[connected]→ Client A
Client A ─[register]→ Server
Server ─[registered]→ Client A
```

### 2. 통화 발신/수신
```
Client A ─[call-user + offer]→ Server
Server ─[incoming-call]→ Client B
Client B ─[accept-call + answer]→ Server
Server ─[call-accepted]→ Client A
```

### 3. ICE Candidate 교환
```
Client A ─[ice-candidate]→ Server ─[ice-candidate]→ Client B
Client B ─[ice-candidate]→ Server ─[ice-candidate]→ Client A
```

### 4. 통화 종료
```
Client A ─[end-call]→ Server
Server ─[call-ended]→ Client B
```

## 로그

서버는 다음과 같은 로그를 출력합니다:

```
✅ 새 연결: abc123
👤 사용자 등록: 홍길동 (deaf)
📞 통화 요청: abc123 -> def456
✅ 통화 수락: def456 -> abc123
🏠 방 생성: abc123-def456
📴 통화 종료: abc123 -> def456
🗑️  방 삭제: abc123-def456
❌ 연결 해제: abc123
```

## 테스트

서버가 실행 중인지 확인:

```bash
curl http://localhost:3001/health
```

## 프로덕션 배포

### PM2 사용 (권장)

```bash
npm install -g pm2
pm2 start index.js --name sueoring-signaling
pm2 save
pm2 startup
```

### Docker 사용

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3001
CMD ["node", "index.js"]
```

```bash
docker build -t sueoring-signaling .
docker run -d -p 3001:3001 sueoring-signaling
```

## 보안 고려사항

프로덕션 환경에서는 다음을 고려하세요:

1. **CORS 제한**: `cors` 설정에서 허용할 origin 명시
2. **Rate Limiting**: 과도한 요청 방지
3. **Authentication**: JWT 등을 사용한 사용자 인증
4. **SSL/TLS**: HTTPS와 WSS 사용
5. **방화벽**: 필요한 포트만 개방

## 문제 해결

### 연결이 안 될 때

1. 방화벽 확인: 포트 3001이 열려있는지 확인
2. CORS 설정: 클라이언트 origin이 허용되었는지 확인
3. 로그 확인: 서버 콘솔에서 에러 확인

### 통화가 연결되지 않을 때

1. STUN/TURN 서버 확인 (클라이언트 측)
2. ICE Candidate가 교환되는지 확인
3. 브라우저 콘솔에서 WebRTC 에러 확인

## 라이선스

MIT
