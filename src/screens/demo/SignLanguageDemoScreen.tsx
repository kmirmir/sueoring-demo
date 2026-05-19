/**
 * SignLanguageDemoScreen - 가상 Demo 시연 화면
 *
 * [농인 화면] 실제 카메라 + MediaPipe 수어 인식 → 제스처 텍스트 추출
 * [청인 화면] 가상 캐릭터 + 실시간 자막 표시 + TTS 음성 재생
 *
 * 실제 카메라로 수어를 인식하고, 청인 화면(가상)에 자막과 음성으로 전달하는
 * 시연용 화면입니다. WebRTC 없이 단일 화면에서 양방향 경험을 데모합니다.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

// ── CDN 설정 (RealSignLanguageScreen과 동일) ────────────
const MEDIAPIPE_HANDS_VERSION   = '0.4.1675469240';
const MEDIAPIPE_DRAWING_VERSION = '0.3.1675466124';
const CDN_PROVIDERS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
] as const;

// 가상 청인 캐릭터 정보
const VIRTUAL_PERSON = {
  name: '김청인 (가상)',
  emoji: '🧑‍💼',
  idleMsg: '수어를 보내면 자막과 음성으로 받습니다...',
};

interface SignLanguageDemoScreenProps {
  onBack?: () => void;
}

export default function SignLanguageDemoScreen({ onBack }: SignLanguageDemoScreenProps = {}) {
  const { width: screenWidth } = useWindowDimensions();
  const isMobileWeb = Platform.OS === 'web' && (
    /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && screenWidth < 1024)
  );

  // ── 상태 ──────────────────────────────────────────────
  // 화면 너비 기반 동적 비디오 높이 계산
  // 데스크탑: 패널 너비 × 0.75 (4:3 비율), 최대 480px
  // 모바일: 패널 너비 × 1.33 (3:4 세로 비율), 최대 450px — 세로 서명 동작 포착에 유리
  const panelWidth = isMobileWeb
    ? screenWidth - spacing.md * 2
    : Math.floor((screenWidth - spacing.md * 3) / 2);
  const videoBoxHeight = isMobileWeb
    ? Math.min(Math.floor(panelWidth * (4 / 3)), 450)
    : Math.min(Math.floor(panelWidth * (3 / 4)), 480);

  const [isCameraActive, setIsCameraActive]   = useState(false);
  const [cameraError, setCameraError]         = useState<string>('');
  const [aiStage, setAiStage]                 = useState<'idle'|'loading'|'ready'>('idle');
  const [fps, setFps]                         = useState(0);
  const [handDetected, setHandDetected]       = useState(false);

  // 제스처 인식 & 자막
  const [currentGesture, setCurrentGesture]   = useState('');   // 농인 측 현재 인식
  const [latestSubtitle, setLatestSubtitle]   = useState('');   // 청인 측 최신 자막
  const [subtitleHistory, setSubtitleHistory] = useState<Array<{text: string; ts: number}>>([]);
  const [isSpeaking, setIsSpeaking]           = useState(false);

  // ── Refs ──────────────────────────────────────────────
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const handsRef     = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const workingCdnRef = useRef<string>(CDN_PROVIDERS[0]);
  const isPortraitRef = useRef(false);

  // 제스처 안정화
  const stabilityBufRef    = useRef<string[]>([]);
  const lastGestureRef     = useRef('');
  const lastGestureTimeRef = useRef(0);
  // 바운딩 박스 EMA 스무딩 (떨림 방지)
  const bbSmoothRef = useRef({ x: -1, y: 0, w: 0, h: 0 });
  const BB_ALPHA    = 0.25;
  const fpsCountRef        = useRef(0);
  const fpsTimeRef         = useRef(Date.now());
  const STABILITY_FRAMES   = 12;  // 5 → 12 (약 0.8초 유지 필요)
  const COOLDOWN_MS        = 2500; // 1200 → 2500ms

  // ── 정리 ──────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    animFrameRef.current && cancelAnimationFrame(animFrameRef.current);
    handsRef.current?.close?.();
    handsRef.current = null;
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setAiStage('idle');
    setHandDetected(false);
    setCurrentGesture('');
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── 스크립트 로더 ──────────────────────────────────────
  const loadScript = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      const t = setTimeout(() => { s.remove(); reject(new Error(`timeout: ${src}`)); }, 15000);
      s.onload  = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); s.remove(); reject(); };
      document.head.appendChild(s);
    });

  const loadWithFallback = async (path: string) => {
    for (const cdn of CDN_PROVIDERS) {
      try { await loadScript(`${cdn}/${path}`); workingCdnRef.current = cdn; return; }
      catch { /* 다음 CDN */ }
    }
    throw new Error(`CDN 로드 실패: ${path}`);
  };

  // ── TTS ───────────────────────────────────────────────
  const speak = (text: string) => {
    if (Platform.OS !== 'web' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'ko-KR'; utt.rate = 1.1; utt.pitch = 1.0;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend   = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    setTimeout(() => window.speechSynthesis.speak(utt), 50);
  };

  // ── 제스처 확정 처리 ──────────────────────────────────
  const finalizeGesture = useCallback((gesture: string) => {
    const now = Date.now();
    if (gesture === lastGestureRef.current && now - lastGestureTimeRef.current < COOLDOWN_MS) return;
    lastGestureRef.current     = gesture;
    lastGestureTimeRef.current = now;

    setLatestSubtitle(gesture);
    setSubtitleHistory(prev => [...prev, { text: gesture, ts: now }]);
    speak(gesture);
    stabilityBufRef.current = [];
  }, []);

  // ── MediaPipe 결과 처리 ────────────────────────────────
  const onResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    // FPS 계산
    fpsCountRef.current++;
    const now = Date.now();
    if (now - fpsTimeRef.current >= 1000) {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
      fpsTimeRef.current  = now;
    }

    // Canvas 크기 맞춤
    const vw = (results.image as HTMLVideoElement).videoWidth  || canvas.clientWidth;
    const vh = (results.image as HTMLVideoElement).videoHeight || canvas.clientHeight;
    if (canvas.width !== canvas.clientWidth)  canvas.width  = canvas.clientWidth;
    if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;

    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const ox = (canvas.width  - vw * scale) / 2;
    const oy = (canvas.height - vh * scale) / 2;
    // scaleX(-1)은 video에만 적용 → canvas에서 x 좌표를 직접 반전
    const toPx = (nx: number, ny: number) => ({ x: (1 - nx) * vw * scale + ox, y: ny * vh * scale + oy });

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 영상 미러 반전 — ctx 수준에서 좌우 flip (video CSS scaleX(-1)와 동일 효과)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, ox, oy, vw * scale, vh * scale);
    ctx.restore();

    if (!results.multiHandLandmarks?.length) {
      setHandDetected(false);
      setCurrentGesture('');
      stabilityBufRef.current = [];
      bbSmoothRef.current.x = -1; // 손 소실 시 스무딩 초기화
      ctx.restore();
      return;
    }

    setHandDetected(true);
    const landmarks = results.multiHandLandmarks[0];

    // 랜드마크 + 연결선 그리기
    if (window.drawConnectors && window.HAND_CONNECTIONS) {
      const scaled = landmarks.map((lm: any) => {
        const { x, y } = toPx(lm.x, lm.y);
        return { ...lm, x: x / canvas.width, y: y / canvas.height };
      });
      window.drawConnectors(ctx, scaled, window.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
      window.drawLandmarks(ctx, scaled, { color: '#FF0000', lineWidth: 2, radius: 4 });
    }

    // 바운딩 박스 원시 좌표 계산
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    landmarks.forEach((lm: any) => {
      minX = Math.min(minX, lm.x); minY = Math.min(minY, lm.y);
      maxX = Math.max(maxX, lm.x); maxY = Math.max(maxY, lm.y);
    });
    const { x: rawBx, y: rawBy } = toPx(maxX, minY);
    const rawBw = (maxX - minX) * vw * scale;
    const rawBh = (maxY - minY) * vh * scale;

    // EMA 스무딩 적용
    const bb = bbSmoothRef.current;
    if (bb.x < 0) { bb.x = rawBx; bb.y = rawBy; bb.w = rawBw; bb.h = rawBh; }
    else {
      bb.x = BB_ALPHA * rawBx + (1 - BB_ALPHA) * bb.x;
      bb.y = BB_ALPHA * rawBy + (1 - BB_ALPHA) * bb.y;
      bb.w = BB_ALPHA * rawBw + (1 - BB_ALPHA) * bb.w;
      bb.h = BB_ALPHA * rawBh + (1 - BB_ALPHA) * bb.h;
    }
    ctx.strokeStyle = '#00FF88'; ctx.lineWidth = 3;
    ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);

    // 제스처 인식
    const gesture = recognizeGesture(landmarks, isPortraitRef.current);
    setCurrentGesture(gesture || '');

    if (gesture) {
      // 라벨
      ctx.fillStyle = 'rgba(0,255,136,0.88)';
      ctx.fillRect(bb.x, bb.y - 40, Math.max(bb.w, 130), 36);
      ctx.fillStyle = '#000'; ctx.font = 'bold 20px Arial';
      ctx.fillText(gesture, bb.x + 8, bb.y - 12);

      // 안정화 필터
      stabilityBufRef.current.push(gesture);
      if (stabilityBufRef.current.length > 10) stabilityBufRef.current.shift();
      const recent = stabilityBufRef.current.slice(-STABILITY_FRAMES);
      if (recent.length === STABILITY_FRAMES && recent.every(g => g === gesture)) {
        finalizeGesture(gesture);
      }
    } else {
      stabilityBufRef.current = [];
    }

    ctx.restore();
  }, [finalizeGesture]);

  // ── 카메라 + MediaPipe 시작 ────────────────────────────
  const startCamera = async () => {
    if (Platform.OS !== 'web') return;
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isMobileWeb
          ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
        audio: false,
      });

      if (!videoRef.current || !canvasRef.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      video.srcObject = stream;

      await new Promise<void>(resolve => {
        video.onloadedmetadata = () => {
          isPortraitRef.current = video.videoWidth < video.videoHeight;
          requestAnimationFrame(() => {
            canvas.width  = canvas.clientWidth  || 640;
            canvas.height = canvas.clientHeight || 450;
            resolve();
          });
        };
      });
      await video.play();
      setIsCameraActive(true);

      // MediaPipe 로드
      setAiStage('loading');
      await Promise.all([
        loadWithFallback(`@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/hands.js`),
        loadWithFallback(`@mediapipe/drawing_utils@${MEDIAPIPE_DRAWING_VERSION}/drawing_utils.js`),
      ]);

      const hands = new window.Hands({
        locateFile: (f: string) =>
          `${workingCdnRef.current}/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/${f}`,
      });
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: isMobileWeb ? 0 : 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      hands.onResults(onResults);
      handsRef.current = hands;
      setAiStage('ready');

      const loop = async () => {
        if (videoRef.current && handsRef.current) {
          await handsRef.current.send({ image: videoRef.current });
        }
        if (videoRef.current?.srcObject) {
          animFrameRef.current = requestAnimationFrame(loop);
        }
      };
      loop();

    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('카메라 권한을 허용해주세요.');
      } else {
        setCameraError('카메라를 시작할 수 없습니다. 다시 시도해주세요.');
      }
    }
  };

  const clearSubtitles = () => {
    setSubtitleHistory([]);
    setLatestSubtitle('');
    window.speechSynthesis?.cancel();
  };

  // ── 렌더 ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 헤더 */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← 홈으로</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>🤟 가상 Demo 시연</Text>
        <Text style={styles.headerSubtitle}>수어 인식 → 가상 청인 자막 · 음성 전달</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* 상태 바 */}
        <View style={styles.statusBar}>
          <Text style={[styles.statusItem, handDetected && styles.statusOn]}>
            {handDetected ? '✋ 손 감지' : '❌ 손 없음'}
          </Text>
          <Text style={styles.statusItem}>
            {aiStage === 'idle' ? '⚫ AI 대기'
              : aiStage === 'loading' ? '⏳ AI 로딩...'
              : '🟢 AI 준비'}
          </Text>
          <Text style={[styles.statusItem, isSpeaking && styles.statusSpeaking]}>
            {isSpeaking ? '🔊 음성 재생' : '🔇 대기'}
          </Text>
          <Text style={styles.statusItem}>FPS {fps}</Text>
        </View>

        {/* 2분할 화면 */}
        <View style={[styles.screens, isMobileWeb && styles.screensMobile]}>

          {/* ── 농인 화면 ── */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>👤 농인 (수어 송신)</Text>
              <View style={[styles.badge, isCameraActive && styles.badgeOn]}>
                <Text style={styles.badgeText}>{isCameraActive ? '🔴 ON' : '⚫ OFF'}</Text>
              </View>
            </View>

            {/* 카메라 + Canvas */}
            <View style={[styles.videoBox, { height: videoBoxHeight }]}>
              {Platform.OS === 'web' && (
                <>
                  <video
                    ref={videoRef as any}
                    autoPlay playsInline muted
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                  />
                  <canvas
                    ref={canvasRef as any}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  />
                </>
              )}

              {/* 카메라 꺼짐 안내 */}
              {!isCameraActive && (
                <View style={styles.videoOff}>
                  <Text style={styles.videoOffEmoji}>📷</Text>
                  {cameraError
                    ? <Text style={styles.videoOffError}>{cameraError}</Text>
                    : <Text style={styles.videoOffText}>카메라를 시작하세요</Text>}
                </View>
              )}

              {/* AI 로딩 배지 */}
              {isCameraActive && aiStage === 'loading' && (
                <View style={styles.loadingBadge}>
                  <Text style={styles.loadingText}>⏳ MediaPipe 로딩 중...</Text>
                </View>
              )}

              {/* 현재 인식 제스처 */}
              {currentGesture && aiStage === 'ready' && (
                <View style={styles.gestureBadge}>
                  <Text style={styles.gestureText}>🤟 {currentGesture}</Text>
                </View>
              )}
            </View>

            {/* 카메라 버튼 */}
            <TouchableOpacity
              style={[styles.camBtn, isCameraActive && styles.camBtnStop]}
              onPress={isCameraActive ? stopCamera : startCamera}
            >
              <Text style={styles.camBtnText}>
                {isCameraActive ? '⏹ 카메라 중지' : '📹 카메라 시작 & 수어 인식'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── 청인 화면 (가상) ── */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>🧑‍💼 청인 (가상 수신)</Text>
              <View style={[styles.badge, isSpeaking && styles.badgeSpeaking]}>
                <Text style={styles.badgeText}>{isSpeaking ? '🔊 재생' : '🔇 대기'}</Text>
              </View>
            </View>

            {/* 가상 캐릭터 영역 */}
            <View style={[styles.avatarBox, { height: videoBoxHeight }]}>
              {/* 배경 그라디언트 느낌 */}
              <View style={styles.avatarBg} />

              {/* 가상 인물 */}
              <View style={[styles.avatarCircle, isSpeaking && styles.avatarCircleSpeaking]}>
                <Text style={styles.avatarEmoji}>{VIRTUAL_PERSON.emoji}</Text>
              </View>
              <Text style={styles.avatarName}>{VIRTUAL_PERSON.name}</Text>

              {/* 수신 자막 말풍선 */}
              {latestSubtitle ? (
                <View style={styles.speechBubble}>
                  <Text style={styles.speechText}>{latestSubtitle}</Text>
                  {isSpeaking && <Text style={styles.speechSub}>🔊 음성으로 전달 중...</Text>}
                </View>
              ) : (
                <View style={[styles.speechBubble, styles.speechBubbleIdle]}>
                  <Text style={styles.speechIdle}>{VIRTUAL_PERSON.idleMsg}</Text>
                </View>
              )}
            </View>

            {/* 자막 히스토리 */}
            <View style={styles.historyBox}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>📝 수신된 자막 기록</Text>
                {subtitleHistory.length > 0 && (
                  <TouchableOpacity onPress={clearSubtitles}>
                    <Text style={styles.clearBtn}>지우기</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.historyList}>
                {subtitleHistory.length === 0
                  ? <Text style={styles.historyEmpty}>수신된 자막이 없습니다</Text>
                  : subtitleHistory.map((item, i) => (
                    <View key={i} style={styles.historyItem}>
                      <Text style={styles.historyText}>{i + 1}. {item.text}</Text>
                      <Text style={styles.historyTime}>{new Date(item.ts).toLocaleTimeString('ko-KR')}</Text>
                    </View>
                  ))}
              </ScrollView>
            </View>
          </View>
        </View>

        {/* 인식 가능한 수어 안내 */}
        <View style={styles.guideBox}>
          <Text style={styles.guideTitle}>✋ 인식 가능한 수어</Text>
          <Text style={styles.guideText}>
            안녕하세요 · 감사합니다 · 네 · 아니요 · 괜찮아요 · 도와주세요{'\n'}
            경찰 · 119 · 전화 · 아파요
          </Text>
        </View>

        {/* 하단 여백 */}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ── 제스처 인식 (RealSignLanguageScreen과 동일 로직) ─────
function recognizeGesture(landmarks: any[], isPortrait: boolean): string | null {
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

    const handH    = wrist.y;
    const faceThr  = isPortrait ? 0.42 : 0.35;
    const atFace   = handH < faceThr;
    const helloThr = isPortrait ? 0.50 : 0.40;
    const midMin   = isPortrait ? 0.42 : 0.35;
    const midMax   = isPortrait ? 0.82 : 0.70;

    const thumbUp  = thumbTip.y < wrist.y - Math.max(handSize * 0.8, 0.08);
    const thumbSide = Math.abs(thumbTip.x - indexMcp.x) > Math.max(handSize * 0.8, 0.10);
    const all = iExt && mExt && rExt && pExt;

    if (iCls && mCls && rCls && pCls && atFace) return '아파요';
    if (iExt && mCls && rCls && pCls && atFace) return '경찰';
    if (iExt && mExt && rExt && pCls)           return '119';
    if (thumbSide && pExt && iCls && mCls && rCls) return '전화';
    if (handH < helloThr && all)                return '안녕하세요';
    if (iCls && mCls && rCls && pCls)           return '감사합니다';
    if (indexTip.y < indexMcp.y - thr * 2 && mCls && rCls && pCls) return '네';
    if (iExt && mExt && rCls && pCls)           return '아니요';
    if (thumbUp && iCls && mCls)                return '괜찮아요';
    if (all && handH > midMin && handH < midMax) return '도와주세요';
  } catch { /* 무시 */ }
  return null;
}

// ── 스타일 ────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },

  header: {
    backgroundColor: colors.primary.main,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: colors.primary.light,
  },
  backButton: { position: 'absolute', top: spacing.xl, left: spacing.lg, padding: spacing.sm, zIndex: 10 },
  backButtonText: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold, color: colors.primary.contrast },
  headerTitle: { fontSize: fonts.sizes['2xl'], fontWeight: fonts.weights.bold, color: '#FFF', marginBottom: 4 },
  headerSubtitle: { fontSize: fonts.sizes.sm, color: colors.primary.contrast, opacity: 0.9 },

  content: { flex: 1 },

  // 상태 바
  statusBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#1A1F3A', padding: spacing.md,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderRadius: 10, borderWidth: 1, borderColor: '#2D3561',
  },
  statusItem: { color: '#AAA', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  statusOn: { color: '#00FF88' },
  statusSpeaking: { color: '#FFB800' },

  // 2분할 레이아웃
  screens: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  screensMobile: { flexDirection: 'column' },

  panel: {
    flex: 1, backgroundColor: '#1A1F3A', borderRadius: 14,
    padding: spacing.md, borderWidth: 2, borderColor: '#2D3561',
  },
  panelHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.md,
    paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#2D3561',
  },
  panelTitle: { color: '#FFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  badge: {
    backgroundColor: '#374151', paddingHorizontal: spacing.md,
    paddingVertical: 3, borderRadius: 12,
  },
  badgeOn: { backgroundColor: colors.error.main },
  badgeSpeaking: { backgroundColor: '#D97706' },
  badgeText: { color: '#FFF', fontSize: fonts.sizes.xs, fontWeight: fonts.weights.medium },

  // 카메라 영역
  videoBox: {
    backgroundColor: '#000', borderRadius: 10,
    marginBottom: spacing.md, position: 'relative', overflow: 'hidden',
    borderWidth: 2, borderColor: '#2D3561',
  },
  videoOff: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#111',
  },
  videoOffEmoji: { fontSize: 60, marginBottom: spacing.md },
  videoOffText: { color: '#666', fontSize: fonts.sizes.base },
  videoOffError: { color: '#FF5555', fontSize: fonts.sizes.sm, textAlign: 'center', paddingHorizontal: 16 },
  loadingBadge: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(99,102,241,0.92)', borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  loadingText: { color: '#FFF', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  gestureBadge: {
    position: 'absolute', bottom: 12, left: 12, right: 12,
    backgroundColor: 'rgba(37,99,235,0.93)', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 16, borderWidth: 2, borderColor: '#00FF88',
  },
  gestureText: { color: '#FFF', fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, textAlign: 'center' },

  camBtn: {
    backgroundColor: '#00C853', paddingVertical: spacing.md,
    borderRadius: 10, alignItems: 'center', borderWidth: 2, borderColor: '#00FF88',
  },
  camBtnStop: { backgroundColor: '#D32F2F', borderColor: '#FF5252' },
  camBtnText: { color: '#FFF', fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold },

  // 가상 청인 캐릭터
  avatarBox: {
    borderRadius: 10, marginBottom: spacing.md,
    borderWidth: 2, borderColor: '#2D3561', overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
    backgroundColor: '#0D1B2A',
  },
  avatarBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0D1B2A',
  },
  avatarCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#1E3A5F', justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#2563EB', marginBottom: 10,
  },
  avatarCircleSpeaking: {
    borderColor: '#00FF88', borderWidth: 4,
    shadowColor: '#00FF88', shadowOpacity: 0.6, shadowRadius: 12,
  },
  avatarEmoji: { fontSize: 56 },
  avatarName: { color: '#94A3B8', fontSize: fonts.sizes.sm, marginBottom: 16 },
  speechBubble: {
    backgroundColor: 'rgba(37,99,235,0.92)', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 20, maxWidth: '80%',
    borderWidth: 2, borderColor: '#60A5FA',
  },
  speechBubbleIdle: { backgroundColor: 'rgba(30,30,50,0.8)', borderColor: '#374151' },
  speechText: { color: '#FFF', fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, textAlign: 'center' },
  speechSub: { color: '#93C5FD', fontSize: fonts.sizes.sm, textAlign: 'center', marginTop: 4 },
  speechIdle: { color: '#6B7280', fontSize: fonts.sizes.sm, textAlign: 'center' },

  // 자막 히스토리
  historyBox: {
    backgroundColor: '#252B48', borderRadius: 10, padding: spacing.md,
    borderWidth: 1, borderColor: '#2D3561', maxHeight: 180,
  },
  historyHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.sm,
  },
  historyTitle: { color: '#FFF', fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  clearBtn: { color: '#EF4444', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  historyList: { maxHeight: 120 },
  historyEmpty: { color: '#6B7280', fontSize: fonts.sizes.sm, textAlign: 'center', paddingVertical: 8 },
  historyItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  historyText: { color: '#E2E8F0', fontSize: fonts.sizes.base, flex: 1 },
  historyTime: { color: '#6B7280', fontSize: fonts.sizes.xs, marginLeft: 8 },

  // 수어 가이드
  guideBox: {
    marginHorizontal: spacing.md, backgroundColor: '#1A1F3A',
    borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: '#2D3561',
  },
  guideTitle: { color: '#FFB800', fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold, marginBottom: 8 },
  guideText: { color: '#CBD5E1', fontSize: fonts.sizes.sm, lineHeight: 22 },
});
