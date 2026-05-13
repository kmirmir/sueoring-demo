/**
 * WebRTC Service
 * P2P 영상통화를 위한 WebRTC + Socket.IO 통합 서비스
 */

import { io, Socket } from 'socket.io-client';

// STUN/TURN 서버 설정
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export interface UserInfo {
  userId: string;
  userType: 'deaf' | 'hearing';
  userName: string;
}

export interface CallInfo extends UserInfo {
  socketId: string;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed';
type CallState = 'idle' | 'calling' | 'ringing' | 'active' | 'ended';

class WebRTCService {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private userInfo: UserInfo | null = null;
  private currentCallInfo: CallInfo | null = null;

  // 콜백 함수들
  private onConnectionStateChange?: (state: ConnectionState) => void;
  private onCallStateChange?: (state: CallState) => void;
  private onIncomingCall?: (callerInfo: CallInfo) => void;
  private onCallAccepted?: () => void;
  private onCallRejected?: () => void;
  private onCallEnded?: (reason?: string) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onLocalStream?: (stream: MediaStream) => void;
  private onGestureReceived?: (gesture: string, timestamp: number) => void;
  private onError?: (error: Error) => void;

  /**
   * 시그널링 서버에 연결
   */
  async connect(serverUrl: string, userInfo: UserInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.userInfo = userInfo;

        // Socket.IO 연결
        this.socket = io(serverUrl, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5
        });

        // 연결 성공
        this.socket.on('connect', () => {
          console.log('✅ Socket connected:', this.socket?.id);
          this.onConnectionStateChange?.('connected');

          // 사용자 등록
          this.socket?.emit('register', userInfo);
        });

        // 등록 완료
        this.socket.on('registered', ({ socketId }) => {
          console.log('✅ User registered:', socketId);
          resolve();
        });

        // 연결 끊김
        this.socket.on('disconnect', () => {
          console.log('❌ Socket disconnected');
          this.onConnectionStateChange?.('disconnected');
        });

        // 재연결 시도
        this.socket.on('reconnecting', () => {
          console.log('🔄 Reconnecting...');
          this.onConnectionStateChange?.('connecting');
        });

        // 수신 전화
        this.socket.on('incoming-call', async ({ callerSocketId: _callerSocketId, callerInfo, offer }) => {
          console.log('📞 Incoming call from:', callerInfo);
          this.currentCallInfo = callerInfo;
          this.onCallStateChange?.('ringing');
          this.onIncomingCall?.(callerInfo);

          // Offer 저장 (수락 시 사용)
          (this as any).pendingOffer = offer;
        });

        // 통화 수락됨
        this.socket.on('call-accepted', async ({ answererSocketId, answer }) => {
          console.log('✅ Call accepted by:', answererSocketId);

          if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            this.onCallStateChange?.('active');
            this.onCallAccepted?.();
          }
        });

        // 통화 거절됨
        this.socket.on('call-rejected', () => {
          console.log('❌ Call rejected');
          this.onCallStateChange?.('ended');
          this.onCallRejected?.();
          this.cleanup();
        });

        // ICE Candidate 수신
        this.socket.on('ice-candidate', async ({ candidate }) => {
          if (this.peerConnection && candidate) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('Error adding ICE candidate:', error);
            }
          }
        });

        // 통화 종료
        this.socket.on('call-ended', ({ reason }) => {
          console.log('📴 Call ended:', reason);
          this.onCallStateChange?.('ended');
          this.onCallEnded?.(reason);
          this.cleanup();
        });

        // 제스처 수신
        this.socket.on('receive-gesture', ({ gesture, timestamp }) => {
          this.onGestureReceived?.(gesture, timestamp);
        });

        // 에러 처리
        this.socket.on('error', (error) => {
          console.error('Socket error:', error);
          this.onError?.(new Error(error.message || 'Socket error'));
          reject(error);
        });

        // 연결 타임아웃 (10초)
        setTimeout(() => {
          if (!this.socket?.connected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 로컬 미디어 스트림 시작 (카메라 + 마이크)
   */
  async startLocalStream(constraints: MediaStreamConstraints = {
    video: { width: 1280, height: 720 },
    audio: true
  }): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Local stream started');
      this.onLocalStream?.(this.localStream);
      return this.localStream;
    } catch (error) {
      console.error('Error starting local stream:', error);
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 통화 발신
   */
  async initiateCall(targetSocketId: string): Promise<void> {
    try {
      if (!this.socket || !this.userInfo) {
        throw new Error('Not connected to signaling server');
      }

      if (!this.localStream) {
        await this.startLocalStream();
      }

      // Peer Connection 생성
      this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // 로컬 스트림 추가
      this.localStream!.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // ICE Candidate 이벤트
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket?.emit('ice-candidate', {
            targetSocketId,
            candidate: event.candidate
          });
        }
      };

      // 원격 스트림 수신
      this.peerConnection.ontrack = (event) => {
        console.log('📹 Remote stream received');
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(this.remoteStream);
      };

      // 연결 상태 변경
      this.peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', this.peerConnection?.connectionState);
        if (this.peerConnection?.connectionState === 'failed') {
          this.onError?.(new Error('Connection failed'));
        }
      };

      // Offer 생성
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });

      await this.peerConnection.setLocalDescription(offer);

      // 서버로 통화 요청 전송
      this.socket.emit('call-user', {
        targetSocketId,
        offer,
        callerInfo: {
          ...this.userInfo,
          socketId: this.socket.id
        }
      });

      this.onCallStateChange?.('calling');
      console.log('📞 Call initiated to:', targetSocketId);

    } catch (error) {
      console.error('Error initiating call:', error);
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 통화 수락
   */
  async acceptCall(): Promise<void> {
    try {
      if (!this.socket || !this.currentCallInfo) {
        throw new Error('No incoming call to accept');
      }

      const pendingOffer = (this as any).pendingOffer;
      if (!pendingOffer) {
        throw new Error('No offer available');
      }

      if (!this.localStream) {
        await this.startLocalStream();
      }

      // Peer Connection 생성
      this.peerConnection = new RTCPeerConnection(ICE_SERVERS);

      // 로컬 스트림 추가
      this.localStream!.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // ICE Candidate 이벤트
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket?.emit('ice-candidate', {
            targetSocketId: this.currentCallInfo!.socketId,
            candidate: event.candidate
          });
        }
      };

      // 원격 스트림 수신
      this.peerConnection.ontrack = (event) => {
        console.log('📹 Remote stream received');
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(this.remoteStream);
      };

      // 연결 상태 변경
      this.peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', this.peerConnection?.connectionState);
      };

      // Remote Description 설정
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(pendingOffer));

      // Answer 생성
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // 서버로 수락 응답 전송
      this.socket.emit('accept-call', {
        callerSocketId: this.currentCallInfo.socketId,
        answer
      });

      this.onCallStateChange?.('active');
      console.log('✅ Call accepted');

      // pending offer 제거
      delete (this as any).pendingOffer;

    } catch (error) {
      console.error('Error accepting call:', error);
      this.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 통화 거절
   */
  rejectCall(): void {
    if (!this.socket || !this.currentCallInfo) {
      return;
    }

    this.socket.emit('reject-call', {
      callerSocketId: this.currentCallInfo.socketId
    });

    this.onCallStateChange?.('idle');
    this.currentCallInfo = null;
    delete (this as any).pendingOffer;

    console.log('❌ Call rejected');
  }

  /**
   * 통화 종료
   */
  endCall(): void {
    if (!this.socket || !this.currentCallInfo) {
      return;
    }

    this.socket.emit('end-call', {
      targetSocketId: this.currentCallInfo.socketId
    });

    this.onCallStateChange?.('ended');
    this.cleanup();

    console.log('📴 Call ended');
  }

  /**
   * 수어 제스처 전송
   */
  sendGesture(gesture: string): void {
    if (!this.socket || !this.currentCallInfo) {
      return;
    }

    this.socket.emit('send-gesture', {
      targetSocketId: this.currentCallInfo.socketId,
      gesture,
      timestamp: Date.now()
    });
  }

  /**
   * 연결 해제
   */
  disconnect(): void {
    this.cleanup();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.userInfo = null;
    console.log('🔌 Disconnected');
  }

  /**
   * 리소스 정리
   */
  private cleanup(): void {
    // Peer Connection 정리
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // 로컬 스트림 정지
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // 원격 스트림 초기화
    this.remoteStream = null;
    this.currentCallInfo = null;
    delete (this as any).pendingOffer;
  }

  // 이벤트 핸들러 등록
  setOnConnectionStateChange(callback: (state: ConnectionState) => void) {
    this.onConnectionStateChange = callback;
  }

  setOnCallStateChange(callback: (state: CallState) => void) {
    this.onCallStateChange = callback;
  }

  setOnIncomingCall(callback: (callerInfo: CallInfo) => void) {
    this.onIncomingCall = callback;
  }

  setOnCallAccepted(callback: () => void) {
    this.onCallAccepted = callback;
  }

  setOnCallRejected(callback: () => void) {
    this.onCallRejected = callback;
  }

  setOnCallEnded(callback: (reason?: string) => void) {
    this.onCallEnded = callback;
  }

  setOnRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStream = callback;
  }

  setOnLocalStream(callback: (stream: MediaStream) => void) {
    this.onLocalStream = callback;
  }

  setOnGestureReceived(callback: (gesture: string, timestamp: number) => void) {
    this.onGestureReceived = callback;
  }

  setOnError(callback: (error: Error) => void) {
    this.onError = callback;
  }

  // Getters
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getCurrentCallInfo(): CallInfo | null {
    return this.currentCallInfo;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

// Singleton 인스턴스
export const webRTCService = new WebRTCService();
