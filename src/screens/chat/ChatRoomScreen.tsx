import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { io, Socket } from 'socket.io-client';
import { colors, fonts, spacing } from '@/constants';
import DeafParticipantView from '@/components/chat/DeafParticipantView';
import HearingParticipantView from '@/components/chat/HearingParticipantView';
import WaitingArea from '@/components/chat/WaitingArea';

const SERVER_URL = 'http://localhost:3001';
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type UserType = 'deaf' | 'hearing' | null;
type WebRTCStatus = 'idle' | 'connecting' | 'connected' | 'failed';

interface CaptionItem {
  id: number;
  text: string;
  type: 'gesture' | 'stt';
  isOwn: boolean;
  timestamp: number;
}

interface PartnerInfo {
  socketId: string;
  userType: string;
  userName: string;
}

interface ChatRoomScreenProps {
  roomCode: string;
  userType: UserType;
  role: 'creator' | 'joiner';
  onLeave: () => void;
}

let captionIdCounter = 0;

export default function ChatRoomScreen({ roomCode, userType, role, onLeave }: ChatRoomScreenProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const socketRef        = useRef<Socket | null>(null);
  const captionScrollRef = useRef<ScrollView>(null);
  const localStreamRef   = useRef<MediaStream | null>(null);
  const peerConnRef      = useRef<RTCPeerConnection | null>(null);
  const partnerSocketRef = useRef('');
  const roleRef          = useRef(role);

  const [partnerConnected, setPartnerConnected] = useState(false);
  const [partnerInfo, setPartnerInfo]           = useState<PartnerInfo | null>(null);
  const [captions, setCaptions]                 = useState<CaptionItem[]>([]);
  const [socketConnected, setSocketConnected]   = useState(false);
  const [webrtcStatus, setWebrtcStatus]         = useState<WebRTCStatus>('idle');
  const [remoteStream, setRemoteStream]         = useState<MediaStream | null>(null);

  const myLabel = userType === 'deaf' ? '🤟 나 (청각장애인)' : '🗣️ 나 (청인)';

  // ── WebRTC 피어 커넥션 생성 ─────────────────────────────────────
  const createPC = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate && partnerSocketRef.current) {
        socketRef.current?.emit('chat-ice-candidate', {
          targetSocketId: partnerSocketRef.current,
          candidate: e.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected')  setWebrtcStatus('connected');
      if (pc.connectionState === 'failed')     setWebrtcStatus('failed');
      if (pc.connectionState === 'disconnected') setWebrtcStatus('idle');
    };

    pc.ontrack = (e) => {
      if (e.streams[0]) setRemoteStream(e.streams[0]);
    };

    // 로컬 스트림 트랙 추가
    localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));

    return pc;
  }, []);

  // ── Offer 시작 (creator 역할) ───────────────────────────────────
  const initiateOffer = useCallback(async () => {
    if (!localStreamRef.current || !partnerSocketRef.current) return;
    setWebrtcStatus('connecting');
    try {
      const pc = createPC();
      peerConnRef.current = pc;
      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('chat-offer', { targetSocketId: partnerSocketRef.current, offer });
    } catch { setWebrtcStatus('failed'); }
  }, [createPC]);

  // ── 소켓 + WebRTC 시그널링 설정 ────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    const typeName = userType === 'deaf' ? '청각장애인' : '청인';

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join-chat-room', { roomCode, userType, userName: typeName });
    });
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('chat-member-joined', ({ members }: { members: PartnerInfo[] }) => {
      const me = socket.id;
      const partner = members.find(m => m.socketId !== me);
      if (!partner) return;
      partnerSocketRef.current = partner.socketId;
      setPartnerInfo(partner);
      setPartnerConnected(true);
      // creator이고 스트림 준비됐으면 offer 시작
      if (roleRef.current === 'creator' && localStreamRef.current) initiateOffer();
    });

    socket.on('chat-member-left', () => {
      setPartnerConnected(false);
      setPartnerInfo(null);
      partnerSocketRef.current = '';
      peerConnRef.current?.close();
      peerConnRef.current = null;
      setWebrtcStatus('idle');
      addCaption('상대방이 대화방을 나갔습니다', 'stt', false);
    });

    // Offer 수신 (joiner)
    socket.on('chat-offer-received', async ({ offer, fromSocketId }: { offer: RTCSessionDescriptionInit; fromSocketId: string }) => {
      partnerSocketRef.current = fromSocketId;
      setWebrtcStatus('connecting');
      try {
        const pc = createPC();
        peerConnRef.current = pc;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('chat-answer', { targetSocketId: fromSocketId, answer });
      } catch { setWebrtcStatus('failed'); }
    });

    // Answer 수신 (creator)
    socket.on('chat-answer-received', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      try { await peerConnRef.current?.setRemoteDescription(new RTCSessionDescription(answer)); }
      catch { setWebrtcStatus('failed'); }
    });

    // ICE Candidate
    socket.on('chat-ice-candidate-received', async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      try { await peerConnRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch { /* ignore stale candidates */ }
    });

    // 자막 수신
    socket.on('chat-gesture-received', ({ gesture }: { gesture: string }) => {
      addCaption(gesture, 'gesture', false);
      speakText(gesture);
    });
    socket.on('chat-stt-received', ({ text }: { text: string }) => {
      addCaption(text, 'stt', false);
    });

    return () => {
      socket.emit('leave-chat-room', { roomCode });
      socket.disconnect();
      peerConnRef.current?.close();
    };
  }, [roomCode, userType, createPC, initiateOffer]);

  // ── 로컬 스트림 준비 콜백 ───────────────────────────────────────
  const handleStreamReady = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    // joiner인데 이미 offer를 못 받은 경우, creator가 이후 offer를 보낼 것이므로 대기
    // creator이고 상대가 이미 들어와 있으면 offer 시작
    if (roleRef.current === 'creator' && partnerSocketRef.current) initiateOffer();
  }, [initiateOffer]);

  const addCaption = (text: string, type: 'gesture' | 'stt', isOwn: boolean) => {
    setCaptions(prev => [...prev, { id: captionIdCounter++, text, type, isOwn, timestamp: Date.now() }]);
    setTimeout(() => captionScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const speakText = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'ko-KR'; utt.rate = 1.1;
      window.speechSynthesis.speak(utt);
    }
  };

  const handleGestureRecognized = (gesture: string) => {
    socketRef.current?.emit('chat-gesture', { roomCode, gesture, timestamp: Date.now() });
    addCaption(gesture, 'gesture', true);
  };

  const handleSpeechResult = (text: string) => {
    socketRef.current?.emit('chat-stt', { roomCode, text, timestamp: Date.now() });
    addCaption(text, 'stt', true);
  };

  const partnerLabel = partnerInfo
    ? (partnerInfo.userType === 'deaf' ? '🤟 상대방 (청각장애인)' : '🗣️ 상대방 (청인)')
    : '상대방';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 헤더 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>1:1 대화방</Text>
          <Text style={styles.headerCode}>코드: {roomCode}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.connDot, { backgroundColor: socketConnected ? '#4ade80' : '#f87171' }]} />
          <TouchableOpacity style={styles.leaveBtn} onPress={onLeave}>
            <Text style={styles.leaveBtnText}>나가기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 메인 영역 */}
      <View style={[styles.mainArea, isWide ? styles.mainRow : styles.mainCol]}>

        {/* 좌측: 내 화면 */}
        <View style={[styles.myPanel, isWide ? styles.myPanelWide : styles.myPanelNarrow]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelLabel}>{myLabel}</Text>
          </View>
          <View style={styles.participantView}>
            {userType === 'deaf'
              ? <DeafParticipantView onGestureRecognized={handleGestureRecognized} onStreamReady={handleStreamReady} />
              : <HearingParticipantView onSpeechResult={handleSpeechResult} onStreamReady={handleStreamReady} />
            }
          </View>
        </View>

        {/* 우측: 상대방 화면 */}
        <View style={[styles.partnerPanel, isWide ? styles.partnerPanelWide : styles.partnerPanelNarrow]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelLabel}>{partnerLabel}</Text>
            {webrtcStatus === 'connected' && (
              <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● LIVE</Text></View>
            )}
            {webrtcStatus === 'connecting' && (
              <View style={styles.connectingBadge}><Text style={styles.connectingBadgeText}>연결 중...</Text></View>
            )}
          </View>
          <View style={styles.participantView}>
            {!partnerConnected
              ? <WaitingArea roomCode={roomCode} />
              : <RemoteVideoView stream={remoteStream} status={webrtcStatus} partnerInfo={partnerInfo} captions={captions} />
            }
          </View>
        </View>
      </View>

      {/* 자막 바 */}
      <View style={styles.captionBar}>
        <Text style={styles.captionBarTitle}>대화 내역</Text>
        <ScrollView ref={captionScrollRef} style={styles.captionScroll} showsVerticalScrollIndicator={false}>
          {captions.length === 0 && (
            <Text style={styles.emptyCaptions}>아직 인식된 내용이 없습니다</Text>
          )}
          {captions.map(c => (
            <View key={c.id} style={[styles.captionItem, c.isOwn ? styles.captionOwn : styles.captionPartner]}>
              <Text style={styles.captionType}>{c.type === 'gesture' ? '🤟' : '🗣️'}</Text>
              <Text style={styles.captionText}>{c.text}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// ── 상대방 영상 뷰 ──────────────────────────────────────────────────
function RemoteVideoView({
  stream, status, partnerInfo, captions,
}: {
  stream: MediaStream | null;
  status: WebRTCStatus;
  partnerInfo: PartnerInfo | null;
  captions: CaptionItem[];
}) {
  const videoRef = useRef<any>(null);
  const [videoReady, setVideoReady] = useState(false);
  const partnerCaptions = captions.filter(c => !c.isOwn).slice(-3);

  useEffect(() => {
    if (videoRef.current && stream) {
      const video = videoRef.current as HTMLVideoElement;
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    if (!stream) setVideoReady(false);
  }, [stream]);

  return (
    <View style={rv.container}>
      {/* 원격 영상: 재생 준비 완료 후 표시 (반전 깜빡임 방지) */}
      {/* @ts-ignore */}
      <video
        ref={videoRef}
        style={{ ...rv.video, opacity: videoReady ? 1 : 0 } as any}
        autoPlay
        playsInline
        onCanPlay={() => setVideoReady(true)}
      />

      {/* 연결 전 오버레이 */}
      {status !== 'connected' && (
        <View style={rv.overlay}>
          <Text style={rv.overlayEmoji}>{partnerInfo?.userType === 'deaf' ? '🤟' : '🗣️'}</Text>
          <Text style={rv.overlayName}>{partnerInfo?.userName || '상대방'}</Text>
          <Text style={rv.overlayStatus}>
            {status === 'connecting' ? '영상 연결 중...' : status === 'failed' ? '연결 실패' : '접속됨'}
          </Text>
        </View>
      )}

      {/* 수신 자막 오버레이 */}
      {partnerCaptions.length > 0 && (
        <View style={rv.captionOverlay}>
          {partnerCaptions.map(c => (
            <Text key={c.id} style={rv.captionText}>{c.text}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const rv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', borderRadius: 12, overflow: 'hidden', position: 'relative' as any },
  video: { width: '100%', height: '100%', objectFit: 'cover' as any, transform: 'scaleX(-1)' as any } as any,
  overlay: {
    position: 'absolute' as any, inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  overlayEmoji: { fontSize: 48, marginBottom: spacing.sm },
  overlayName: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.semibold, color: '#fff', marginBottom: 4 },
  overlayStatus: { fontSize: fonts.sizes.sm, color: 'rgba(255,255,255,0.6)' },
  captionOverlay: {
    position: 'absolute' as any, bottom: 8, left: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8, padding: 8,
  },
  captionText: { color: '#fff', fontSize: fonts.sizes.base, fontWeight: fonts.weights.medium, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: '#1a1a2e',
  },
  headerTitle: { fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, color: '#fff' },
  headerCode: { fontSize: fonts.sizes.sm, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  connDot: { width: 8, height: 8, borderRadius: 4 },
  leaveBtn: { backgroundColor: colors.error.main, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 6 },
  leaveBtnText: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  mainArea: { flex: 1, padding: spacing.sm, gap: spacing.sm },
  mainRow: { flexDirection: 'row' },
  mainCol: { flexDirection: 'column' },
  myPanel: { overflow: 'hidden' },
  myPanelWide: { flex: 1 },
  myPanelNarrow: { flex: 1 },
  partnerPanel: { overflow: 'hidden' },
  partnerPanelWide: { flex: 1 },
  partnerPanelNarrow: { flex: 1 },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.sm, paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 4,
  },
  panelLabel: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium, color: 'rgba(255,255,255,0.8)' },
  liveBadge: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  liveBadgeText: { fontSize: fonts.sizes.xs, color: '#fff', fontWeight: fonts.weights.bold },
  connectingBadge: { backgroundColor: colors.warning.main, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  connectingBadgeText: { fontSize: fonts.sizes.xs, color: '#fff', fontWeight: fonts.weights.medium },
  participantView: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  captionBar: {
    height: 110, backgroundColor: '#1a1a2e',
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  captionBarTitle: { fontSize: fonts.sizes.sm, color: 'rgba(255,255,255,0.5)', marginBottom: 6 },
  captionScroll: { flex: 1 },
  emptyCaptions: { fontSize: fonts.sizes.sm, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
  captionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, marginBottom: 4,
  },
  captionOwn: { backgroundColor: 'rgba(37,99,235,0.3)', alignSelf: 'flex-end' },
  captionPartner: { backgroundColor: 'rgba(124,58,237,0.3)', alignSelf: 'flex-start' },
  captionType: { fontSize: fonts.sizes.sm },
  captionText: { fontSize: fonts.sizes.base, color: '#fff', fontWeight: fonts.weights.medium },
});
