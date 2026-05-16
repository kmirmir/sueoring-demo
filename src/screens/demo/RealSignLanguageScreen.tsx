/**
 * RealSignLanguageScreen - 실시간 수어 인식 화면
 *
 * [손 제스처] MediaPipe Hands — 21개 랜드마크 기반
 *   - 정적(11종): 안녕하세요·감사합니다·네·아니요·괜찮아요·도와주세요·경찰·119·전화·아파요·병원
 *   - 모션(2종): 구급차(흔들기)·급해요(양손 흔들기)
 *   - 손 크기 기반 동적 임계값으로 모바일/PC 자동 적응
 *
 * [몸 포즈] TensorFlow.js MoveNet Lightning — 17개 키포인트 기반
 *   - 7종 긴급 포즈: 쓰러졌어요·기절위기·위험·SOS·도움요청·두통·가슴통증
 *   - MoveNet 좌표 정규화(픽셀→0~1) 적용으로 MediaPipe 좌표 혼용 버그 수정
 *   - 포즈 감지 시 바운딩 박스 + 이모지 라벨 표시
 *
 * [모바일 최적화]
 *   - User-Agent + 터치포인트 기반 모바일 감지
 *   - portrait 모드 임계값 분기 + 카메라 해상도 제한(640×480)
 *   - WebGL → CPU 자동 폴백, Canvas 초기화 타이밍 보완
 *
 * [공통] 제스처 안정화 필터(5프레임) · 긴급 우선순위 큐 · CDN 폴백 · TTS
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

// TensorFlow.js 타입 정의
declare global {
  interface Window {
    tf: any;
    poseDetection: any;
  }
}

// MediaPipe 타입 정의
declare global {
  interface Window {
    Hands: any;
    Pose: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
    POSE_CONNECTIONS: any;
    Camera: any;
  }
}

// 외부 라이브러리 버전 핀 (package.json과 일치)
const MEDIAPIPE_HANDS_VERSION = '0.4.1675469240';
const MEDIAPIPE_DRAWING_VERSION = '0.3.1675466124';
const TFJS_VERSION = '4.22.0';
const POSE_DETECTION_VERSION = '2.1.3';

// 1차/2차 CDN — 1차 실패 시 자동 폴백
const CDN_PROVIDERS = [
  'https://cdn.jsdelivr.net/npm',
  'https://unpkg.com',
] as const;

// 모션(흔들기) 감지 파라미터
const SHAKE_HISTORY_FRAMES = 12;        // 약 0.4초(30fps 기준)의 손목 위치 히스토리
const SHAKE_MIN_FRAMES = 8;             // 최소 이 정도 프레임 모이면 감지 시도 (응답성 ↑)
const SHAKE_STDDEV_THRESHOLD = 0.015;   // 표준편차 임계값 — 0.025→0.015로 완화
const SHAKE_DIRECTION_CHANGES_MIN = 2;  // 방향 전환 최소 횟수 — 3→2로 완화
const SHAKE_DIRECTION_DELTA_MIN = 0.003;// 방향전환 카운트 시 무시할 미세 흔들림 — 0.005→0.003
const MAX_MISSED_FRAMES_BEFORE_CLEAR = 5; // 손이 N프레임 연속 안 보일 때만 히스토리 비움

interface RealSignLanguageScreenProps {
  onBack?: () => void;
}

export default function RealSignLanguageScreen({ onBack }: RealSignLanguageScreenProps = {}) {
  const { width: screenWidth } = useWindowDimensions();

  // User-Agent + 터치 + 화면 너비 조합으로 모바일 판별 (width 단독보다 정확)
  const isMobileWeb = Platform.OS === 'web' && (
    /Android|iPhone|iPad|iPod/i.test(
      typeof navigator !== 'undefined' ? navigator.userAgent : ''
    ) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && screenWidth < 1024)
  );

  // 카메라 로드 후 portrait 여부를 저장 (세로 촬영 여부로 임계값 동적 조정)
  const isPortraitRef = useRef<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const poseDetectorRef = useRef<any>(null);  // TensorFlow.js PoseDetector
  const poseResultsRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  // 성공한 CDN 베이스 URL을 기억해서 locateFile에서 동일 CDN으로 자산 로드
  const workingCdnRef = useRef<string>(CDN_PROVIDERS[0]);
  // 손목 위치 히스토리 (모션/흔들기 감지용)
  // 슬롯 0 = Left, 슬롯 1 = Right (multiHandedness 기준으로 안정 식별)
  const wristHistoryRef = useRef<Array<Array<{x: number, y: number}>>>([[], []]);
  // 각 슬롯이 N프레임 연속 누락됐는지 (즉시 wipe 방지 — 단일 프레임 누락은 무시)
  const slotMissedFramesRef = useRef<[number, number]>([0, 0]);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<{ type: string } | null>(null);
  const [subtitleHistory, setSubtitleHistory] = useState<Array<{text: string, timestamp: number}>>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [poseDetected, setPoseDetected] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);  // 흔들기 감지 실시간 표시
  const [fps, setFps] = useState(0);
  const [queueLength, setQueueLength] = useState(0);
  const [currentProcessingGesture, setCurrentProcessingGesture] = useState<string>('');
  // AI 모델 로딩 단계 — 카메라 영상은 먼저 켜고 모델은 백그라운드 로딩
  const [aiLoadingStage, setAiLoadingStage] = useState<
    'idle' | 'mediapipe' | 'tensorflow' | 'movenet' | 'ready'
  >('idle');

  // 프레임 카운터
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  // 제스처 큐 시스템
  const gestureQueueRef = useRef<Array<{text: string, timestamp: number}>>([]);
  const isProcessingQueueRef = useRef(false);
  const lastRecognizedGestureRef = useRef<string>('');
  const lastRecognizedTimeRef = useRef<number>(0);

  // 제스처 안정화 필터 (연속 감지 확인)
  const gestureStabilityBufferRef = useRef<string[]>([]);
  const STABILITY_THRESHOLD = 5; // 정적 수어 — 5프레임 연속 감지 필요
  const MOTION_STABILITY_THRESHOLD = 3; // 모션 수어(흔들기) — 3프레임으로 완화 (pose 흔들림 보정)
  const MOTION_GESTURES = ['구급차', '급해요'];
  const [detectionQuality, setDetectionQuality] = useState<'excellent' | 'good' | 'poor' | 'none'>('none');

  // TTS 함수 (개선된 속도 및 발음)
  const speakTextAsync = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (Platform.OS === 'web' && 'speechSynthesis' in window) {
        // 이전 음성 중지
        window.speechSynthesis.cancel();

        // 텍스트 전처리: 짧은 단어는 띄어쓰기로 명확하게
        let processedText = text;

        // "위험"처럼 짧은 단어는 앞뒤에 짧은 pause 추가 (쉼표로 구현)
        if (text.length <= 3) {
          processedText = `. ${text}.`;  // 앞뒤 점으로 짧은 pause
        }

        // 특정 단어 발음 개선
        processedText = processedText
          .replace('위험', '위 험')  // 띄어쓰기로 명확하게
          .replace('도와주세요', '도와 주세요')
          .replace('감사합니다', '감사 합니다');

        const utterance = new SpeechSynthesisUtterance(processedText);
        utterance.lang = 'ko-KR';
        utterance.rate = 1.2;  // 0.9 → 1.2 (더 빠르게)
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // 음성 재생 시작 시점
        utterance.onstart = () => {
          setIsSpeaking(true);
        };

        // 음성 재생 종료
        utterance.onend = () => {
          setIsSpeaking(false);
          resolve();
        };

        // 에러 발생
        utterance.onerror = (event) => {
          console.error('TTS error:', event);
          setIsSpeaking(false);
          resolve(); // 에러가 나도 다음 큐 처리를 위해 resolve
        };

        // 짧은 delay 후 재생 (브라우저 TTS 초기화 시간 확보)
        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, 50);
      } else {
        resolve(); // Web이 아니면 즉시 완료
      }
    });
  };

  // 제스처를 큐에 추가
  const addGestureToQueue = (gesture: string) => {
    const now = Date.now();

    // 긴급 제스처인지 확인 (큐 맨 앞으로 우선 처리)
    const EMERGENCY_GESTURES = ['위험', '119', '도와주세요', '아파요', '구급차', '경찰', '병원', '전화'];
    const isEmergency = EMERGENCY_GESTURES.some(emergency => gesture.includes(emergency));

    const gestureItem = { text: gesture, timestamp: now };

    if (isEmergency) {
      // 긴급 제스처는 큐 맨 앞에 삽입
      gestureQueueRef.current.unshift(gestureItem);
    } else {
      // 일반 제스처는 큐 맨 뒤에 추가
      gestureQueueRef.current.push(gestureItem);
    }

    // 큐 길이 업데이트
    setQueueLength(gestureQueueRef.current.length);

    // 큐 처리 시작
    processQueue();
  };

  // 큐 순차 처리
  const processQueue = async () => {
    // 이미 처리 중이거나 큐가 비어있으면 리턴
    if (isProcessingQueueRef.current || gestureQueueRef.current.length === 0) {
      return;
    }

    // 처리 시작
    isProcessingQueueRef.current = true;

    // 큐에서 첫 번째 제스처 가져오기
    const gestureItem = gestureQueueRef.current.shift();
    if (!gestureItem) {
      isProcessingQueueRef.current = false;
      return;
    }

    // 큐 길이 업데이트
    setQueueLength(gestureQueueRef.current.length);

    // 현재 처리 중인 제스처 표시
    setCurrentProcessingGesture(gestureItem.text);

    // 자막 히스토리에 추가
    setSubtitleHistory(prev => [...prev, gestureItem]);

    try {
      // TTS 재생 완료까지 대기
      await speakTextAsync(gestureItem.text);
    } catch (error) {
      console.error('Queue processing error:', error);
    }

    // 제스처 표시 유지 (1초)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 현재 제스처 초기화
    setCurrentProcessingGesture('');

    // 처리 완료
    isProcessingQueueRef.current = false;

    // 다음 제스처 처리
    processQueue();
  };

  // 마지막 제스처 취소
  // 1) 큐에 대기 중인 게 있으면 큐의 마지막 항목 제거
  // 2) 큐가 비었으면 이미 처리된 자막 기록의 마지막 항목 제거 (잘못 인식된 결과 빠르게 정리)
  const undoLastGesture = () => {
    if (gestureQueueRef.current.length > 0) {
      gestureQueueRef.current.pop();
      setQueueLength(gestureQueueRef.current.length);
    } else if (subtitleHistory.length > 0) {
      setSubtitleHistory(prev => prev.slice(0, -1));
    }
  };

  // 큐 + 자막 기록 + TTS 모두 초기화 — 데모 리셋
  const clearQueue = () => {
    gestureQueueRef.current = [];
    setQueueLength(0);
    setCurrentProcessingGesture('');
    setSubtitleHistory([]);

    // TTS 중지
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);

    // 안정화 버퍼/직전 인식 정보도 리셋 — 직전 제스처가 다시 큐에 들어가지 않도록
    gestureStabilityBufferRef.current = [];
    lastRecognizedGestureRef.current = '';
    lastRecognizedTimeRef.current = 0;

    isProcessingQueueRef.current = false;
  };

  // 손목 히스토리 슬롯이 흔들리고 있는지 판정
  // 1) 표준편차(움직임 크기) 충분 + 2) x축 방향 전환 횟수 충분 = 진동성 모션
  const isSlotShaking = (slotIndex: number): boolean => {
    const history = wristHistoryRef.current[slotIndex];
    // 최소 프레임만 모이면 감지 시도 — 응답성 향상
    if (!history || history.length < SHAKE_MIN_FRAMES) return false;

    // 표준편차 계산
    const meanX = history.reduce((s, p) => s + p.x, 0) / history.length;
    const meanY = history.reduce((s, p) => s + p.y, 0) / history.length;
    const varX = history.reduce((s, p) => s + (p.x - meanX) ** 2, 0) / history.length;
    const varY = history.reduce((s, p) => s + (p.y - meanY) ** 2, 0) / history.length;
    const stdMax = Math.max(Math.sqrt(varX), Math.sqrt(varY));

    if (stdMax < SHAKE_STDDEV_THRESHOLD) return false;

    // x축 방향 전환 횟수 (지터가 아닌 의도된 흔들기인지 확인)
    let directionChanges = 0;
    for (let i = 2; i < history.length; i++) {
      const dx1 = history[i - 1].x - history[i - 2].x;
      const dx2 = history[i].x - history[i - 1].x;
      if (Math.sign(dx1) !== Math.sign(dx2) && Math.abs(dx1) > SHAKE_DIRECTION_DELTA_MIN) {
        directionChanges++;
      }
    }
    return directionChanges >= SHAKE_DIRECTION_CHANGES_MIN;
  };

  // 손 제스처 인식 로직 (간단한 패턴 기반)
  // 우선순위: 더 구체적인 패턴(긴급)이 일반 패턴보다 먼저 매칭되도록 순서 배치
  // isShaking: 이 손이 현재 흔들리고 있는지 (모션 기반 수어 분기용)
  const recognizeGesture = (landmarks: any, isShaking: boolean = false) => {
    if (!landmarks || landmarks.length === 0) {
      return null;
    }

    try {
      // 손 랜드마크 인덱스
      // 0: 손목, 4: 엄지 끝, 8: 검지 끝, 12: 중지 끝, 16: 약지 끝, 20: 새끼 끝
      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];

      const indexMcp = landmarks[5]; // 검지 손가락 밑부분
      const middleMcp = landmarks[9];
      const ringMcp = landmarks[13];
      const pinkyMcp = landmarks[17];

      // 손 크기(손목~중지MCP 거리) 기반 동적 임계값
      // → 모바일(카메라 근거리)과 PC(원거리) 모두 손 비율에 맞게 자동 조정
      const handSize = Math.abs(wrist.y - middleMcp.y);
      const fingerThreshold = Math.max(handSize * 0.3, 0.02); // 손 크기의 30%, 최소 0.02

      // 손가락 펴짐 여부 (동적 임계값 적용)
      const indexExtended = indexTip.y < indexMcp.y - fingerThreshold;
      const middleExtended = middleTip.y < middleMcp.y - fingerThreshold;
      const ringExtended = ringTip.y < ringMcp.y - fingerThreshold;
      const pinkyExtended = pinkyTip.y < pinkyMcp.y - fingerThreshold;
      const indexClosed = indexTip.y > indexMcp.y;
      const middleClosed = middleTip.y > middleMcp.y;
      const ringClosed = ringTip.y > ringMcp.y;
      const pinkyClosed = pinkyTip.y > pinkyMcp.y;
      // 엄지는 옆으로 펴짐 — 손목 대비 x 거리 (손 크기 기반 동적 임계값)
      const thumbExtendedSideways = Math.abs(thumbTip.x - indexMcp.x) > Math.max(handSize * 0.8, 0.10);

      // 손의 높이 (y 좌표가 작을수록 위쪽)
      const handHeight = wrist.y;

      // portrait(모바일 세로) 여부에 따른 높이 임계값 조정
      // portrait: 세로 프레임이라 얼굴이 위 30% 구간, 손이 더 낮게 잡힘
      const isPortrait = isPortraitRef.current;
      const faceThreshold = isPortrait ? 0.42 : 0.35;       // 얼굴/이마 높이
      const helloThreshold = isPortrait ? 0.50 : 0.40;      // 안녕하세요 손 높이
      const midMin = isPortrait ? 0.42 : 0.35;              // 중간 높이 하한
      const midMax = isPortrait ? 0.82 : 0.70;              // 중간 높이 상한
      const ambulanceMin = isPortrait ? 0.45 : 0.40;        // 구급차 높이 하한
      const ambulanceMax = isPortrait ? 0.82 : 0.70;        // 구급차 높이 상한

      const handAtFace = handHeight < faceThreshold;

      // ========= 긴급 수어 (구체적 패턴 우선) =========

      // [긴급] 아파요 - 주먹 + 얼굴 가까이 (감사합니다보다 먼저 체크)
      if (indexClosed && middleClosed && ringClosed && pinkyClosed && handAtFace) {
        return '아파요';
      }

      // [긴급] 경찰 - 검지만 펴기 + 얼굴 높이 ("네"보다 먼저 체크)
      if (indexExtended && middleClosed && ringClosed && pinkyClosed && handAtFace) {
        return '경찰';
      }

      // [긴급] 119 - 세 손가락(검지+중지+약지) 펴기, W자
      if (indexExtended && middleExtended && ringExtended && pinkyClosed) {
        return '119';
      }

      // [긴급] 전화 - 엄지+새끼만 펴기 (shaka/hang-loose)
      if (thumbExtendedSideways && pinkyExtended && indexClosed && middleClosed && ringClosed) {
        return '전화';
      }

      // ========= 모션 기반 수어 (흔들기) =========

      const allFingersExtended = indexExtended && middleExtended && ringExtended && pinkyExtended;

      // [긴급] 구급차 - 손바닥(모두 펴기) + 흔들기 + 중간 높이
      if (allFingersExtended && isShaking && handHeight > ambulanceMin && handHeight < ambulanceMax) {
        return '구급차';
      }

      // ========= 기본 수어 =========

      // 안녕하세요 - 손을 위쪽에 + 모든 손가락 펴기 (정적 또는 흔들기 모두 허용)
      if (handHeight < helloThreshold && allFingersExtended) {
        return '안녕하세요';
      }

      // 감사합니다 - 주먹 쥐기 (얼굴 높이가 아닌 곳)
      if (indexClosed && middleClosed && ringClosed && pinkyClosed) {
        return '감사합니다';
      }

      // 네 - 검지만 펴기 (중간 높이)
      if (indexTip.y < indexMcp.y - fingerThreshold * 2 && middleClosed && ringClosed && pinkyClosed) {
        return '네';
      }

      // 아니요 - 검지+중지 펴기 (V자)
      if (indexExtended && middleExtended && ringClosed && pinkyClosed) {
        return '아니요';
      }

      // 괜찮아요 - 엄지만 위로 (손 크기 기반 동적 임계값)
      const thumbIsUp = thumbTip.y < wrist.y - Math.max(handSize * 0.8, 0.08);
      if (thumbIsUp && indexClosed && middleClosed) {
        return '괜찮아요';
      }

      // 도와주세요 - 손바닥 보이기 (중간 높이에서 모든 손가락 펴기)
      if (
        indexExtended && middleExtended && ringExtended && pinkyExtended &&
        handHeight > midMin && handHeight < midMax
      ) {
        return '도와주세요';
      }

    } catch (error) {
      console.error('Gesture recognition error:', error);
    }

    return null;
  };

  // MediaPipe Hands 결과 처리 (손 위치 기반 제스처 감지)
  const onResults = (results: any) => {
    if (!canvasRef.current || !videoRef.current) {
      console.warn('⚠️ Canvas or video not available in onResults');
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('⚠️ Canvas context not available');
      return;
    }

    // 첫 프레임 로그
    if (frameCountRef.current === 0) {
      console.log('🎬 First frame received!');
      console.log('Canvas size:', canvas.width, 'x', canvas.height);
      console.log('Video image size:', results.image.width, 'x', results.image.height);
    }

    // FPS 계산
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    // 캔버스 초기화
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 비디오 원본 해상도
    const videoW = (results.image as HTMLVideoElement).videoWidth || canvas.width;
    const videoH = (results.image as HTMLVideoElement).videoHeight || canvas.height;
    // CSS objectFit:cover 와 동일한 변환 — 비디오를 canvas에 꽉 채워 그림
    const coverScale = Math.max(canvas.width / videoW, canvas.height / videoH);
    const imgX = (canvas.width - videoW * coverScale) / 2;
    const imgY = (canvas.height - videoH * coverScale) / 2;
    // 정규화 좌표(0-1) → canvas 픽셀 좌표 변환 헬퍼
    // scaleX(-1)은 video에만 적용 → canvas에서 x를 직접 반전
    const toCanvasPx = (nx: number, ny: number) => ({
      x: (1 - nx) * videoW * coverScale + imgX,
      y: ny * videoH * coverScale + imgY,
    });

    // 비디오 그리기 — context 수준에서 좌우 반전 (CSS scaleX(-1) 없이 동일 효과)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, imgX, imgY, videoW * coverScale, videoH * coverScale);
    ctx.restore();

    // 감지 품질 평가
    let qualityScore = 0;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      qualityScore += results.multiHandLandmarks.length * 30; // 손 1개당 30점
    }
    if (poseResultsRef.current) {
      qualityScore += 40; // 몸 감지 시 40점
    }

    // 품질 상태 업데이트
    if (qualityScore >= 70) {
      setDetectionQuality('excellent');
    } else if (qualityScore >= 40) {
      setDetectionQuality('good');
    } else if (qualityScore > 0) {
      setDetectionQuality('poor');
    } else {
      setDetectionQuality('none');
    }

    // 포즈 바운딩 박스 좌표 — 제스처 인식 후 조건부 표시용
    // MoveNet은 "위험" 제스처 판별(어깨 위치 비교)에만 사용
    // 키포인트 점·스켈레톤·바운딩 박스는 화면에 표시하지 않음

    let recognizedGesture: string | null = null;

    // 손목 히스토리 업데이트 — multiHandedness로 Left/Right 안정 식별
    // 슬롯 0 = Left, 슬롯 1 = Right (MediaPipe의 hand index 변경에 무관)
    // 누락 프레임 즉시 wipe 방지 — 일시적 detection 누락에 강건
    const slotHands: [any | null, any | null] = [null, null];
    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i]?.label;
        const lm = results.multiHandLandmarks[i];
        if (label === 'Left' && !slotHands[0]) slotHands[0] = lm;
        else if (label === 'Right' && !slotHands[1]) slotHands[1] = lm;
      }
    }

    for (let slot = 0 as 0 | 1; slot < 2; slot++) {
      const hand = slotHands[slot];
      if (hand && hand[0]) {
        wristHistoryRef.current[slot].push({ x: hand[0].x, y: hand[0].y });
        if (wristHistoryRef.current[slot].length > SHAKE_HISTORY_FRAMES) {
          wristHistoryRef.current[slot].shift();
        }
        slotMissedFramesRef.current[slot] = 0;
      } else {
        // N프레임 연속 누락된 경우에만 히스토리 wipe — 일시적 detection drop에 강건
        slotMissedFramesRef.current[slot]++;
        if (slotMissedFramesRef.current[slot] >= MAX_MISSED_FRAMES_BEFORE_CLEAR) {
          wristHistoryRef.current[slot] = [];
        }
      }
    }

    // 흔들기 감지 상태 (UI 표시용) — 어느 한 손이라도 흔들고 있으면 true
    setMotionDetected(isSlotShaking(0) || isSlotShaking(1));

    // 양손 바운딩 박스 + 라벨 그리기 헬퍼
    const drawTwoHandBox = (h1: any, h2: any, label: string, color: string) => {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      [h1, h2].forEach(hand => {
        hand.forEach((lm: any) => {
          minX = Math.min(minX, lm.x);
          minY = Math.min(minY, lm.y);
          maxX = Math.max(maxX, lm.x);
          maxY = Math.max(maxY, lm.y);
        });
      });
      const { x: boxX, y: boxY } = toCanvasPx(maxX, minY); // x 반전 후 maxX가 시각적 좌측
      const boxWidth = (maxX - minX) * videoW * coverScale;
      const boxHeight = (maxY - minY) * videoH * coverScale;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      ctx.fillStyle = color === '#FF0000' ? 'rgba(255, 0, 0, 0.9)' : 'rgba(0, 136, 255, 0.9)';
      ctx.fillRect(boxX, boxY - 50, Math.max(boxWidth, 150), 45);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 28px Arial';
      ctx.fillText(label, boxX + 10, boxY - 18);
    };

    // === MoveNet 포즈 기반 긴급 제스처 감지 (7종) ===
    if (poseResultsRef.current && Array.isArray(poseResultsRef.current)) {
      const kp = poseResultsRef.current;
      const v = (k: any) => k && typeof k.score === 'number' && k.score > 0.3;

      const nose          = kp[0];
      const leftShoulder  = kp[5],  rightShoulder = kp[6];
      const leftWrist     = kp[9],  rightWrist    = kp[10];
      const leftHip       = kp[11], rightHip      = kp[12];

      let poseGesture: string | null = null;
      let poseColor = '#FF0000';
      let poseEmoji = '🚨';

      // 1순위: 쓰러짐/의식불명 — 코가 어깨 평균보다 아래 (넘어진 상태)
      if (!poseGesture && v(nose) && v(leftShoulder) && v(rightShoulder)) {
        const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
        if (nose.y > shoulderAvgY + 0.05) {
          poseGesture = '쓰러졌어요'; poseColor = '#FF0000'; poseEmoji = '🆘';
        }
      }

      // 2순위: 기절위기 — 어깨가 심하게 기울어짐 (한쪽으로 쓰러지는 중)
      if (!poseGesture && v(leftShoulder) && v(rightShoulder)) {
        if (Math.abs(leftShoulder.y - rightShoulder.y) > 0.18) {
          poseGesture = '기절위기'; poseColor = '#FF4500'; poseEmoji = '⚠️';
        }
      }

      // 3순위: 위험 — 양손이 어깨 위 (MediaPipe 손 랜드마크 + MoveNet 어깨)
      if (!poseGesture && results.multiHandLandmarks?.length === 2 && v(leftShoulder) && v(rightShoulder)) {
        const h1 = results.multiHandLandmarks[0];
        const h2 = results.multiHandLandmarks[1];
        const h1AvgY = h1.reduce((s: number, lm: any) => s + lm.y, 0) / h1.length;
        const h2AvgY = h2.reduce((s: number, lm: any) => s + lm.y, 0) / h2.length;
        if (h1AvgY < leftShoulder.y && h2AvgY < rightShoulder.y) {
          poseGesture = '위험'; poseColor = '#FF0000'; poseEmoji = '🚨';
        }
      }

      // 4순위: SOS — 팔을 X자로 교차 (가슴 앞에서)
      if (!poseGesture && v(leftWrist) && v(rightWrist) && v(leftShoulder) && v(rightShoulder)) {
        const crossed = leftWrist.x > rightWrist.x;
        const sameLevel = Math.abs(leftWrist.y - rightWrist.y) < 0.15;
        const atChestHeight = leftWrist.y > leftShoulder.y && rightWrist.y > rightShoulder.y;
        if (crossed && sameLevel && atChestHeight) {
          poseGesture = 'SOS'; poseColor = '#FF6600'; poseEmoji = '🆘';
        }
      }

      // 5순위: 도움요청 — 양팔 T자 크게 벌리기 (어깨 너비 1.8배 이상, 어깨 높이 근방)
      if (!poseGesture && v(leftWrist) && v(rightWrist) && v(leftShoulder) && v(rightShoulder)) {
        const shoulderW = Math.abs(leftShoulder.x - rightShoulder.x);
        const wristW = Math.abs(leftWrist.x - rightWrist.x);
        const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
        const wristAvgY = (leftWrist.y + rightWrist.y) / 2;
        if (wristW > shoulderW * 1.8 && Math.abs(wristAvgY - shoulderAvgY) < 0.25) {
          poseGesture = '도움요청'; poseColor = '#FF8800'; poseEmoji = '🙏';
        }
      }

      // 6순위: 두통 — 양 손목이 머리(코) 근처에 모임
      if (!poseGesture && v(nose) && v(leftWrist) && v(rightWrist)) {
        const lDist = Math.hypot(leftWrist.x - nose.x, leftWrist.y - nose.y);
        const rDist = Math.hypot(rightWrist.x - nose.x, rightWrist.y - nose.y);
        if (lDist < 0.18 && rDist < 0.18) {
          poseGesture = '두통'; poseColor = '#CC44FF'; poseEmoji = '🤕';
        }
      }

      // 7순위: 가슴통증 — 한쪽 이상 손목이 가슴 중앙(어깨-엉덩이 중간) 근처
      if (!poseGesture && v(leftShoulder) && v(rightShoulder) && v(leftHip) && v(rightHip)) {
        const chestX = (leftShoulder.x + rightShoulder.x) / 2;
        const chestY = ((leftShoulder.y + rightShoulder.y) / 2 + (leftHip.y + rightHip.y) / 2) / 2;
        const lNear = v(leftWrist) && Math.hypot(leftWrist.x - chestX, leftWrist.y - chestY) < 0.12;
        const rNear = v(rightWrist) && Math.hypot(rightWrist.x - chestX, rightWrist.y - chestY) < 0.12;
        if (lNear || rNear) {
          poseGesture = '가슴통증'; poseColor = '#FF2255'; poseEmoji = '💔';
        }
      }

      // 포즈 감지 시: 몸 바운딩 박스 + 라벨 그리기
      // poseDetected 상태는 processFrame에서만 관리 (매 프레임 setState 방지)
      if (poseGesture) {
        recognizedGesture = poseGesture;

        // 유효 키포인트 전체로 바운딩 박스 계산
        let bMinX = 1, bMinY = 1, bMaxX = 0, bMaxY = 0;
        kp.forEach((k: any) => {
          if (v(k)) {
            bMinX = Math.min(bMinX, k.x); bMinY = Math.min(bMinY, k.y);
            bMaxX = Math.max(bMaxX, k.x); bMaxY = Math.max(bMaxY, k.y);
          }
        });

        const pad = 0.04;
        const { x: bx, y: by } = toCanvasPx(Math.min(1, bMaxX + pad), Math.max(0, bMinY - pad)); // x 반전 후 bMaxX가 시각적 좌측
        const bw = (Math.min(1, bMaxX + pad) - Math.max(0, bMinX - pad)) * videoW * coverScale;
        const bh = (Math.min(1, bMaxY + pad) - Math.max(0, bMinY - pad)) * videoH * coverScale;

        ctx.strokeStyle = poseColor;
        ctx.lineWidth = 4;
        ctx.strokeRect(bx, by, bw, bh);

        const labelText = `${poseEmoji} ${poseGesture}`;
        ctx.font = 'bold 26px Arial';
        const labelW = Math.max(ctx.measureText(labelText).width + 24, 140);
        ctx.fillStyle = poseColor;
        ctx.globalAlpha = 0.88;
        ctx.fillRect(bx, by - 46, labelW, 40);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(labelText, bx + 10, by - 16);
      }
    }

    // 2. 병원 - 양손 검지 교차 (검지만 펴고 양손 검지 끝이 가까움)
    if (!recognizedGesture && results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
      const hand1 = results.multiHandLandmarks[0];
      const hand2 = results.multiHandLandmarks[1];

      const isIndexOnly = (h: any) => {
        const i = h[8], iM = h[5];
        const m = h[12], mM = h[9];
        const r = h[16], rM = h[13];
        const p = h[20], pM = h[17];
        return i.y < iM.y - 0.03 && m.y > mM.y && r.y > rM.y && p.y > pM.y;
      };

      if (isIndexOnly(hand1) && isIndexOnly(hand2)) {
        // 두 검지 끝 사이 거리
        const dx = hand1[8].x - hand2[8].x;
        const dy = hand1[8].y - hand2[8].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.15) {
          recognizedGesture = '병원';
          drawTwoHandBox(hand1, hand2, '🏥 ' + recognizedGesture, '#0088FF');
        }
      }
    }

    // 3. 급해요 - 양손이 모두 펴진 상태로 둘 다 흔들리는 중
    if (!recognizedGesture && results.multiHandLandmarks && results.multiHandLandmarks.length === 2) {
      const hand1 = results.multiHandLandmarks[0];
      const hand2 = results.multiHandLandmarks[1];

      const isOpenPalm = (h: any) => {
        const i = h[8], iM = h[5];
        const m = h[12], mM = h[9];
        const r = h[16], rM = h[13];
        const p = h[20], pM = h[17];
        return i.y < iM.y - 0.03 && m.y < mM.y - 0.03 && r.y < rM.y - 0.03 && p.y < pM.y - 0.03;
      };

      if (isOpenPalm(hand1) && isOpenPalm(hand2) && isSlotShaking(0) && isSlotShaking(1)) {
        recognizedGesture = '급해요';
        drawTwoHandBox(hand1, hand2, '⚡ ' + recognizedGesture, '#FF0000');
      }
    }

    // 4. 손 제스처 인식 (양손 제스처가 매칭되지 않을 때)
    if (!recognizedGesture && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      setHandDetected(true);

      for (let handIdx = 0; handIdx < results.multiHandLandmarks.length; handIdx++) {
        const landmarks = results.multiHandLandmarks[handIdx];
        // 이 손의 handedness 슬롯 찾기 (Left=0, Right=1) — 모션 검사 정합성
        const handLabel = results.multiHandedness?.[handIdx]?.label;
        const handSlotIdx = handLabel === 'Right' ? 1 : 0;
        // drawConnectors/drawLandmarks는 정규화 좌표×canvas크기로 그림
        // cover 변환 후 canvas 기준으로 재정규화
        const scaledLandmarks = landmarks.map((lm: any) => {
          const { x, y } = toCanvasPx(lm.x, lm.y);
          return { ...lm, x: x / canvas.width, y: y / canvas.height };
        });

        if (window.drawConnectors && window.HAND_CONNECTIONS) {
          window.drawConnectors(ctx, scaledLandmarks, window.HAND_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 5
          });
        }

        if (window.drawLandmarks) {
          window.drawLandmarks(ctx, scaledLandmarks, {
            color: '#FF0000',
            lineWidth: 2,
            radius: 5
          });
        }

        // 바운딩 박스 계산 및 그리기
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        landmarks.forEach((landmark: any) => {
          minX = Math.min(minX, landmark.x);
          minY = Math.min(minY, landmark.y);
          maxX = Math.max(maxX, landmark.x);
          maxY = Math.max(maxY, landmark.y);
        });

        const { x: boxX, y: boxY } = toCanvasPx(maxX, minY); // x 반전 후 maxX가 시각적 좌측
        const boxWidth = (maxX - minX) * videoW * coverScale;
        const boxHeight = (maxY - minY) * videoH * coverScale;

        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

        // 제스처 인식 (첫 번째 손만, 모션 정보 포함)
        if (!recognizedGesture) {
          // handedness 슬롯 기준으로 이 손이 흔들리고 있는지 확인
          const handIsShaking = isSlotShaking(handSlotIdx);
          recognizedGesture = recognizeGesture(landmarks, handIsShaking);
        }

        // 제스처 텍스트 표시
        if (recognizedGesture) {
          const labelW = Math.max(boxWidth, 120);
          ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
          ctx.fillRect(boxX, boxY - 36, labelW, 32);
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 18px Arial';
          ctx.fillText(recognizedGesture, boxX + 8, boxY - 12);
        }
      }
    } else if (!recognizedGesture) {
      setHandDetected(false);
    }

    // 제스처 안정화 필터 적용
    if (recognizedGesture) {
      // 버퍼에 현재 제스처 추가
      gestureStabilityBufferRef.current.push(recognizedGesture);

      // 버퍼 크기 제한 (최근 10프레임만 유지)
      if (gestureStabilityBufferRef.current.length > 10) {
        gestureStabilityBufferRef.current.shift();
      }

      // 모션 수어는 짧은 임계값(3프레임)으로 빠르게 통과 — pose 미세 흔들림 보정
      const isMotionGesture = MOTION_GESTURES.includes(recognizedGesture);
      const threshold = isMotionGesture ? MOTION_STABILITY_THRESHOLD : STABILITY_THRESHOLD;
      const recentGestures = gestureStabilityBufferRef.current.slice(-threshold);
      const isStable = recentGestures.length >= threshold &&
                       recentGestures.every(g => g === recognizedGesture);

      // 안정적인 제스처만 큐에 추가
      if (isStable &&
          recognizedGesture !== lastRecognizedGestureRef.current &&
          (now - lastRecognizedTimeRef.current) > 1000) {

        // 마지막 인식 정보 업데이트
        lastRecognizedGestureRef.current = recognizedGesture;
        lastRecognizedTimeRef.current = now;

        // 큐에 추가
        addGestureToQueue(recognizedGesture);

        // 버퍼 초기화 (새 제스처 대기)
        gestureStabilityBufferRef.current = [];
      }
    } else {
      // 제스처가 감지되지 않으면 버퍼 초기화
      gestureStabilityBufferRef.current = [];
    }

    ctx.restore();
  };

  // 카메라 시작
  const startCamera = async () => {
    if (Platform.OS !== 'web') {
      alert('이 기능은 웹 브라우저에서만 사용 가능합니다.');
      return;
    }

    setCameraError(null);

    try {
      console.log('🎥 Starting camera...');

      // 모바일: 해상도 상한 지정 (무제한 시 12MP 스트림으로 열려 MediaPipe FPS 급락)
      // 데스크탑: HD(1280×720) ideal 지정
      const videoConstraints = isMobileWeb
        ? { facingMode: 'user', width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      }).catch(async (constraintErr: DOMException) => {
        if (constraintErr.name === 'OverconstrainedError' || constraintErr.name === 'ConstraintNotSatisfiedError') {
          return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        throw constraintErr;
      });

      console.log('✅ Camera stream obtained');

      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        video.srcObject = stream;

        // 비디오 메타데이터가 로드될 때까지 대기
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            console.log(`📹 Video metadata loaded: ${video.videoWidth}x${video.videoHeight}`);
            // 세로 촬영 여부 저장 → 제스처 임계값 동적 조정에 활용
            isPortraitRef.current = video.videoWidth < video.videoHeight;
            console.log(`📐 Portrait mode: ${isPortraitRef.current}`);

            // requestAnimationFrame으로 레이아웃 완료 후 캔버스 크기 설정
            // 모바일에서 onloadedmetadata 시점에 clientWidth/Height가 0인 경우 대응
            requestAnimationFrame(() => {
              const displayW = canvasRef.current?.clientWidth;
              const displayH = canvasRef.current?.clientHeight;
              canvas.width = (displayW && displayW > 0) ? displayW : (isMobileWeb ? 360 : 640);
              canvas.height = (displayH && displayH > 0) ? displayH : 450;
              console.log(`🎨 Canvas size set: ${canvas.width}x${canvas.height}`);
              resolve();
            });
          };
        });

        // 비디오 재생 시작
        await video.play();
        console.log('▶️ Video playing');

        // 영상은 즉시 보이게 — AI 모델은 백그라운드 로딩
        setIsCameraActive(true);
        setAiLoadingStage('mediapipe');
      }

      // MediaPipe Hands만 사용 (Pose 없이 손 위치로 위험 감지)
      console.log('📦 Loading MediaPipe Hands (optimized, version pinned + CDN fallback)...');
      const loadMediaPipe = async () => {
        // Phase 1: MediaPipe 스크립트 병렬 로드 (hands.js + drawing_utils.js)
        console.log('📥 Loading MediaPipe scripts in parallel...');
        await Promise.all([
          loadScriptWithFallback(`@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/hands.js`),
          loadScriptWithFallback(`@mediapipe/drawing_utils@${MEDIAPIPE_DRAWING_VERSION}/drawing_utils.js`),
        ]);

        console.log(`🔧 Initializing Hands (assets via ${workingCdnRef.current})...`);
        const hands = new window.Hands({
          // hands.js 로드에 성공한 CDN에서 동일 버전의 WASM/모델 자산을 받아오도록 통일
          locateFile: (file: string) => {
            return `${workingCdnRef.current}/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/${file}`;
          }
        });

        // 모바일: Lite 모델(0) + 낮은 임계값으로 검출률 향상 / 데스크탑: Full 모델(1)
        const modelComplexity = isMobileWeb ? 0 : 1;
        const detectionConf = isMobileWeb ? 0.5 : 0.6;
        console.log(`⚙️ Setting Hands options (complexity=${modelComplexity}, conf=${detectionConf})...`);
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity,
          minDetectionConfidence: detectionConf,
          minTrackingConfidence: detectionConf,
        });

        hands.onResults(onResults);
        handsRef.current = hands;
        console.log('✅ Hands initialized successfully!');

        // Phase 2: TFJS 스크립트 병렬 로드 (core 먼저, 나머지 3개 병렬)
        setAiLoadingStage('tensorflow');
        console.log('📥 Loading TensorFlow.js libraries (parallel)...');
        await loadScriptWithFallback(`@tensorflow/tfjs-core@${TFJS_VERSION}/dist/tf-core.min.js`);
        await Promise.all([
          loadScriptWithFallback(`@tensorflow/tfjs-converter@${TFJS_VERSION}/dist/tf-converter.min.js`),
          loadScriptWithFallback(`@tensorflow/tfjs-backend-webgl@${TFJS_VERSION}/dist/tf-backend-webgl.min.js`),
          loadScriptWithFallback(`@tensorflow-models/pose-detection@${POSE_DETECTION_VERSION}/dist/pose-detection.min.js`),
        ]);

        console.log('🔧 Initializing TensorFlow.js backend...');

        // WebGL 시도 → 실패 시 CPU 폴백 (저사양 모바일 대응)
        try {
          await window.tf.setBackend('webgl');
          await window.tf.ready();
          console.log('✅ TensorFlow.js backend ready (WebGL)');
        } catch (webglErr) {
          console.warn('⚠️ WebGL unavailable, falling back to CPU:', webglErr);
          await window.tf.setBackend('cpu');
          await window.tf.ready();
          console.log('✅ TensorFlow.js backend ready (CPU fallback)');
        }

        setAiLoadingStage('movenet');
        console.log('🔧 Loading MoveNet model...');

        // MoveNet 모델 로드
        const poseDetector = await window.poseDetection.createDetector(
          window.poseDetection.SupportedModels.MoveNet,
          {
            modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
          }
        );
        poseDetectorRef.current = poseDetector;
        console.log('✅ MoveNet initialized successfully!');

        setAiLoadingStage('ready');
        console.log('🤖 MediaPipe Hands + TensorFlow.js MoveNet ready!');

        // requestAnimationFrame을 사용한 프레임 처리 (Hands + MoveNet)
        let frameProcessCount = 0;
        const processFrame = async () => {
          if (videoRef.current && handsRef.current && poseDetectorRef.current) {
            try {
              frameProcessCount++;
              if (frameProcessCount === 1) {
                console.log('🎬 First processFrame call!');
              }

              // Hands 처리
              await handsRef.current.send({ image: videoRef.current });

              // MoveNet 포즈 감지 — 모바일: 15프레임마다(GPU 여유), 데스크탑: 3프레임마다
              const moveNetInterval = isMobileWeb ? 15 : 3;
              if (frameProcessCount % moveNetInterval === 0) {
                try {
                  const poses = await poseDetectorRef.current.estimatePoses(videoRef.current);

                  if (frameProcessCount === 3) {
                    console.log('🔍 First MoveNet detection attempt');
                    console.log('Poses detected:', poses?.length || 0);
                    if (poses && poses.length > 0) {
                      console.log('Keypoints:', poses[0].keypoints?.length || 0);
                    }
                  }

                  if (poses && poses.length > 0 && poses[0].keypoints) {
                    // MoveNet은 픽셀 좌표(0~videoWidth/Height)를 반환 →
                    // MediaPipe 정규화 좌표(0~1)와 혼용 시 비교 오류 발생
                    // 모바일에서 어깨가 잡히면 "위험"이 항상 발동되는 버그의 근본 원인
                    const vw = videoRef.current?.videoWidth || 1;
                    const vh = videoRef.current?.videoHeight || 1;
                    const normalizedKeypoints = poses[0].keypoints.map((kp: any) => ({
                      ...kp,
                      x: kp.x / vw,
                      y: kp.y / vh,
                    }));
                    poseResultsRef.current = normalizedKeypoints;
                    setPoseDetected(true);
                  } else {
                    poseResultsRef.current = null;
                    setPoseDetected(false);
                  }
                } catch (poseError) {
                  console.error('❌ MoveNet detection error:', poseError);
                  poseResultsRef.current = null;
                  setPoseDetected(false);
                }
              }

              if (frameProcessCount === 1) {
                console.log('✅ First frame sent to MediaPipe Hands + MoveNet');
              }
            } catch (error) {
              console.error('❌ Frame processing error:', error);
            }

            // 다음 프레임 요청 (카메라가 활성화된 동안만)
            if (videoRef.current && videoRef.current.srcObject) {
              animationFrameRef.current = requestAnimationFrame(processFrame);
            }
          } else {
            console.warn('⚠️ processFrame: missing refs', {
              video: !!videoRef.current,
              hands: !!handsRef.current,
              pose: !!poseDetectorRef.current
            });
          }
        };

        console.log('🎬 Starting frame processing...');
        processFrame();
        console.log('✅ Frame processing started');
      };

      await loadMediaPipe();
      // setIsCameraActive(true)는 video.play() 직후 이미 호출됨 — 영상은 그때부터 보임
      console.log('🎉 AI 모델 로드 완료!');

    } catch (error) {
      const err = error as DOMException;
      console.error('❌ Camera error:', err.name, err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError({ type: 'permission' });
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError({ type: 'notfound' });
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError({ type: 'inuse' });
      } else {
        setCameraError({ type: 'unknown' });
      }
    }
  };

  // 스크립트 로드 헬퍼 (단일 URL, 타임아웃 포함)
  const loadScript = (src: string, timeoutMs = 15000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;

      const timer = setTimeout(() => {
        script.remove();
        reject(new Error(`Script load timeout: ${src}`));
      }, timeoutMs);

      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error(`Script load failed: ${src}`));
      };
      document.head.appendChild(script);
    });
  };

  // CDN 폴백 로더 - 1차 실패 시 2차 CDN에서 재시도
  // 성공한 CDN 베이스 URL을 workingCdnRef에 저장하여 후속 자산도 동일 CDN에서 로드
  const loadScriptWithFallback = async (pathSuffix: string): Promise<void> => {
    let lastError: Error | null = null;
    for (const cdnBase of CDN_PROVIDERS) {
      const src = `${cdnBase}/${pathSuffix}`;
      try {
        await loadScript(src);
        workingCdnRef.current = cdnBase;
        console.log(`✅ Loaded ${pathSuffix} from ${cdnBase}`);
        return;
      } catch (e) {
        lastError = e as Error;
        console.warn(`⚠️ ${cdnBase} failed for ${pathSuffix}, trying next...`);
      }
    }
    throw lastError ?? new Error(`All CDNs failed: ${pathSuffix}`);
  };

  // 카메라 중지
  const stopCamera = () => {
    // 애니메이션 프레임 취소
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    // 큐 초기화
    clearQueue();

    setIsCameraActive(false);
    setHandDetected(false);
    setPoseDetected(false);
    setMotionDetected(false);
    setAiLoadingStage('idle');
    wristHistoryRef.current = [[], []];
  };

  // 자막 초기화
  const clearSubtitles = () => {
    setSubtitleHistory([]);
  };

  // 컴포넌트 언마운트 시 카메라 정리
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => { if (onBack) onBack(); else window.history.back(); }}
        >
          <Text style={styles.backButtonText}>← 홈으로</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🤟 실시간 수어 인식</Text>
        <Text style={styles.headerSubtitle}>MediaPipe Hands + Pose + 바운딩 박스 + TTS</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* 상태 정보 */}
        <View style={[styles.statusBar, isMobileWeb && styles.statusBarMobile]}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>카메라</Text>
            <Text style={[styles.statusValue, isCameraActive && styles.statusValue_active]}>
              {isCameraActive ? '🟢 ON' : '⚫ OFF'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>손 감지</Text>
            <Text style={[styles.statusValue, handDetected && styles.statusValue_active]}>
              {handDetected ? '✋ 감지됨' : '❌ 없음'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>몸 감지</Text>
            <Text style={[styles.statusValue, poseDetected && styles.statusValue_active]}>
              {poseDetected ? '🧍 감지됨' : '❌ 없음'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>모션</Text>
            <Text style={[styles.statusValue, motionDetected && styles.statusValue_motion]}>
              {motionDetected ? '🔄 흔들림' : '🎯 정지'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>TTS</Text>
            <Text style={[styles.statusValue, isSpeaking && styles.statusValue_speaking]}>
              {isSpeaking ? '🔊 재생중' : '🔇 대기'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>FPS</Text>
            <Text style={styles.statusValue}>{fps}</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>감지 품질</Text>
            <Text style={[
              styles.statusValue,
              detectionQuality === 'excellent' && styles.qualityExcellent,
              detectionQuality === 'good' && styles.qualityGood,
              detectionQuality === 'poor' && styles.qualityPoor
            ]}>
              {detectionQuality === 'excellent' && '⭐ 최고'}
              {detectionQuality === 'good' && '✅ 양호'}
              {detectionQuality === 'poor' && '⚠️ 부족'}
              {detectionQuality === 'none' && '❌ 없음'}
            </Text>
          </View>
        </View>

        {/* 2개 화면 레이아웃 */}
        <View style={[styles.screensContainer, { flexDirection: isMobileWeb ? 'column' : 'row' }]}>
          {/* 농인 화면 - 카메라 + 수어 인식 */}
          <View style={[styles.screenBox, !isMobileWeb && { minWidth: 500 }]}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>👤 농인 (수어 송신)</Text>
            </View>

            {/* 비디오 + 캔버스 */}
            <View style={styles.videoContainer}>
              {Platform.OS === 'web' && (
                <>
                  {/* 비디오 — 카메라 켜자마자 즉시 표시. MediaPipe가 그리기 시작하면 캔버스가 자연스럽게 위로 덮음 */}
                  <video
                    ref={videoRef as any}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)',
                    }}
                  />
                  <canvas
                    ref={canvasRef as any}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                    }}
                  />
                </>
              )}

              {!isCameraActive && (
                <View style={styles.placeholderOverlay}>
                  {cameraError ? (
                    <>
                      <Text style={styles.placeholderEmoji}>
                        {cameraError.type === 'permission' ? '🚫' : '⚠️'}
                      </Text>
                      <Text style={styles.errorTitle}>
                        {cameraError.type === 'permission' && '카메라 권한이 차단됨'}
                        {cameraError.type === 'notfound' && '카메라를 찾을 수 없음'}
                        {cameraError.type === 'inuse' && '카메라가 사용 중'}
                        {cameraError.type === 'unknown' && '카메라 오류 발생'}
                      </Text>
                      <Text style={styles.errorMessage}>
                        {cameraError.type === 'permission' &&
                          '브라우저 주소창의 카메라 아이콘(🎥)을 클릭하거나\n설정 › 개인정보 › 카메라에서 이 사이트를 허용해 주세요.'}
                        {cameraError.type === 'notfound' &&
                          '카메라 장치를 찾을 수 없습니다.\n카메라가 올바르게 연결되어 있는지 확인해 주세요.'}
                        {cameraError.type === 'inuse' &&
                          '카메라가 다른 앱에서 사용 중입니다.\n다른 앱을 종료한 뒤 아래 버튼을 눌러 주세요.'}
                        {cameraError.type === 'unknown' &&
                          '카메라를 시작하는 중 오류가 발생했습니다.\n페이지를 새로고침하거나 다시 시도해 주세요.'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.placeholderEmoji}>📷</Text>
                      <Text style={styles.placeholderText}>카메라를 시작하세요</Text>
                    </>
                  )}
                </View>
              )}

              {/* AI 모델 로딩 배지 - 카메라는 켜졌지만 AI는 아직 로딩 중 */}
              {isCameraActive && aiLoadingStage !== 'ready' && aiLoadingStage !== 'idle' && (
                <View style={styles.aiLoadingBadge}>
                  <Text style={styles.aiLoadingText}>
                    {aiLoadingStage === 'mediapipe' && '🤚 MediaPipe Hands 로딩...'}
                    {aiLoadingStage === 'tensorflow' && '🧠 TensorFlow.js 로딩...'}
                    {aiLoadingStage === 'movenet' && '🦴 MoveNet 모델 로딩...'}
                  </Text>
                </View>
              )}

              {/* 현재 처리 중인 제스처 */}
              {currentProcessingGesture && (
                <View style={styles.gestureOverlay}>
                  <Text style={styles.gestureText}>▶ {currentProcessingGesture}</Text>
                </View>
              )}

              {/* 큐 상태 표시 */}
              {isCameraActive && queueLength > 0 && (
                <View style={styles.queueOverlay}>
                  <Text style={styles.queueText}>대기 중: {queueLength}개</Text>
                </View>
              )}
            </View>

            {/* 큐/자막 컨트롤 버튼 — 큐 비어도 자막 기록이 있으면 활성 */}
            {isCameraActive && (
              <View style={styles.queueControls}>
                {(() => {
                  const undoDisabled = queueLength === 0 && subtitleHistory.length === 0;
                  const clearDisabled =
                    queueLength === 0 &&
                    subtitleHistory.length === 0 &&
                    !currentProcessingGesture &&
                    !isSpeaking;
                  return (
                    <>
                      <TouchableOpacity
                        style={[styles.queueButton, undoDisabled && styles.buttonDisabled]}
                        onPress={undoLastGesture}
                        disabled={undoDisabled}
                      >
                        <Text style={styles.queueButtonText}>↩ 마지막 취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.clearQueueButton, clearDisabled && styles.buttonDisabled]}
                        onPress={clearQueue}
                        disabled={clearDisabled}
                      >
                        <Text style={styles.queueButtonText}>🗑️ 전체 초기화</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}
              </View>
            )}

            {/* 컨트롤 */}
            <View style={styles.controls}>
              {!isCameraActive ? (
                <TouchableOpacity style={styles.startButton} onPress={startCamera}>
                  <Text style={styles.buttonText}>📹 카메라 시작 & 인식 시작</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.stopButton} onPress={stopCamera}>
                  <Text style={styles.buttonText}>⏹️ 중지</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 인식 가능한 수어 안내 */}
            <View style={styles.gestureGuide}>
              <Text style={styles.guideTitle}>✋ 인식 가능한 수어</Text>

              {/* 인식 유형 안내 (범례) */}
              <View style={styles.legendBox}>
                <View style={styles.legendItem}>
                  <Text style={styles.legendBadgeStatic}>🎯 정적</Text>
                  <Text style={styles.legendDesc}>손 모양만으로 인식</Text>
                </View>
                <View style={styles.legendItem}>
                  <Text style={styles.legendBadgeMotion}>🔄 모션</Text>
                  <Text style={styles.legendDesc}>흔들기 동작 필요</Text>
                </View>
                <View style={styles.legendItem}>
                  <Text style={styles.legendBadgeBoth}>👐 양손</Text>
                  <Text style={styles.legendDesc}>두 손을 모두 사용</Text>
                </View>
              </View>

              {/* 기본 표현 */}
              <View style={styles.guideSection}>
                <Text style={styles.guideSectionTitle}>📢 기본 표현</Text>
                <Text style={styles.guideText}>
                  • 🎯 안녕하세요 - 손 위로 들고 모든 손가락 펴기{'\n'}
                  • 🎯 감사합니다 - 주먹 쥐기{'\n'}
                  • 🎯 네 - 검지만 펴기{'\n'}
                  • 🎯 아니요 - 검지+중지 펴기 (V자){'\n'}
                  • 🎯 괜찮아요 - 엄지 위로 (👍){'\n'}
                  • 🎯 도와주세요 - 손바닥 보이기 (중간 높이)
                </Text>
              </View>

              {/* 긴급 상황 - 손 제스처 */}
              <View style={styles.emergencySection}>
                <Text style={styles.emergencySectionTitle}>🚨 긴급 상황 — 손 제스처</Text>
                <Text style={styles.emergencyText}>
                  • 🎯👐 위험 - 양손을 어깨보다 높이 들기{'\n'}
                  • 🎯 경찰 - 검지만 펴서 얼굴 높이로 들기{'\n'}
                  • 🎯👐 병원 - 양손 검지만 펴고 두 끝을 가깝게{'\n'}
                  • 🎯 아파요 - 주먹을 얼굴(이마) 가까이로{'\n'}
                  • 🎯 119 - 검지+중지+약지 세 손가락 펴기 (W자){'\n'}
                  • 🎯 전화 - 엄지+새끼만 펴기 (🤙){'\n'}
                  • 🔄 구급차 - 손바닥 펴고 좌우로 흔들기{'\n'}
                  • 🔄👐 급해요 - 양손 모두 펴고 동시에 좌우로 흔들기
                </Text>
                <Text style={styles.emergencyTextFooter}>
                  💡 모션 인식: 손목을 0.5초간 추적해 표준편차+방향전환 기반 흔들기 감지
                </Text>
              </View>

              {/* 긴급 상황 - 몸 전체 포즈 (MoveNet) */}
              <View style={[styles.emergencySection, { marginTop: 10, borderColor: '#FF8800' }]}>
                <Text style={styles.emergencySectionTitle}>🦴 긴급 포즈 — 몸 전체 인식 (MoveNet)</Text>
                <Text style={styles.emergencyText}>
                  • 🆘 쓰러졌어요 - 몸이 쓰러져 코가 어깨보다 아래로 내려간 상태{'\n'}
                  • ⚠️ 기절위기 - 한쪽으로 심하게 기울어진 상태 (어깨 높이 차이 큼){'\n'}
                  • 🚨 위험 - 양손을 어깨 위로 높이 들기{'\n'}
                  • 🆘 SOS - 팔을 가슴 앞에서 X자로 교차{'\n'}
                  • 🙏 도움요청 - 양팔을 T자로 크게 벌리기{'\n'}
                  • 🤕 두통 - 양 손목을 머리 근처로 가져가기{'\n'}
                  • 💔 가슴통증 - 손을 가슴 중앙으로 가져가기
                </Text>
                <Text style={styles.emergencyTextFooter}>
                  💡 몸 포즈 인식: TensorFlow.js MoveNet이 17개 신체 키포인트를 분석해 전신 자세를 감지합니다. 인식 시 바운딩 박스와 제스처명이 함께 표시됩니다.
                </Text>
              </View>
            </View>
          </View>

          {/* 청인 화면 - 자막 수신 */}
          <View style={[styles.screenBox, !isMobileWeb && { minWidth: 500 }]}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>👤 청인 (자막 수신)</Text>
            </View>

            {/* 최신 자막 크게 표시 */}
            <View style={styles.currentSubtitleBox}>
              {subtitleHistory.length > 0 ? (
                <>
                  <Text style={styles.currentSubtitleLabel}>최신 수신</Text>
                  <Text style={styles.currentSubtitleText}>
                    {subtitleHistory[subtitleHistory.length - 1].text}
                  </Text>
                  {isSpeaking && (
                    <Text style={styles.speakingIndicator}>🔊 음성 재생 중...</Text>
                  )}
                </>
              ) : (
                <Text style={styles.emptySubtitle}>수신 대기 중...</Text>
              )}
            </View>

            {/* 자막 히스토리 */}
            <View style={styles.subtitleHistory}>
              <View style={styles.subtitleHistoryHeader}>
                <Text style={styles.historyTitle}>📝 자막 기록</Text>
                {subtitleHistory.length > 0 && (
                  <TouchableOpacity onPress={clearSubtitles}>
                    <Text style={styles.clearButton}>지우기</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={styles.historyList}>
                {subtitleHistory.length === 0 ? (
                  <Text style={styles.emptyText}>아직 수신된 자막이 없습니다</Text>
                ) : (
                  subtitleHistory.map((item, index) => (
                    <View key={index} style={styles.historyItem}>
                      <Text style={styles.historyItemText}>
                        {index + 1}. {item.text}
                      </Text>
                      <Text style={styles.historyItemTime}>
                        {new Date(item.timestamp).toLocaleTimeString('ko-KR')}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>

        {/* 기술 정보 */}
        <View style={styles.techInfo}>
          <Text style={styles.techInfoTitle}>🔬 사용 중인 기술</Text>
          <View style={styles.techList}>
            <Text style={styles.techItem}>✅ MediaPipe Hands - 21개 손 랜드마크 추출 (손 동작 인식)</Text>
            <Text style={styles.techItem}>✅ TensorFlow.js MoveNet Lightning - 17개 신체 키포인트로 7종 긴급 포즈 감지 (쓰러짐/기절위기/위험/SOS/도움요청/두통/가슴통증)</Text>
            <Text style={styles.techItem}>✅ 손 크기 기반 동적 임계값 — 카메라 거리·모바일/PC 환경에 자동 적응</Text>
            <Text style={styles.techItem}>✅ 모바일 최적화 — User-Agent+터치 감지, portrait 모드 임계값 분기, 해상도 제한(640×480), WebGL→CPU 폴백</Text>
            <Text style={styles.techItem}>✅ MoveNet 좌표 정규화 — 픽셀→0~1 변환으로 MediaPipe 좌표와 혼용 오류 수정</Text>
            <Text style={styles.techItem}>✅ 실시간 바운딩 박스 — 손(초록) / 포즈 제스처(제스처별 색상 + 이모지 라벨)</Text>
            <Text style={styles.techItem}>✅ 정적 패턴 인식 - 11가지 수어 (기본 6 + 긴급 5)</Text>
            <Text style={styles.techItem}>✅ 모션 패턴 인식 - 손목 0.5초 추적 → 표준편차+방향전환 기반 흔들기 감지 (구급차/급해요)</Text>
            <Text style={styles.techItem}>✅ 제스처 안정화 필터 (5프레임 연속 검증) + 긴급 우선순위 큐</Text>
            <Text style={styles.techItem}>✅ CDN 폴백 (jsdelivr → unpkg) · 다단계 AI 로딩 표시</Text>
            <Text style={styles.techItem}>✅ Web Speech API - 한국어 TTS + 자막 동기화</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  header: {
    backgroundColor: colors.primary.main,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: colors.primary.light,
  },
  backButton: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.lg,
    padding: spacing.sm,
    zIndex: 10,
  },
  backButtonText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },
  headerTitle: {
    fontSize: fonts.sizes['3xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerSubtitle: {
    fontSize: fonts.sizes.base,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.medium,
  },
  content: {
    flex: 1,
  },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    backgroundColor: '#1A1F3A',
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: 12,
    justifyContent: 'space-around',
    borderWidth: 2,
    borderColor: colors.primary.main,
  },
  statusBarMobile: {
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  statusItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  statusLabel: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[300],
    marginBottom: spacing.sm,
    fontWeight: fonts.weights.medium,
  },
  statusValue: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
  },
  statusValue_active: {
    color: '#00FF88',
  },
  statusValue_speaking: {
    color: '#FFB800',
  },
  statusValue_motion: {
    color: '#FF6B6B',  // 빨간 분홍 — 모션 감지 강조
  },
  qualityExcellent: {
    color: '#00FF88',
  },
  qualityGood: {
    color: '#4ADE80',
  },
  qualityPoor: {
    color: '#FBBF24',
  },

  // Screens
  screensContainer: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  screenBox: {
    flex: 1,
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary.dark,
  },
  screenHeader: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary.main,
  },
  screenTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
  },

  // Video
  videoContainer: {
    height: 450,
    backgroundColor: '#000',
    borderRadius: 12,
    marginBottom: spacing.lg,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.primary.main,
  },
  placeholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  placeholderEmoji: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  placeholderText: {
    fontSize: fonts.sizes.xl,
    color: '#FFFFFF',
    fontWeight: fonts.weights.semibold,
  },
  errorTitle: {
    fontSize: fonts.sizes.xl,
    color: '#FF6B6B',
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: fonts.sizes.base,
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.xl,
  },
  gestureOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00FF88',
  },
  gestureText: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  queueOverlay: {
    position: 'absolute',
    top: 24,
    right: 24,
    backgroundColor: 'rgba(255, 183, 0, 0.95)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFB800',
  },
  queueText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#000000',
  },

  // AI 로딩 단계 배지 - 카메라 켜진 직후 영상은 보이지만 AI 모델 백그라운드 로드 중일 때 표시
  aiLoadingBadge: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(99, 102, 241, 0.95)',  // 보라색 (큐 배지와 구별)
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#818CF8',
  },
  aiLoadingText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
  },

  // Queue Controls
  queueControls: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  queueButton: {
    flex: 1,
    backgroundColor: '#6366F1',
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#818CF8',
  },
  clearQueueButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F87171',
  },
  queueButtonText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.4,  // 비활성 상태 시각화 — 클릭 가능 여부를 즉시 인지
  },

  // Controls
  controls: {
    marginBottom: spacing.lg,
  },
  startButton: {
    backgroundColor: '#00C853',
    paddingVertical: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00FF88',
  },
  stopButton: {
    backgroundColor: '#D32F2F',
    paddingVertical: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF5252',
  },
  buttonText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Gesture Guide
  gestureGuide: {
    backgroundColor: '#252B48',
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.secondary.main,
  },

  // 인식 유형 범례 (정적/모션/양손)
  legendBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  legendBadgeStatic: {
    fontSize: fonts.sizes.sm,
    color: '#00FF88',
    fontWeight: fonts.weights.bold,
    minWidth: 70,
  },
  legendBadgeMotion: {
    fontSize: fonts.sizes.sm,
    color: '#FF6B6B',
    fontWeight: fonts.weights.bold,
    minWidth: 70,
  },
  legendBadgeBoth: {
    fontSize: fonts.sizes.sm,
    color: '#FFB800',
    fontWeight: fonts.weights.bold,
    minWidth: 70,
  },
  legendDesc: {
    fontSize: fonts.sizes.sm,
    color: '#FFFFFF',
    fontWeight: fonts.weights.medium,
  },
  guideTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFB800',
    marginBottom: spacing.md,
  },
  guideText: {
    fontSize: fonts.sizes.base,
    color: '#FFFFFF',
    lineHeight: 26,
    fontWeight: fonts.weights.medium,
  },
  guideSection: {
    marginBottom: spacing.lg,
  },
  guideSectionTitle: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.bold,
    color: '#00FF88',
    marginBottom: spacing.sm,
  },
  emergencySection: {
    backgroundColor: '#FF1744',
    padding: spacing.md,
    borderRadius: 8,
    marginTop: spacing.md,
    borderWidth: 2,
    borderColor: '#FFB800',
  },
  emergencySectionTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  emergencyText: {
    fontSize: fonts.sizes.base,
    color: '#FFFFFF',
    lineHeight: 26,
    fontWeight: fonts.weights.semibold,
  },
  emergencyTextFooter: {
    fontSize: fonts.sizes.sm,
    color: '#FFE0B2',
    marginTop: spacing.sm,
    fontStyle: 'italic',
    fontWeight: fonts.weights.medium,
  },

  // Current Subtitle
  currentSubtitleBox: {
    backgroundColor: '#252B48',
    padding: spacing['2xl'],
    borderRadius: 16,
    marginBottom: spacing.lg,
    minHeight: 180,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#00FF88',
  },
  currentSubtitleLabel: {
    fontSize: fonts.sizes.base,
    color: '#FFB800',
    marginBottom: spacing.md,
    fontWeight: fonts.weights.bold,
  },
  currentSubtitleText: {
    fontSize: 42,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptySubtitle: {
    fontSize: fonts.sizes.xl,
    color: colors.gray[400],
    textAlign: 'center',
    fontWeight: fonts.weights.medium,
  },
  speakingIndicator: {
    fontSize: fonts.sizes.lg,
    color: '#FFB800',
    marginTop: spacing.md,
    fontWeight: fonts.weights.bold,
  },

  // Subtitle History
  subtitleHistory: {
    backgroundColor: '#252B48',
    borderRadius: 12,
    padding: spacing.lg,
    maxHeight: 350,
    borderWidth: 2,
    borderColor: colors.primary.dark,
  },
  subtitleHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary.main,
  },
  historyTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
  },
  clearButton: {
    fontSize: fonts.sizes.base,
    color: '#FF5252',
    fontWeight: fonts.weights.bold,
  },
  historyList: {
    maxHeight: 250,
  },
  emptyText: {
    fontSize: fonts.sizes.base,
    color: colors.gray[400],
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontWeight: fonts.weights.medium,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  historyItemText: {
    fontSize: fonts.sizes.lg,
    color: '#FFFFFF',
    flex: 1,
    fontWeight: fonts.weights.semibold,
  },
  historyItemTime: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[400],
    marginLeft: spacing.md,
  },

  // Tech Info
  techInfo: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing['2xl'],
    padding: spacing.xl,
    backgroundColor: '#1A1F3A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.secondary.main,
  },
  techInfoTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: '#FFB800',
    marginBottom: spacing.lg,
  },
  techList: {
    gap: spacing.md,
  },
  techItem: {
    fontSize: fonts.sizes.base,
    color: '#FFFFFF',
    lineHeight: 24,
    fontWeight: fonts.weights.medium,
  },
});
