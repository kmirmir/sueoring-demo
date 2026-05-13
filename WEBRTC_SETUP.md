# WebRTC P2P 영상통화 설정 가이드

수어링 서비스에 WebRTC P2P 영상통화 기능을 추가했습니다.

## 📋 구현 내용

### 1. Socket.IO 시그널링 서버
- **위치**: `server/index.js`
- **포트**: 3001
- **기능**:
  - WebRTC Offer/Answer/ICE Candidate 교환
  - 1:1 통화 시그널링
  - 실시간 사용자 관리
  - 수어 제스처 전송

### 2. WebRTC 서비스 모듈
- **위치**: `src/services/WebRTCService.ts`
- **기능**:
  - RTCPeerConnection 관리
  - 미디어 스트림 제어
  - Socket.IO 클라이언트 통합
  - 이벤트 기반 통신

### 3. WebRTC 통화 화면
- **위치**: `src/screens/call/WebRTCCallScreen.tsx`
- **기능**:
  - 실시간 영상 스트리밍
  - PIP (Picture-in-Picture) 내 영상
  - 마이크/비디오 on/off
  - 실시간 자막 표시

## 🚀 빠른 시작

### 1단계: 시그널링 서버 실행

```bash
# 서버 디렉토리로 이동
cd server

# 패키지 설치
npm install

# 개발 모드로 실행 (nodemon)
npm run dev

# 또는 프로덕션 모드
npm start
```

서버가 **http://localhost:3001**에서 실행됩니다.

### 2단계: 클라이언트 실행

```bash
# 프로젝트 루트로 돌아가기
cd ..

# 이미 실행 중이면 생략, 아니면 실행
npm run web
```

클라이언트가 **http://localhost:8081**에서 실행됩니다.

### 3단계: 통화 테스트

1. **2개의 브라우저 탭** 또는 **2대의 기기**에서 접속
2. 각각 로그인 (전화번호 입력)
3. 사용자 타입 선택 (청각장애인 / 청인)
4. 홈 화면에서 "수신 전화 테스트" 또는 "발신 전화 테스트" 선택
5. 통화 화면에서 실시간 영상 확인

## 🔧 통합 방법

### App.tsx에 WebRTC 화면 추가

현재 `CallScreen`을 사용하는 부분을 `WebRTCCallScreen`으로 교체하면 됩니다.

```typescript
// App.tsx
import WebRTCCallScreen from './src/screens/call/WebRTCCallScreen';

// ... 생략 ...

case 'activeCall':
  return (
    <WebRTCCallScreen
      callerName="김철수"
      callerType="hearing"
      myType={userType || 'deaf'}
      onEndCall={handleEndCall}
    />
  );
```

### WebRTC 서비스 사용 예시

```typescript
import { webRTCService } from '@/services/WebRTCService';

// 1. 서버 연결
await webRTCService.connect('http://localhost:3001', {
  userId: 'user123',
  userType: 'deaf',
  userName: '홍길동'
});

// 2. 통화 발신
await webRTCService.initiateCall(targetSocketId);

// 3. 통화 수락
await webRTCService.acceptCall();

// 4. 통화 종료
webRTCService.endCall();

// 5. 수어 제스처 전송
webRTCService.sendGesture('안녕하세요');
```

## 📱 화면별 설명

### 1. 홈 화면 (HomeScreen)
- 기존 데모 버튼 외에 실제 통화 시작 버튼 추가 가능
- WebRTC 서버 연결 상태 표시

### 2. 수신 전화 화면 (IncomingCallScreen)
- 실시간 수신 전화 알림
- 발신자 정보 표시
- 수락/거절 버튼

### 3. 발신 전화 화면 (OutgoingCallScreen)
- 발신 대기 상태
- 상대방 응답 대기
- 취소 버튼

### 4. 통화 화면 (WebRTCCallScreen)
- 실시간 P2P 영상 스트리밍
- PIP 내 영상
- 자막 오버레이
- 컨트롤 버튼 (음소거, 비디오, 종료)

## 🌐 네트워크 요구사항

### STUN/TURN 서버

현재 Google의 공개 STUN 서버를 사용합니다:
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`

프로덕션 환경에서는 자체 TURN 서버 구축을 권장합니다.

### 방화벽 설정

- **시그널링 서버**: TCP 3001
- **WebRTC**: UDP 포트 범위 (일반적으로 49152-65535)
- **STUN**: UDP 3478, 19302

## 🔐 보안 고려사항

### 개발 환경
- CORS가 모든 origin에 열려있음 (`*`)
- 인증 없이 연결 가능

### 프로덕션 환경 (권장 사항)
1. **HTTPS/WSS 사용**
   ```javascript
   const server = https.createServer(credentials, app);
   ```

2. **CORS 제한**
   ```javascript
   cors: {
     origin: 'https://yourdomain.com',
     methods: ['GET', 'POST']
   }
   ```

3. **JWT 인증**
   ```javascript
   io.use((socket, next) => {
     const token = socket.handshake.auth.token;
     // JWT 검증 로직
   });
   ```

4. **Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');
   ```

## 🐛 트러블슈팅

### 문제: "Cannot connect to signaling server"
**해결**:
- 시그널링 서버가 실행 중인지 확인
- `http://localhost:3001/health` 접속 시도
- 방화벽에서 포트 3001 허용

### 문제: "Remote video not showing"
**해결**:
- 브라우저 콘솔에서 WebRTC 에러 확인
- ICE Candidate가 교환되는지 확인
- STUN 서버 연결 확인

### 문제: "Camera/Microphone permission denied"
**해결**:
- 브라우저 설정에서 카메라/마이크 권한 허용
- HTTPS 사용 (getUserMedia는 secure context 필요)
- 브라우저 새로고침 후 재시도

### 문제: "Video freezes or lags"
**해결**:
- 네트워크 대역폭 확인
- 비디오 해상도 낮추기 (constraints 조정)
- TURN 서버 사용 고려

## 📊 성능 최적화

### 비디오 해상도 조정

```typescript
await webRTCService.startLocalStream({
  video: {
    width: { ideal: 640 },  // 낮은 해상도
    height: { ideal: 480 },
    frameRate: { ideal: 15 } // 낮은 프레임레이트
  },
  audio: true
});
```

### 적응형 비트레이트

```typescript
peerConnection.getSenders().forEach(sender => {
  if (sender.track?.kind === 'video') {
    const params = sender.getParameters();
    params.encodings[0].maxBitrate = 500000; // 500 Kbps
    sender.setParameters(params);
  }
});
```

## 🧪 테스트

### 단일 기기 테스트
1. 2개의 브라우저 탭 열기
2. 각 탭에서 다른 사용자로 로그인
3. 한 탭에서 다른 탭으로 통화

### 다중 기기 테스트
1. 같은 네트워크의 2대 기기
2. 각 기기에서 `http://<서버IP>:8081` 접속
3. 시그널링 서버도 `http://<서버IP>:3001` 접근 가능해야 함

## 📈 향후 개선 사항

1. **그룹 통화 지원** (3명 이상)
2. **화면 공유 기능**
3. **통화 녹화**
4. **네트워크 품질 표시**
5. **음성/비디오 품질 자동 조절**
6. **채팅 기능**
7. **통화 기록**

## 📚 참고 자료

- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

## 🆘 지원

문제가 발생하면 다음을 확인하세요:
1. 브라우저 콘솔 로그
2. 시그널링 서버 로그
3. 네트워크 탭 (Socket.IO 연결 확인)
4. WebRTC internals (`chrome://webrtc-internals`)
