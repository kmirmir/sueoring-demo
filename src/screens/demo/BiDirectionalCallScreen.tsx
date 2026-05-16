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

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
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
  // 헤더(~56px) + 하단 패널(220px) 제외한 영상 영역 높이
  const remoteVideoHeight = Math.max(screenHeight - 56 - 220, 200);

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

  // Refs
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const remoteVideoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const subClearTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsPlayingRef     = useRef(false); // TTS 재생 중 플래그 → STT 에코 차단용
  const socketRef       = useRef<Socket | null>(null);
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const dcRef           = useRef<RTCDataChannel | null>(null);
  const handsRef        = useRef<any>(null);
  const recognitionRef  = useRef<any>(null);
  const sttActiveRef    = useRef(false);  // STT 재시작 플래그
  const animFrameRef    = useRef<number | null>(null);
  const workingCdnRef   = useRef<string>(CDN_PROVIDERS[0]);
  const currentRoomRef  = useRef('');
  const messagesEndRef  = useRef<View>(null);

  // ── 정리 ────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    animFrameRef.current && cancelAnimationFrame(animFrameRef.current);
    sttActiveRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* 무시 */ }
    handsRef.current?.close?.();
    dcRef.current?.close();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current  = null;
    remoteStreamRef.current = null;
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

      // 자막: 이전 timeout 취소 후 새로 시작 → 연속 메시지 때 조기 삭제 방지
      if (subClearTimerRef.current) clearTimeout(subClearTimerRef.current);
      setCurrentSub(text);
      subClearTimerRef.current = setTimeout(() => setCurrentSub(''), 5000);

      setMessages(prev => [...prev, { text, from: 'partner', ts: Date.now() }]);

      // 청인: 수어 자막 수신 시 TTS 즉시 재생 + isSpeaking 연동
      if (role === 'hearing' && Platform.OS === 'web' && 'speechSynthesis' in window) {
        const synth = window.speechSynthesis;
        synth.cancel();  // 이전 발화 즉시 중단, 큐 비움
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang    = 'ko-KR';
        utt.rate    = 1.15;
        utt.pitch   = 1.0;
        utt.volume  = 1.0;
        utt.onstart = () => {
          setIsSpeaking(true);
          ttsPlayingRef.current = true;
          // TTS 재생 중 청인 마이크 뮤트
          // → TTS 음성이 마이크로 캡처되어 WebRTC로 농인에게 전달되는 에코 차단
          localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
          // STT도 중단 (에코 오인식 방지)
          try { recognitionRef.current?.abort(); } catch { /* 무시 */ }
        };
        utt.onend = () => {
          setIsSpeaking(false);
          ttsPlayingRef.current = false;
          // TTS 종료 후 마이크 다시 활성화 → 청인 목소리 농인에게 정상 전달 재개
          localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = true; });
          // STT는 onend 핸들러가 자동 재시작
        };
        utt.onerror = () => {
          setIsSpeaking(false);
          ttsPlayingRef.current = false;
          localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = true; });
        };
        requestAnimationFrame(() => {
          if (synth.paused) synth.resume();
          synth.speak(utt);
        });
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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // ICE candidate → 시그널링 서버 중계
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit('room-ice', { roomCode: code, candidate });
    };

    // ICE 연결 상태 변화 → 양쪽 모두 connStatus 업데이트
    // room-answer 이벤트는 initiator에서만 처리되므로 이쪽으로 통일
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setConnStatus('idle');
      }
    };

    // 원격 영상 스트림 수신
    // streams[0]이 비어있는 브라우저 대응: 개별 track으로 MediaStream 직접 생성
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      remoteStreamRef.current = stream;
      setRemoteStream(stream);  // state 변경 → useEffect 재실행 → video 연결
    };

    // DataChannel 수신 (비창시자)
    pc.ondatachannel = ({ channel }) => setupDataChannel(channel);

    return pc;
  }, [setupDataChannel]);

  // ── Socket.IO 연결 & 시그널링 ────────────────────────────
  const connectSocket = useCallback((code: string, _initiator: boolean) => {
    const socket = io(SIGNAL_SERVER, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    currentRoomRef.current = code;

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket.id);
      setConnStatus('connecting');
    });

    // 두 번째 참여자 입장 → initiator가 offer 생성
    socket.on('room-ready', async ({ isInitiator }: { isInitiator: boolean; partnerRole: Role }) => {
      setPhase('calling');
      const pc = createPeerConnection(code);

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

    // Offer 수신 → Answer 생성
    socket.on('room-offer', async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current!;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('room-answer', { roomCode: code, answer });
    });

    // Answer 수신
    socket.on('room-answer', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(answer));
      setConnStatus('connected');
    });

    // ICE Candidate 수신
    socket.on('room-ice', ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // 파트너 퇴장
    socket.on('room-partner-left', () => {
      setConnStatus('idle');
      setCurrentSub('상대방이 통화를 종료했습니다.');
    });

    // 방 가득 참
    socket.on('room-full', () => setError('이미 2명이 참여한 방입니다.'));
  }, [createPeerConnection, setupDataChannel]);

  // ── 카메라 시작 ──────────────────────────────────────────
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
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
      const bx = minX * canvas.width,  by = minY * canvas.height;
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
        // DataChannel로 전송
        if (dcRef.current?.readyState === 'open') {
          dcRef.current.send(JSON.stringify({ type: 'gesture', text: gesture }));
          setMessages(prev => {
            // 동일 제스처 연속 추가 방지 (1초 이내)
            const last = prev[prev.length - 1];
            if (last && last.from === 'me' && last.text === gesture && Date.now() - last.ts < 1000) return prev;
            return [...prev, { text: gesture, from: 'me', ts: Date.now() }];
          });
        }
      } else {
        setGestureLabel('');
      }
    });

    handsRef.current = hands;
    setMpLoaded(true);

    const processFrame = async () => {
      if (localVideoRef.current && handsRef.current) {
        await handsRef.current.send({ image: localVideoRef.current });
      }
      animFrameRef.current = requestAnimationFrame(processFrame);
    };
    processFrame();
  };

  // ── Web Speech API STT (청인 전용) ───────────────────────
  const initSTT = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('음성 인식을 지원하지 않습니다. Chrome 브라우저를 사용해주세요.'); return; }

    sttActiveRef.current = true;

    const startRecognition = () => {
      // TTS 재생 중이면 STT 시작 거부 → 에코 방지
      if (!sttActiveRef.current || ttsPlayingRef.current) return;

      const recognition = new SR();
      // WebRTC 마이크 점유 후 SpeechRecognition이 동일 트랙을 사용하도록
      // lang을 명시적으로 'ko-KR'로 강제 설정
      recognition.lang = 'ko-KR';
      recognition.continuous = false;       // false로 설정 후 onend 재시작이 더 안정적
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;      // 여러 후보로 인식률 향상

      recognition.onresult = (e: any) => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          // maxAlternatives 중 신뢰도 가장 높은 첫 번째 선택
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }
        setSttLive(interim);
        if (final.trim()) {
          setSttLive('');
          const text = final.trim();
          setMessages(prev => [...prev, { text, from: 'me', ts: Date.now() }]);
          if (dcRef.current?.readyState === 'open') {
            dcRef.current.send(JSON.stringify({ type: 'speech', text }));
          }
        }
      };

      // 한 세션 종료 후 즉시 재시작 (continuous 대신 이 방식이 더 안정적)
      recognition.onend = () => { if (sttActiveRef.current) setTimeout(startRecognition, 150); };

      recognition.onerror = (e: any) => {
        if (e.error === 'aborted' || e.error === 'interrupted') return;
        if (sttActiveRef.current) {
          const delay = e.error === 'no-speech' ? 150 : 1000;
          setTimeout(startRecognition, delay);
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
      } catch { /* 동시 시작 방지 */ }
    };

    // WebRTC 마이크 획득 직후 바로 시작하면 충돌 가능 → 500ms 딜레이
    setTimeout(startRecognition, 500);
  };

  // ── 방 만들기 ────────────────────────────────────────────
  const handleCreateRoom = async () => {
    setError('');
    const code = generateRoomCode();
    setRoomCode(code);
    setIsCreator(true);
    try {
      await startCamera();
      setPhase('waiting');
      connectSocket(code, true);
      socketRef.current?.emit('room-join', { roomCode: code, role });
    } catch { /* 에러는 startCamera에서 처리 */ }
  };

  // ── 방 입장 ──────────────────────────────────────────────
  const handleJoinRoom = async () => {
    const code = inputCode.trim().toUpperCase();
    if (code.length < 4) { setError('방 코드를 입력해주세요.'); return; }
    setError('');
    setRoomCode(code);
    setIsCreator(false);
    try {
      await startCamera();
      setPhase('waiting');
      connectSocket(code, false);
      socketRef.current?.emit('room-join', { roomCode: code, role });
    } catch { /* 에러는 startCamera에서 처리 */ }
  };

  // calling 단계 진입 시: 로컬 PiP 스트림 재연결 + 역할별 기능 초기화
  useEffect(() => {
    if (phase !== 'calling') return;

    // requestAnimationFrame: DOM이 완전히 그려진 뒤 video에 스트림 연결
    requestAnimationFrame(() => {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
    });

    if (role === 'deaf') {
      initMediaPipe().catch(e => setError(`MediaPipe 로드 실패: ${e.message}`));
    } else {
      initSTT();
    }
  }, [phase]); // eslint-disable-line

  // 원격 스트림 도착 시 즉시 video에 연결
  // (ontrack 타이밍이 phase useEffect 이후일 수 있으므로 별도 effect 필수)
  useEffect(() => {
    if (!remoteStream) return;
    requestAnimationFrame(() => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        // 농인 화면에서 청인 목소리(WebRTC 오디오) 정상 재생
        // 에코 방지는 청인 마이크를 TTS 재생 중에만 뮤트하는 방식으로 처리
        remoteVideoRef.current.play().catch(() => {});
      }
    });
  }, [remoteStream]);

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
        <View style={[styles.connDot, connStatus === 'connected' && styles.connDotOn,
          connStatus === 'connecting' && styles.connDotWait]} />
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
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
              />
            )}
          </View>

          <View style={styles.waitingInfo}>
            <Text style={styles.waitingTitle}>📡 파트너 대기 중...</Text>
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
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <canvas
                      ref={canvasRef as any}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    />
                  </>
                )}
                {/* 내 송신 자막 (하단) */}
                {(gestureLabel || sttLive) && (
                  <View style={styles.splitMySub}>
                    <Text style={styles.splitMySubText} numberOfLines={1}>
                      {role === 'deaf' ? `🤟 ${gestureLabel}` : `🗣️ ${sttLive}`}
                    </Text>
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
                {Platform.OS === 'web' && (
                  <video
                    ref={remoteVideoRef as any}
                    autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {connStatus !== 'connected' && (
                  <View style={styles.videoPlaceholder}>
                    <Text style={styles.videoPlaceholderText}>⏳ 연결 중...</Text>
                  </View>
                )}
                {/* 상대방 영상 위 자막 오버레이 */}
                {!!currentSub && (
                  <View style={styles.splitIncomingSub}>
                    <Text style={styles.splitIncomingSubText}>{currentSub}</Text>
                    {/* 청인: TTS 재생 중 표시 */}
                    {role === 'hearing' && isSpeaking && (
                      <Text style={styles.ttsActiveText}>🔊 음성 변환 중...</Text>
                    )}
                    {/* 농인: 청인 음성 수신 안내 */}
                    {role === 'deaf' && (
                      <Text style={styles.ttsActiveText}>💬 청인 음성</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          ) : (
            /* ── 모바일: PiP 레이아웃 유지 ── */
            <View style={[styles.remoteVideoBox, { height: remoteVideoHeight }]}>
              {Platform.OS === 'web' && (
                <video
                  ref={remoteVideoRef as any}
                  autoPlay playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
              {connStatus !== 'connected' && (
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.videoPlaceholderText}>⏳ 연결 중...</Text>
                </View>
              )}
              {!!currentSub && (
                <View style={styles.incomingSub}>
                  <Text style={styles.incomingSubText}>{currentSub}</Text>
                  {role === 'hearing' && isSpeaking && (
                    <Text style={styles.ttsActiveText}>🔊 음성 변환 중...</Text>
                  )}
                </View>
              )}
              <View style={styles.localPip}>
                {Platform.OS === 'web' && (
                  <>
                    <video
                      ref={localVideoRef as any}
                      autoPlay playsInline muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                    />
                    <canvas
                      ref={canvasRef as any}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 8 }}
                    />
                  </>
                )}
              </View>
            </View>
          )}

          {/* 하단 패널 */}
          <View style={styles.bottomPanel}>

            {/* 내가 보낸 현재 내용 */}
            <View style={styles.mySubRow}>
              {role === 'deaf' ? (
                <Text style={styles.mySubText} numberOfLines={1}>
                  🤟 {gestureLabel || (mpLoaded ? '수어 인식 중...' : 'MediaPipe 로딩 중...')}
                </Text>
              ) : (
                <Text style={styles.mySubText} numberOfLines={1}>
                  🗣️ {sttLive || '말하면 자막으로 전송됩니다...'}
                </Text>
              )}
            </View>

            {/* 대화 기록 */}
            <ScrollView style={styles.msgList} contentContainerStyle={{ paddingVertical: 4 }}>
              {messages.map((m, i) => (
                <View key={i} style={[styles.msgBubble, m.from === 'me' ? styles.msgMe : styles.msgPartner]}>
                  <Text style={styles.msgText}>{m.from === 'me' ? '나' : '상대방'}: {m.text}</Text>
                </View>
              ))}
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
  splitIncomingSub: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 3,
    borderTopColor: '#00FF88',
  },
  splitIncomingSubText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900' as any,
    textAlign: 'center',
    lineHeight: 40,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
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
  bottomPanel: { height: 220, backgroundColor: '#1A1F3A', padding: spacing.md },
  mySubRow: {
    backgroundColor: '#252B48', borderRadius: 8, padding: spacing.md, marginBottom: spacing.sm,
  },
  mySubText: { color: '#00FF88', fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium },
  msgList: { flex: 1 },
  msgBubble: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 4, maxWidth: '85%' },
  msgMe: { backgroundColor: '#2563EB', alignSelf: 'flex-end' },
  msgPartner: { backgroundColor: '#374151', alignSelf: 'flex-start' },
  msgText: { color: '#FFFFFF', fontSize: fonts.sizes.sm },
});
