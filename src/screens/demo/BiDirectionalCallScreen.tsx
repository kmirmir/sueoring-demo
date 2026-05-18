/**
 * BiDirectionalCallScreen - 양방향 수어 ↔ 음성 WebRTC 영상통화
 *
 * [농인] MediaPipe 수어 인식 → 텍스트 → DataChannel → 청인 자막+TTS
 * [청인] Web Speech API STT → 텍스트 → DataChannel → 농인 자막
 *
 * 화면 3단계:
 *   lobby   → 역할(농인/청인) 선택 + 방 코드 생성/입력
 *   waiting → 로컬 카메라 켜고 파트너 대기
 *   calling → 양방향 영상 + 실시간 자막
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Platform, ScrollView, Clipboard,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fonts, spacing } from '@/constants';
import { io, Socket } from 'socket.io-client';

// ── 상수 ──────────────────────────────────────────────────
const MEDIAPIPE_HANDS_VERSION  = '0.4.1675469240';
const MEDIAPIPE_DRAWING_VERSION = '0.3.1675466124';
const CDN_PROVIDERS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
] as const;

// 시그널링 서버 URL (로컬 개발: localhost:3001, 상용: 별도 배포 필요)
const SIGNAL_SERVER =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://sueoring-server.onrender.com'  // 상용 서버 URL로 교체 필요
    : 'http://localhost:3001';

// STUN: 공개 IP 획득 / TURN: AP Isolation·NAT 헤어핀 실패 시 릴레이
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // metered.ca 공개 TURN — 무인증 오픈 릴레이 (데모용)
  { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  // freestun — 무료 공개 TURN 백업
  { urls: 'turn:freestun.net:3479', username: 'free', credential: 'free' },
  { urls: 'turn:freestun.net:5350', username: 'free', credential: 'free' },
];

// ── 타입 ──────────────────────────────────────────────────
type Phase  = 'lobby' | 'waiting' | 'calling';
type Role   = 'deaf' | 'hearing';
interface Message { text: string; from: 'me' | 'partner'; ts: number; }

// ── 방 코드 생성 ──────────────────────────────────────────
const generateRoomCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

// ── Props ─────────────────────────────────────────────────
interface Props { onBack: () => void; }

// ─────────────────────────────────────────────────────────
export default function BiDirectionalCallScreen({ onBack }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isMobileWeb = Platform.OS === 'web' && (
    /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && screenWidth < 1024)
  );
  // 헤더(~56px) + 하단 패널(150px) 제외 (자막 바는 flex로 자동 조정)
  const remoteVideoHeight = Math.max(screenHeight - 56 - 150, 200);

  // 단계 & 역할
  const [phase, setPhase]           = useState<Phase>('lobby');
  const [role, setRole]             = useState<Role>('deaf');
  const [roomCode, setRoomCode]     = useState('');
  const [inputCode, setInputCode]   = useState('');
  const [, setIsCreator]   = useState(false);

  // 통화 상태
  const [connStatus, setConnStatus]   = useState<'idle'|'connecting'|'connected'>('idle');
  const [messages, setMessages]       = useState<Message[]>([]);
  const [currentSub, setCurrentSub]   = useState('');   // 실시간 자막
  const [sttLive, setSttLive]         = useState('');    // STT 중간 결과
  const [gestureLabel, setGestureLabel] = useState(''); // 현재 인식된 제스처
  const [error, setError]             = useState('');

  // MediaPipe 로딩 상태 (농인 전용)
  const [mpLoaded, setMpLoaded] = useState(false);
  // TTS 재생 중 여부 (청인 화면 오버레이 표시용)
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 원격 스트림 — state로 관리해야 도착 즉시 useEffect 재실행으로 video에 연결
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // ICE 상태 — 진단용 화면 표시
  const [iceState, setIceState] = useState('');
  // 자동재생 차단 시 "탭하여 재생" 버튼 표시
  const [needsPlayTap, setNeedsPlayTap] = useState(false);
  // 실제 전송된 제스처 자막 (전송 확인용 소형 표시)
  const [sentGestureLabel, setSentGestureLabel] = useState('');
  // Socket.IO 릴레이 모드 (ICE 실패 시 폴백)
  const [relayMode, setRelayMode] = useState(false);

  // Refs
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const remoteVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);  // 릴레이 모드 수신 캔버스
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const subClearTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsPlayingRef       = useRef(false);
  const recentTTSTextsRef   = useRef<string[]>([]);
  const ttsEndTimeRef       = useRef<number>(0);
  // 제스처 전송 전역 쿨다운: 어떤 제스처든 전송 후 2초간 다음 전송 차단
  const lastGestureSentTimeRef = useRef<number>(0);
  // 메시지 수신 중복 방지: 동일 메시지는 2초 이내 재수신 차단
  const lastReceivedRef     = useRef<{ text: string; ts: number }>({ text: '', ts: 0 });
  const socketRef       = useRef<Socket | null>(null);
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const dcRef           = useRef<RTCDataChannel | null>(null);
  const handsRef           = useRef<any>(null);
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null);  // Whisper STT
  const currentAudioRef    = useRef<HTMLAudioElement | null>(null); // OpenAI TTS
  const sttActiveRef       = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);  // ICE candidate 버퍼
  const animFrameRef    = useRef<number | null>(null);
  const workingCdnRef   = useRef<string>(CDN_PROVIDERS[0]);
  const currentRoomRef  = useRef('');
  const messagesEndRef  = useRef<View>(null);

  // ── 정리 ────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    animFrameRef.current && cancelAnimationFrame(animFrameRef.current);
    sttActiveRef.current = false;
    try { mediaRecorderRef.current?.stop(); } catch { /* 무시 */ }
    mediaRecorderRef.current = null;
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null; }
    handsRef.current?.close?.();
    dcRef.current?.close();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current     = null;
    remoteStreamRef.current    = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
    socketRef.current?.emit('room-leave', { roomCode: currentRoomRef.current });
    socketRef.current?.disconnect();
    pcRef.current     = null;
    dcRef.current     = null;
    handsRef.current  = null;
    socketRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── 스크립트 로더 ────────────────────────────────────────
  const loadScript = (src: string, timeout = 15000): Promise<void> =>
    new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      const t = setTimeout(() => { s.remove(); reject(new Error(`timeout: ${src}`)); }, timeout);
      s.onload  = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error(`failed: ${src}`)); };
      document.head.appendChild(s);
    });

  const loadWithFallback = async (path: string) => {
    for (const cdn of CDN_PROVIDERS) {
      try {
        await loadScript(`${cdn}/${path}`);
        workingCdnRef.current = cdn;
        return;
      } catch { /* 다음 CDN 시도 */ }
    }
    throw new Error(`CDN 로드 실패: ${path}`);
  };

  // ── DataChannel 메시지 수신 ──────────────────────────────
  const onDataMessage = useCallback((raw: string) => {
    try {
      const msg = JSON.parse(raw) as { type: 'gesture'|'speech'; text: string };
      const text = msg.text;
      if (!text?.trim()) return;

      const now = Date.now();

      // 자막: 항상 업데이트 (타이머 리셋)
      if (subClearTimerRef.current) clearTimeout(subClearTimerRef.current);
      setCurrentSub(text);
      subClearTimerRef.current = setTimeout(() => setCurrentSub(''), 8000);

      // 수신 중복 방지: 동일 메시지를 2초 이내에 다시 받으면 로그/TTS 차단
      const isDuplicate =
        text === lastReceivedRef.current.text &&
        now - lastReceivedRef.current.ts < 2000;
      if (isDuplicate) return;

      lastReceivedRef.current = { text, ts: now };
      setMessages(prev => [...prev, { text, from: 'partner', ts: now }]);

      // TTS: 청인이 농인의 수어(gesture)를 받을 때만 재생
      if (Platform.OS === 'web' && msg.type === 'gesture') {
        playOpenAITTS(text);
      }
    } catch { /* 무시 */ }
  }, [role]);

  // ── DataChannel 초기화 ───────────────────────────────────
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.onmessage = (e) => onDataMessage(e.data);
    dc.onopen    = () => console.log('📡 DataChannel open');
    dc.onclose   = () => console.log('📡 DataChannel closed');
  }, [onDataMessage]);

  // ── WebRTC PeerConnection 생성 ───────────────────────────
  const createPeerConnection = useCallback((code: string) => {
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    } catch (e) {
      console.error('RTCPeerConnection 생성 실패:', e);
      setError('WebRTC 초기화 실패');
      return null;
    }
    pcRef.current = pc;

    // ICE candidate → 시그널링 서버 중계
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit('room-ice', { roomCode: code, candidate });
    };

    // ICE 연결 상태 — 진단용 텍스트 + connStatus + 릴레이 폴백
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      console.log('ICE state:', s);
      setIceState(s);
      if (s === 'connected' || s === 'completed') {
        setConnStatus('connected');
        setRelayMode(false);
      } else if (s === 'failed' || s === 'disconnected') {
        setConnStatus('idle');
        setRelayMode(true);  // ICE 실패 → Socket.IO 릴레이 모드 전환
      }
    };

    // connectionState (Safari 등 대응)
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log('Connection state:', s);
      if (s === 'connected') setConnStatus('connected');
      else if (s === 'failed' || s === 'disconnected' || s === 'closed') setConnStatus('idle');
    };

    // 원격 영상 스트림 수신
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      remoteStreamRef.current = stream;
      setRemoteStream(stream);
      setConnStatus('connected');

      // useEffect 타이밍 의존 없이 즉시 + rAF 후 양쪽에서 연결 시도
      const tryConnect = () => {
        const video = remoteVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.muted = true;
        video.play()
          .then(() => {
            video.muted = false;
            setNeedsPlayTap(false);
          })
          .catch(() => setNeedsPlayTap(true));
      };
      tryConnect();
      requestAnimationFrame(tryConnect);
    };

    // DataChannel 수신 (비창시자)
    pc.ondatachannel = ({ channel }) => setupDataChannel(channel);

    return pc;
  }, [setupDataChannel]);

  // ── Socket.IO 연결 & 시그널링 ────────────────────────────
  const connectSocket = useCallback((code: string, _initiator: boolean, userRole: Role) => {
    const socket = io(SIGNAL_SERVER, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;
    currentRoomRef.current = code;

    // connect / reconnect 모두 처리 — 재연결 시에도 room-join 재전송
    const onConnected = () => {
      console.log('🔌 Socket connected:', socket.id);
      setConnStatus('connecting');
      socket.emit('room-join', { roomCode: code, role: userRole });
    };
    socket.on('connect', onConnected);
    socket.on('reconnect', onConnected);

    socket.on('disconnect', (reason) => {
      console.warn('Socket disconnected:', reason);
      // 일시적 끊김 — 재연결 대기 (자동 재연결 활성화되어 있음)
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    // 두 번째 참여자 입장 → initiator가 offer 생성
    socket.on('room-ready', async ({ isInitiator }: { isInitiator: boolean; partnerRole: Role }) => {
      setPhase('calling');
      const pc = createPeerConnection(code);
      if (!pc) return;  // RTCPeerConnection 생성 실패 시 중단

      // 로컬 스트림을 PC에 추가 (ref에서 직접 참조 — DOM 교체 영향 없음)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t =>
          pc.addTrack(t, localStreamRef.current!)
        );
      }

      if (isInitiator) {
        const dc = pc.createDataChannel('msgs');
        setupDataChannel(dc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('room-offer', { roomCode: code, offer });
      }
    });

    // Offer 수신 → Answer 생성 (non-initiator)
    socket.on('room-offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      // remote description 설정 후 버퍼에 쌓인 ICE candidate 드레인
      for (const c of pendingCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* 무시 */ }
      }
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('room-answer', { roomCode: code, answer });
    });

    // Answer 수신 (initiator)
    socket.on('room-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      // remote description 설정 후 버퍼에 쌓인 ICE candidate 드레인
      for (const c of pendingCandidatesRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* 무시 */ }
      }
      pendingCandidatesRef.current = [];
      setConnStatus('connected');
    });

    // ICE Candidate 수신 — remote description 미설정 시 버퍼에 보관
    socket.on('room-ice', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* 무시 */ }
    });

    // 파트너 퇴장
    socket.on('room-partner-left', () => {
      setConnStatus('idle');
      setCurrentSub('상대방이 통화를 종료했습니다.');
    });

    // 방 가득 참
    socket.on('room-full', () => setError('이미 2명이 참여한 방입니다.'));

    // ── Socket.IO 릴레이 폴백 (ICE 실패 시) ─────────────────
    // 원격 영상 프레임 수신 → remoteCanvasRef에 그리기
    socket.on('room-frame', ({ frame }: { frame: ArrayBuffer }) => {
      const canvas = remoteCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const blob = new Blob([frame], { type: 'image/jpeg' });
      createImageBitmap(blob).then(bitmap => {
        canvas.width  = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        setRelayMode(true);   // 프레임 수신되면 릴레이 모드 활성
        setConnStatus('connected');
      }).catch(() => {});
    });

    // 텍스트 수신 (DataChannel 대체)
    socket.on('room-text', ({ type, text }: { type: string; text: string }) => {
      onDataMessage(JSON.stringify({ type, text }));
    });
  }, [createPeerConnection, setupDataChannel, onDataMessage]);

  // ── 카메라 시작 ──────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        // 에코캔슬레이션·노이즈억제 명시적 활성화 → TTS 하울링 하드웨어 수준 차단
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;   // 별도 ref에 보존
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play();
      }
      return stream;
    } catch (e) {
      setError('카메라/마이크 권한을 허용해주세요.');
      throw e;
    }
  };

  // ── MediaPipe Hands 초기화 (농인 전용) ───────────────────
  const initMediaPipe = async () => {
    await Promise.all([
      loadWithFallback(`@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/hands.js`),
      loadWithFallback(`@mediapipe/drawing_utils@${MEDIAPIPE_DRAWING_VERSION}/drawing_utils.js`),
    ]);

    const hands = new window.Hands({
      locateFile: (f: string) =>
        `${workingCdnRef.current}/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/${f}`,
    });
    hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

    hands.onResults((results: any) => {
      if (!canvasRef.current || !localVideoRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width  = localVideoRef.current.videoWidth  || canvas.clientWidth;
      canvas.height = localVideoRef.current.videoHeight || canvas.clientHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!results.multiHandLandmarks?.length) { setGestureLabel(''); return; }

      const landmarks = results.multiHandLandmarks[0];

      // 바운딩 박스
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      landmarks.forEach((lm: any) => {
        minX = Math.min(minX, lm.x); minY = Math.min(minY, lm.y);
        maxX = Math.max(maxX, lm.x); maxY = Math.max(maxY, lm.y);
      });
      // scaleX(-1)은 video에만 적용 → canvas는 x 좌표를 직접 반전
      const bx = (1 - maxX) * canvas.width,  by = minY * canvas.height;
      const bw = (maxX - minX) * canvas.width, bh = (maxY - minY) * canvas.height;

      ctx.strokeStyle = '#00FF88'; ctx.lineWidth = 3;
      ctx.strokeRect(bx, by, bw, bh);

      // 제스처 인식
      const gesture = recognizeGesture(landmarks);
      if (gesture) {
        setGestureLabel(gesture);
        ctx.fillStyle = 'rgba(0,255,136,0.85)';
        ctx.fillRect(bx, by - 36, Math.max(bw, 120), 32);
        ctx.fillStyle = '#000';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(gesture, bx + 8, by - 12);
        // 전역 2초 쿨다운: 어떤 제스처든 마지막 전송 후 2초 이내 재전송 차단
        // (시각적 gestureLabel은 위에서 이미 즉각 업데이트됨)
        const now = Date.now();
        const inCooldown = now - lastGestureSentTimeRef.current < 2000;

        if (!inCooldown) {
          lastGestureSentTimeRef.current = now;
          if (dcRef.current?.readyState === 'open') {
            dcRef.current.send(JSON.stringify({ type: 'gesture', text: gesture }));
          } else if (socketRef.current?.connected) {
            socketRef.current.emit('room-text', { roomCode: currentRoomRef.current, type: 'gesture', text: gesture });
          }
          // 전송 확인 자막: 실제 전송된 제스처만 표시 (5초 후 자동 소멸)
          setSentGestureLabel(gesture);
          setTimeout(() => setSentGestureLabel(prev => prev === gesture ? '' : prev), 5000);
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.from === 'me' && last.text === gesture && now - last.ts < 2000) return prev;
            return [...prev, { text: gesture, from: 'me', ts: now }];
          });
        }
      } else {
        setGestureLabel('');
      }
    });

    handsRef.current = hands;
    setMpLoaded(true);

    const processFrame = async () => {
      try {
        if (localVideoRef.current && handsRef.current) {
          await handsRef.current.send({ image: localVideoRef.current });
        }
      } catch { /* WASM 에러 무시 — 프레임 루프 유지 */ }
      animFrameRef.current = requestAnimationFrame(processFrame);
    };
    processFrame();
  };

  // ── OpenAI TTS (tts-1) ───────────────────────────────────
  const playOpenAITTS = async (text: string) => {
    // 이전 재생 즉시 중단
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    // 에코 텍스트 목록에 등록 (8초 후 자동 제거)
    recentTTSTextsRef.current.push(text);
    setTimeout(() => {
      recentTTSTextsRef.current = recentTTSTextsRef.current.filter(t => t !== text);
    }, 8000);

    setIsSpeaking(true);
    ttsPlayingRef.current = true;

    // ① 로컬 마이크 뮤트 (내 음성이 상대방으로 전달되지 않게)
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
    // ② 원격 오디오도 뮤트 (상대방 WebRTC 음성 + TTS 동시 출력 → 마이크 혼입 차단)
    if (remoteVideoRef.current) remoteVideoRef.current.muted = true;
    // ③ MediaRecorder stop → 버퍼 폐기
    try { mediaRecorderRef.current?.stop(); mediaRecorderRef.current = null; } catch { /* 무시 */ }

    try {
      const response = await fetch(`${SIGNAL_SERVER}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const onFinish = () => {
        URL.revokeObjectURL(url);
        currentAudioRef.current = null;
        setIsSpeaking(false);
        ttsPlayingRef.current = false;
        ttsEndTimeRef.current = Date.now(); // 종료 시각 기록
        // 원격 오디오 언뮤트 복원
        if (remoteVideoRef.current) remoteVideoRef.current.muted = false;
        // 2500ms 후 마이크 재활성화 + MediaRecorder 재시작 (잔향 완전 소멸 대기)
        setTimeout(() => {
          localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = true; });
          if (sttActiveRef.current) initSTT();
        }, 2500);
      };
      audio.onended = onFinish;
      audio.onerror = onFinish;
      await audio.play();
    } catch (err) {
      console.error('OpenAI TTS error:', err);
      setIsSpeaking(false);
      ttsPlayingRef.current = false;
      ttsEndTimeRef.current = Date.now();
      if (remoteVideoRef.current) remoteVideoRef.current.muted = false;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = true; });
      if (sttActiveRef.current) initSTT();
    }
  };

  // ── OpenAI Whisper STT (청인 전용) — MediaRecorder 3초 청크 방식 ──
  // Whisper 환각 블랙리스트: 훈련 데이터에서 자주 나오는 오인식 문구
  const STT_HALLUCINATIONS = [
    'MBC', 'KBS', 'SBS', '뉴스', '이덕영', '앵커', '기자입니다',
    '구독', '좋아요', '시청해주셔서', '감사합니다', '안녕하십니까',
    '자막', '번역', '제작', '저작권',
  ];

  const initSTT = () => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (!audioTracks.length) return;

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                   : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                   : MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4'
                   : 'audio/ogg';
    const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    const audioStream = new MediaStream(audioTracks);

    // ── VAD (음성 활성 감지): Web Audio API로 실제 음성 유무 확인 ──────
    // 침묵 구간 청크를 Whisper에 보내지 않아 환각 발생 원천 차단
    let hasSpeech = false;
    let vadCleanup: (() => void) | null = null;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source   = audioCtx.createMediaStreamSource(audioStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      let rafId = 0;
      const checkLevel = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        if (avg > 8) hasSpeech = true;   // threshold: 8/255 ≈ 매우 조용한 목소리도 감지
        if (sttActiveRef.current) rafId = requestAnimationFrame(checkLevel);
      };
      checkLevel();
      vadCleanup = () => { cancelAnimationFrame(rafId); audioCtx.close(); };
    } catch {
      // VAD 미지원(iOS Safari 등) → hasSpeech를 항상 true로 유지 (차단 안 함)
      hasSpeech = true;
    }

    const vadAvailable = vadCleanup !== null; // VAD 실제 동작 여부

    const recorder = new MediaRecorder(audioStream, { mimeType });
    mediaRecorderRef.current = recorder;
    sttActiveRef.current = true;

    recorder.ondataavailable = async (e) => {
      // VAD 미지원 시 항상 통과 / 지원 시 음성 감지 여부로 판단
      const speechDetected = vadAvailable ? hasSpeech : true;
      if (vadAvailable) hasSpeech = false;  // VAD 있을 때만 리셋

      if (!sttActiveRef.current || ttsPlayingRef.current) return;
      if (e.data.size < 1000) return;  // 1000 bytes 미만만 차단 (모바일 압축 고려)
      if (!speechDetected) return;     // VAD: 음성 없는 청크 전송 차단

      try {
        setSttLive('인식 중...');
        const formData = new FormData();
        formData.append('audio', e.data, `audio.${ext}`);

        const response = await fetch(`${SIGNAL_SERVER}/api/stt`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        const text = data.text?.trim();
        setSttLive('');

        if (!text) return;

        // 환각 필터: 블랙리스트 키워드 포함 시 폐기
        if (STT_HALLUCINATIONS.some(h => text.includes(h))) {
          console.log('🚫 환각 감지 폐기:', text);
          return;
        }

        // 에코 감지: 최근 TTS로 재생한 텍스트와 일치하면 폐기
        const normalize = (s: string) => s.replace(/\s+/g, '');
        const isEcho = recentTTSTextsRef.current.some(t =>
          normalize(t).includes(normalize(text)) ||
          normalize(text).includes(normalize(t))
        );
        if (isEcho) return;

        // 청인 화면에 본인 발화 확인 자막 표시 (5초 후 자동 소멸)
        setSttLive(text);
        setTimeout(() => setSttLive(prev => prev === text ? '' : prev), 5000);

        setMessages(prev => [...prev, { text, from: 'me', ts: Date.now() }]);
        if (dcRef.current?.readyState === 'open') {
          dcRef.current.send(JSON.stringify({ type: 'speech', text }));
        } else if (socketRef.current?.connected) {
          socketRef.current.emit('room-text', { roomCode: currentRoomRef.current, type: 'speech', text });
        }
      } catch (err) {
        console.error('Whisper STT error:', err);
        setSttLive('');
      }
    };

    recorder.addEventListener('stop', () => vadCleanup?.());
    recorder.start(3000);
  };

  // ── 서버 wake-up 핑 (Render 무료 슬립 대응) ─────────────
  // 서버가 실제로 응답할 때까지 최대 20초 재시도
  const pingServer = async () => {
    for (let i = 0; i < 10; i++) {
      try {
        const r = await fetch(`${SIGNAL_SERVER}/health`, { signal: AbortSignal.timeout(3000) });
        if (r.ok) { console.log('✅ 서버 응답 확인'); return; }
      } catch { /* 무시 — 다음 시도 */ }
      if (i < 9) await new Promise(r => setTimeout(r, 2000));
    }
    console.warn('서버 응답 없음 — 연결 시도 계속');
  };

  // ── 방 만들기 ────────────────────────────────────────────
  const handleCreateRoom = async () => {
    setError('');
    await pingServer(); // 서버 wake-up
    const code = generateRoomCode();
    setRoomCode(code);
    setIsCreator(true);
    try {
      await startCamera();
      setPhase('waiting');
      connectSocket(code, true, role);  // role 전달 → connect 콜백에서 room-join 발송
    } catch { /* 에러는 startCamera에서 처리 */ }
  };

  // ── 방 입장 ──────────────────────────────────────────────
  const handleJoinRoom = async () => {
    const code = inputCode.trim().toUpperCase();
    if (code.length < 4) { setError('방 코드를 입력해주세요.'); return; }
    setError('');
    await pingServer(); // 서버 wake-up
    setRoomCode(code);
    setIsCreator(false);
    try {
      await startCamera();
      setPhase('waiting');
      connectSocket(code, false, role);  // role 전달 → connect 콜백에서 room-join 발송
    } catch { /* 에러는 startCamera에서 처리 */ }
  };

  // ── 릴레이 모드: 로컬 영상을 JPEG 프레임으로 소켓 전송 ──────
  useEffect(() => {
    if (!relayMode || phase !== 'calling') return;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 320; captureCanvas.height = 240;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    const loop = setInterval(() => {
      const video = localVideoRef.current;
      if (!video || video.readyState < 2) return;
      ctx.save();
      ctx.translate(320, 0); ctx.scale(-1, 1);  // 미러 반전
      ctx.drawImage(video, 0, 0, 320, 240);
      ctx.restore();
      captureCanvas.toBlob(blob => {
        if (!blob || !socketRef.current?.connected) return;
        blob.arrayBuffer().then(buf => {
          socketRef.current?.emit('room-frame', { roomCode: currentRoomRef.current, frame: buf });
        });
      }, 'image/jpeg', 0.45);
    }, 150); // ~6fps

    return () => clearInterval(loop);
  }, [relayMode, phase]); // eslint-disable-line

  // calling 단계 진입 시: 로컬 PiP 스트림 재연결 + 역할별 기능 초기화
  useEffect(() => {
    if (phase !== 'calling') return;

    requestAnimationFrame(() => {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
    });

    // 15초 내 ICE 미연결 시 릴레이 모드 자동 전환
    // (모바일 LTE 등 느린 환경에서 ICE 협상이 10초+ 걸릴 수 있어 여유 확보)
    const relayTimer = setTimeout(() => {
      setRelayMode(prev => {
        if (!prev) console.log('ICE 15s timeout → relay mode');
        return true;
      });
    }, 15000);

    if (role === 'deaf') {
      initMediaPipe().catch(e => setError(`MediaPipe 로드 실패: ${e.message}`));
    } else {
      initSTT();
    }

    return () => clearTimeout(relayTimer);
  }, [phase]); // eslint-disable-line

  // 원격 스트림 도착 또는 relay 모드 해제 시 video에 연결
  // relayMode 해제 → 숨겨진 video 요소가 다시 보이므로 srcObject 재설정 필요
  useEffect(() => {
    if (!remoteStream) return;
    const video = remoteVideoRef.current;
    if (!video) return;
    if (video.srcObject !== remoteStream) {
      video.srcObject = remoteStream;
    }
    video.muted = true;
    video.play()
      .then(() => { video.muted = false; setNeedsPlayTap(false); })
      .catch(() => setNeedsPlayTap(true));
  }, [remoteStream, relayMode]); // eslint-disable-line

  // ── 통화 종료 ────────────────────────────────────────────
  const handleEndCall = () => {
    cleanup();
    onBack();
  };

  // 코드 복사
  const copyRoomCode = () => {
    if (Platform.OS === 'web') navigator.clipboard?.writeText(roomCode);
    else Clipboard.setString(roomCode);
  };

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 공통 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={phase === 'calling' ? handleEndCall : onBack}>
          <Text style={styles.backBtnText}>{phase === 'calling' ? '📴 종료' : '← 홈'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📹 수어 양방향 통화</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {phase === 'calling' && !!iceState && (
            <Text style={{ color: iceState === 'connected' || iceState === 'completed' ? '#00FF88' : iceState === 'failed' ? '#FF5555' : '#FFB800', fontSize: 10 }}>
              {iceState}
            </Text>
          )}
          <View style={[styles.connDot, connStatus === 'connected' && styles.connDotOn,
            connStatus === 'connecting' && styles.connDotWait]} />
        </View>
      </View>


      {/* ── LOBBY ── */}
      {phase === 'lobby' && (
        <ScrollView contentContainerStyle={styles.lobbyContainer}>
          <Text style={styles.lobbyTitle}>역할을 선택하세요</Text>

          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleCard, role === 'deaf' && styles.roleCardActive]}
              onPress={() => setRole('deaf')}
            >
              <Text style={styles.roleEmoji}>🤟</Text>
              <Text style={styles.roleLabel}>농인</Text>
              <Text style={styles.roleDesc}>수어 → 자막 변환</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.roleCard, role === 'hearing' && styles.roleCardActive]}
              onPress={() => setRole('hearing')}
            >
              <Text style={styles.roleEmoji}>🗣️</Text>
              <Text style={styles.roleLabel}>청인</Text>
              <Text style={styles.roleDesc}>음성 → 자막 변환</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider}><Text style={styles.dividerText}>방 만들기</Text></View>
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateRoom}>
            <Text style={styles.createBtnText}>🏠 새 방 만들기</Text>
          </TouchableOpacity>

          <View style={styles.divider}><Text style={styles.dividerText}>방 입장</Text></View>
          <TextInput
            style={styles.codeInput}
            placeholder="방 코드 입력 (예: AB12CD)"
            placeholderTextColor="#888"
            value={inputCode}
            onChangeText={setInputCode}
            autoCapitalize="characters"
            maxLength={8}
          />
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoinRoom}>
            <Text style={styles.joinBtnText}>🚪 방 입장</Text>
          </TouchableOpacity>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* 네트워크 환경 주의사항 */}
          <View style={styles.networkNotice}>
            <Text style={styles.networkNoticeTitle}>📡 네트워크 환경 안내</Text>
            <View style={styles.networkNoticeRow}>
              <Text style={styles.networkNoticeBadge}>⚠️ 제한</Text>
              <Text style={styles.networkNoticeText}>SKT 사내망 WiFi — WebRTC P2P 차단됨{'\n'}(저화질 릴레이 모드로 자동 전환)</Text>
            </View>
            <View style={styles.networkNoticeRow}>
              <Text style={styles.networkNoticeBadge}>✅ 권장</Text>
              <Text style={styles.networkNoticeText}>모바일 핫스팟 — WebRTC 정상 동작{'\n'}(고화질 P2P 직접 연결)</Text>
            </View>
            <Text style={styles.networkNoticeHint}>
              💡 Demo 시: 모바일 핫스팟 생성 후 PC WiFi를 핫스팟으로 연결하세요
            </Text>
          </View>
        </ScrollView>
      )}

      {/* ── WAITING ── */}
      {phase === 'waiting' && (
        <View style={styles.waitingContainer}>
          {/* 로컬 카메라 미리보기 */}
          <View style={styles.waitingVideo}>
            {Platform.OS === 'web' && (
              <video
                ref={localVideoRef as any}
                autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, transform: 'scaleX(-1)' }}
              />
            )}
          </View>

          <View style={styles.waitingInfo}>
            <Text style={styles.waitingTitle}>📡 파트너 대기 중...</Text>
            {/* 소켓 연결 상태 진단 표시 */}
            <Text style={{ color: connStatus === 'connecting' ? '#00FF88' : '#FFB800', fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
              {connStatus === 'connecting' ? '✅ 서버 연결됨 — 파트너 입장 대기 중' : '🟡 서버 연결 중...'}
            </Text>
            <Text style={styles.waitingDesc}>
              아래 방 코드를 상대방에게 공유하세요.{'\n'}
              상대방이 입장하면 자동으로 통화가 시작됩니다.
            </Text>

            <TouchableOpacity style={styles.codeBox} onPress={copyRoomCode}>
              <Text style={styles.codeBoxLabel}>방 코드</Text>
              <Text style={styles.codeBoxCode}>{roomCode}</Text>
              <Text style={styles.codeBoxCopy}>탭하여 복사 📋</Text>
            </TouchableOpacity>

            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                내 역할: {role === 'deaf' ? '🤟 농인 (수어 인식)' : '🗣️ 청인 (음성 인식)'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── CALLING ── */}
      {phase === 'calling' && (
        <View style={styles.callingContainer}>

          {/* ICE 실패 안내 배너 */}
          {iceState === 'failed' && (
            <View style={{ backgroundColor: '#7F1D1D', padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#FCA5A5', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                ⚠️ 기기 간 직접 연결 실패 (AP Isolation / NAT 차단)
              </Text>
              <Text style={{ color: '#FCA5A5', fontSize: 11, marginTop: 4, textAlign: 'center' }}>
                한 기기를 모바일 데이터로 전환하거나, 같은 PC에서 두 탭으로 테스트하세요.
              </Text>
            </View>
          )}

          {/* ── PC: 5:5 좌우 분할 ── */}
          {!isMobileWeb ? (
            <View style={[styles.splitRow, { height: remoteVideoHeight }]}>

              {/* 내 영상 (좌측 50%) */}
              <View style={styles.splitPanel}>
                <View style={styles.splitLabelBox}>
                  <Text style={styles.splitLabelText}>
                    {role === 'deaf' ? '🤟 나 (농인 · 수어 송신)' : '🗣️ 나 (청인 · 음성 송신)'}
                  </Text>
                </View>
                {Platform.OS === 'web' && (
                  <>
                    <video
                      ref={localVideoRef as any}
                      autoPlay playsInline muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                    />
                    <canvas
                      ref={canvasRef as any}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    />
                  </>
                )}
                {/* AI 로딩 중일 때만 상태 표시 */}
                {role === 'deaf' && !mpLoaded && (
                  <View style={styles.splitMySub}>
                    <Text style={styles.splitMySubText}>⏳ AI 로딩 중...</Text>
                  </View>
                )}
              </View>

              {/* 구분선 */}
              <View style={styles.splitDivider} />

              {/* 상대방 영상 (우측 50%) */}
              <View style={styles.splitPanel}>
                <View style={styles.splitLabelBox}>
                  <Text style={styles.splitLabelText}>
                    {role === 'deaf' ? '👤 상대방 (청인 · 자막 수신)' : '🤟 상대방 (농인 · 수어 송신)'}
                  </Text>
                </View>
                {/* 원격 비디오: 항상 DOM에 유지 (오디오 스트림 보존)
                    릴레이 모드에서는 display:none으로 숨기고 캔버스가 시각적 표시 담당 */}
                {Platform.OS === 'web' && (
                  <video
                    ref={remoteVideoRef as any}
                    autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover',
                             ...(relayMode ? { display: 'none' } : {}) } as any}
                  />
                )}
                {/* 릴레이 모드: JPEG 프레임 캔버스 (시각만, 오디오는 위 video가 담당) */}
                {Platform.OS === 'web' && relayMode && (
                  <canvas
                    ref={remoteCanvasRef as any}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' } as any}
                  />
                )}
                {!remoteStream && !relayMode && (
                  <View style={styles.videoPlaceholder}>
                    <Text style={styles.videoPlaceholderText}>⏳ 연결 중...</Text>
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 8, textAlign: 'center' }}>상대방이 방 코드로 입장하면 자동 연결</Text>
                    {!!iceState && <Text style={{ color: '#00AAFF', fontSize: 11, marginTop: 4 }}>ICE: {iceState}</Text>}
                  </View>
                )}
                {/* 자동재생 차단 시 탭하여 재생 버튼 */}
                {remoteStream && needsPlayTap && (
                  <TouchableOpacity
                    style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
                    onPress={() => {
                      const v = remoteVideoRef.current as any;
                      if (v) { v.muted = false; v.play().then(() => setNeedsPlayTap(false)).catch(() => {}); }
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>▶ 탭하여 영상 재생</Text>
                  </TouchableOpacity>
                )}
                {/* 상단 자막: 🤟 농인 수어 인식 결과 (실시간) */}
                {!!(role === 'deaf' ? gestureLabel : currentSub) && (
                  <View style={styles.subOverlayTop}>
                    <Text style={styles.subOverlayTopText} numberOfLines={2}>
                      🤟 {role === 'deaf' ? gestureLabel : currentSub}
                    </Text>
                  </View>
                )}
                {/* 전송 확인 뱃지: 실제 전송된 수어 소형 표시 (농인 전용) */}
                {role === 'deaf' && !!sentGestureLabel && (
                  <View style={styles.sentBadge}>
                    <Text style={styles.sentBadgeText}>📤 전송됨: {sentGestureLabel}</Text>
                  </View>
                )}
                {/* 하단 자막: 🗣️ 청인 발화 인식 결과 */}
                {!!(role === 'deaf' ? currentSub : sttLive) && (
                  <View style={styles.subOverlayBottom}>
                    <Text style={styles.subOverlayBottomText} numberOfLines={2}>
                      🗣️ {role === 'deaf' ? currentSub : sttLive}
                    </Text>
                    {isSpeaking && (
                      <Text style={styles.ttsActiveText}>🔊 음성 변환 중...</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          ) : (
            /* ── 모바일: PiP 레이아웃
               농인: 청인 영상(원격) 메인 + 본인 PiP
               청인: 청인 영상(본인) 메인 + 농인(원격) PiP  ← Option B
            ── */
            <View style={[styles.remoteVideoBox, { height: remoteVideoHeight }]}>

              {/* ── 메인 화면 ──
                  농인: 본인 영상 메인 (손 크게 보여 수어 인식 확인 최적화) + 수어 캔버스
                  청인: 본인 영상 메인 (Option B)
              ── */}
              {role === 'deaf' ? (
                Platform.OS === 'web' && (
                  <>
                    <video ref={localVideoRef as any} autoPlay playsInline muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    <canvas ref={canvasRef as any}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                  </>
                )
              ) : (
                // 청인: 본인 영상이 메인 (Option B)
                Platform.OS === 'web' ? (
                  <video ref={localVideoRef as any} autoPlay playsInline muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                ) : null
              )}

              {/* ── 메인 화면 상단 자막: 🤟 농인 수어 (실시간) ── */}
              {!!(role === 'deaf' ? gestureLabel : currentSub) && (
                <View style={styles.subOverlayTop}>
                  <Text style={styles.subOverlayTopText} numberOfLines={2}>
                    🤟 {role === 'deaf' ? gestureLabel : currentSub}
                  </Text>
                </View>
              )}

              {/* 전송 확인 뱃지: 실제 전송된 수어 소형 표시 (농인 전용) */}
              {role === 'deaf' && !!sentGestureLabel && (
                <View style={styles.sentBadge}>
                  <Text style={styles.sentBadgeText}>📤 전송됨: {sentGestureLabel}</Text>
                </View>
              )}

              {/* ── 메인 화면 하단 자막: 🗣️ 청인 발화 ── */}
              {!!(role === 'deaf' ? currentSub : sttLive) && (
                <View style={styles.subOverlayBottom}>
                  <Text style={styles.subOverlayBottomText} numberOfLines={2}>
                    🗣️ {role === 'deaf' ? currentSub : sttLive}
                  </Text>
                  {isSpeaking && (
                    <Text style={styles.ttsActiveText}>🔊 음성 변환 중...</Text>
                  )}
                </View>
              )}

              {/* ── PiP: 상대방 영상 ── */}
              {/* 농인: 청인 원격 영상 PiP (항상 DOM 유지 — 오디오 보존)
                  청인: 농인 원격 영상 PiP (항상 DOM 유지 — 오디오 보존) */}
              <View style={styles.localPip}>
                {Platform.OS === 'web' && (
                  <>
                    <video ref={remoteVideoRef as any} autoPlay playsInline
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8,
                               ...(relayMode ? { display: 'none' } : {}) } as any} />
                    {relayMode && (
                      <canvas ref={remoteCanvasRef as any}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 } as any} />
                    )}
                  </>
                )}
              </View>

              {/* AI 로딩 표시 (농인 화면) */}
              {role === 'deaf' && !mpLoaded && (
                <View style={[styles.mobileMySub, { bottom: 0, top: undefined }]}>
                  <Text style={styles.mobileMySubText}>⏳ AI 로딩 중...</Text>
                </View>
              )}
            </View>
          )}

          {/* 하단 대화 기록 (내 송신 상태는 영상 오버레이로 이동) */}
          <View style={styles.bottomPanel}>
            <ScrollView style={styles.msgList} contentContainerStyle={{ paddingVertical: 4 }}>
              {messages.length === 0 ? (
                <Text style={styles.msgEmpty}>대화 내용이 여기에 표시됩니다</Text>
              ) : (
                messages.map((m, i) => (
                  <View key={i} style={[styles.msgBubble, m.from === 'me' ? styles.msgMe : styles.msgPartner]}>
                    <Text style={styles.msgText}>{m.from === 'me' ? '나' : '상대방'}: {m.text}</Text>
                  </View>
                ))
              )}
              <View ref={messagesEndRef as any} />
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

// ── 제스처 인식 (손 크기 기반 동적 임계값) ───────────────────
function recognizeGesture(landmarks: any[]): string | null {
  try {
    const wrist     = landmarks[0];
    const thumbTip  = landmarks[4];
    const indexTip  = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip   = landmarks[16];
    const pinkyTip  = landmarks[20];
    const indexMcp  = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp   = landmarks[13];
    const pinkyMcp  = landmarks[17];

    const handSize = Math.abs(wrist.y - middleMcp.y);
    const thr = Math.max(handSize * 0.3, 0.02);

    const iExt = indexTip.y  < indexMcp.y  - thr;
    const mExt = middleTip.y < middleMcp.y - thr;
    const rExt = ringTip.y   < ringMcp.y   - thr;
    const pExt = pinkyTip.y  < pinkyMcp.y  - thr;
    const iCls = indexTip.y  > indexMcp.y;
    const mCls = middleTip.y > middleMcp.y;
    const rCls = ringTip.y   > ringMcp.y;
    const pCls = pinkyTip.y  > pinkyMcp.y;

    const handH = wrist.y;
    const atFace = handH < 0.40;
    const thumbUp = thumbTip.y < wrist.y - Math.max(handSize * 0.8, 0.08);
    const thumbSide = Math.abs(thumbTip.x - indexMcp.x) > Math.max(handSize * 0.8, 0.10);
    const all = iExt && mExt && rExt && pExt;

    if (iCls && mCls && rCls && pCls && atFace) return '아파요';
    if (iExt && mCls && rCls && pCls && atFace) return '경찰';
    if (iExt && mExt && rExt && pCls)           return '119';
    if (thumbSide && pExt && iCls && mCls && rCls) return '전화';
    if (handH < 0.45 && all)                    return '안녕하세요';
    if (iCls && mCls && rCls && pCls)           return '감사합니다';
    if (indexTip.y < indexMcp.y - thr * 2 && mCls && rCls && pCls) return '네';
    if (iExt && mExt && rCls && pCls)           return '아니요';
    if (thumbUp && iCls && mCls)                return '괜찮아요';
    if (all && handH > 0.40)                    return '도와주세요';
  } catch { /* 무시 */ }
  return null;
}

// ── 스타일 ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1F3A', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: '#2D3561',
  },
  backBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  backBtnText: { color: '#FF5555', fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  headerTitle: { color: '#FFFFFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  connDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#555' },
  connDotOn: { backgroundColor: '#00FF88' },
  connDotWait: { backgroundColor: '#FFB800' },

  // ── Lobby ──
  lobbyContainer: { padding: spacing.xl, alignItems: 'center' },
  lobbyTitle: { color: '#FFFFFF', fontSize: fonts.sizes['2xl'], fontWeight: fonts.weights.bold, marginBottom: spacing.xl },
  roleRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.xl },
  roleCard: {
    width: 140, padding: spacing.lg, borderRadius: 16,
    backgroundColor: '#1A1F3A', borderWidth: 2, borderColor: '#2D3561', alignItems: 'center',
  },
  roleCardActive: { borderColor: '#00FF88', backgroundColor: '#112211' },
  roleEmoji: { fontSize: 40, marginBottom: spacing.sm },
  roleLabel: { color: '#FFFFFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold, marginBottom: spacing.xs },
  roleDesc: { color: '#AAA', fontSize: fonts.sizes.sm, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginVertical: spacing.lg },
  dividerText: { color: '#555', fontSize: fonts.sizes.sm, textAlign: 'center', width: '100%' },
  createBtn: {
    width: '100%', backgroundColor: '#0D7A3E', paddingVertical: spacing.lg,
    borderRadius: 12, alignItems: 'center', marginBottom: spacing.sm,
  },
  createBtnText: { color: '#FFFFFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  codeInput: {
    width: '100%', backgroundColor: '#1A1F3A', color: '#FFFFFF',
    borderWidth: 2, borderColor: '#2D3561', borderRadius: 12,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    fontSize: fonts.sizes.xl, textAlign: 'center', letterSpacing: 4, marginBottom: spacing.sm,
  },
  joinBtn: {
    width: '100%', backgroundColor: '#2563EB', paddingVertical: spacing.lg,
    borderRadius: 12, alignItems: 'center',
  },
  joinBtnText: { color: '#FFFFFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  errorText: { color: '#FF5555', marginTop: spacing.md, textAlign: 'center' },

  // 네트워크 안내
  networkNotice: {
    width: '100%', marginTop: spacing.xl,
    backgroundColor: '#111827', borderRadius: 12,
    padding: spacing.lg, borderWidth: 1, borderColor: '#374151',
  },
  networkNoticeTitle: {
    color: '#9CA3AF', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold,
    marginBottom: spacing.md, textAlign: 'center',
  },
  networkNoticeRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: 8,
  },
  networkNoticeBadge: {
    fontSize: fonts.sizes.sm, width: 60, flexShrink: 0,
  },
  networkNoticeText: {
    color: '#D1D5DB', fontSize: fonts.sizes.sm, flex: 1, lineHeight: 20,
  },
  networkNoticeHint: {
    color: '#60A5FA', fontSize: 11, marginTop: spacing.sm,
    textAlign: 'center', lineHeight: 17,
  },

  // ── Waiting ──
  waitingContainer: { flex: 1, padding: spacing.lg },
  waitingVideo: {
    height: 280, backgroundColor: '#000', borderRadius: 12,
    overflow: 'hidden', marginBottom: spacing.lg, borderWidth: 2, borderColor: '#2D3561',
  },
  waitingInfo: { alignItems: 'center' },
  waitingTitle: { color: '#FFFFFF', fontSize: fonts.sizes['2xl'], fontWeight: fonts.weights.bold, marginBottom: spacing.md },
  waitingDesc: { color: '#AAA', fontSize: fonts.sizes.base, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
  codeBox: {
    backgroundColor: '#1A1F3A', borderRadius: 16, padding: spacing.xl,
    alignItems: 'center', borderWidth: 2, borderColor: '#00FF88', width: '100%', marginBottom: spacing.lg,
  },
  codeBoxLabel: { color: '#AAA', fontSize: fonts.sizes.sm, marginBottom: spacing.sm },
  codeBoxCode: { color: '#00FF88', fontSize: 40, fontWeight: fonts.weights.bold, letterSpacing: 8 },
  codeBoxCopy: { color: '#555', fontSize: fonts.sizes.sm, marginTop: spacing.sm },
  roleBadge: {
    backgroundColor: '#112233', borderRadius: 20, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: '#2D3561',
  },
  roleBadgeText: { color: '#FFFFFF', fontSize: fonts.sizes.base },

  // ── Calling ──
  callingContainer: { flex: 1 },

  // 수신 자막 바 — 헤더 바로 아래 정상 흐름으로 배치 (absolute 아님)
  topSubBar: {
    backgroundColor: 'rgba(0,0,0,0.95)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 4,
    borderBottomColor: '#00FF88',
    alignItems: 'center',
  },
  topSubText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900' as any,
    textAlign: 'center',
    lineHeight: 38,
  },
  topSubTts: {
    color: '#00FF88',
    fontSize: fonts.sizes.sm,
    marginTop: 4,
    fontWeight: fonts.weights.medium,
  },

  // PC 5:5 분할
  splitRow: {
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  splitPanel: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  splitDivider: {
    width: 2,
    backgroundColor: '#2D3561',
  },
  splitLabelBox: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3561',
  },
  splitLabelText: {
    color: '#E2E8F0',
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.medium,
  },
  splitMySub: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(37,99,235,0.90)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#00FF88',
  },
  splitMySubText: {
    color: '#FFFFFF',
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
  },
  // 공통 자막 오버레이 (PC 우측 패널 / 모바일 메인 화면)
  // zIndex: 20 — video 하드웨어 가속 레이어 위에 반드시 표시되도록 강제
  subOverlayTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(0,150,80,0.90)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#00FF88',
  },
  subOverlayTopText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900' as any,
    textAlign: 'center',
    lineHeight: 34,
  },
  subOverlayBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.88)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 3,
    borderTopColor: '#60A5FA',
  },
  subOverlayBottomText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900' as any,
    textAlign: 'center',
    lineHeight: 34,
  },

  // 전송 확인 뱃지 — 실제 전송된 수어 소형 표시
  sentBadge: {
    position: 'absolute',
    top: 68,          // subOverlayTop 바로 아래
    left: 12, right: 12,
    zIndex: 25,       // subOverlayTop(20) 보다 높게
    backgroundColor: 'rgba(30,58,138,0.88)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#60A5FA',
  },
  sentBadgeText: {
    color: '#BAE6FD',
    fontSize: 13,
    fontWeight: '600' as any,
  },

  splitIncomingSub: {           // 기존 스타일 유지 (참조 보존)
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    paddingVertical: 16, paddingHorizontal: 20,
    borderTopWidth: 3, borderTopColor: '#00FF88',
  },
  splitIncomingSubText: {
    color: '#FFFFFF', fontSize: 30,
    fontWeight: '900' as any, textAlign: 'center', lineHeight: 40,
  },
  ttsActiveText: {
    color: '#00FF88',
    fontSize: fonts.sizes.sm,
    textAlign: 'center',
    marginTop: 6,
    fontWeight: fonts.weights.medium,
  },

  // 모바일 PiP
  remoteVideoBox: { flex: 1, backgroundColor: '#000', position: 'relative' },
  videoPlaceholder: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111',
  },
  videoPlaceholderText: { color: '#AAA', fontSize: fonts.sizes.xl },
  incomingSub: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.88)', paddingVertical: 14, paddingHorizontal: 16,
    borderTopWidth: 3, borderTopColor: '#00FF88',
  },
  incomingSubText: {
    color: '#FFFFFF', fontSize: 26, fontWeight: '900' as any,
    textAlign: 'center', lineHeight: 36,
  },
  localPip: {
    position: 'absolute', bottom: 16, right: 16,
    width: 100, height: 140, borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: '#2D3561', backgroundColor: '#000',
  },
  bottomPanel: { height: 150, backgroundColor: '#1A1F3A', padding: spacing.sm },
  msgEmpty: { color: '#555', fontSize: fonts.sizes.sm, textAlign: 'center', paddingVertical: 12 },
  msgList: { flex: 1 },
  // 모바일 PiP 내 상태 오버레이
  mobileMySub: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(37,99,235,0.85)',
    paddingVertical: 6, paddingHorizontal: 12,
  },
  mobileMySubText: { color: '#00FF88', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  msgBubble: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 4, maxWidth: '85%' },
  msgMe: { backgroundColor: '#2563EB', alignSelf: 'flex-end' },
  msgPartner: { backgroundColor: '#374151', alignSelf: 'flex-start' },
  msgText: { color: '#FFFFFF', fontSize: fonts.sizes.sm },
});
