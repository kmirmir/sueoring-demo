import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  useWindowDimensions, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

// ── 버전 핀 (RealSignLanguageScreen / DeafParticipantView와 동일) ──────
const MEDIAPIPE_HANDS_VERSION   = '0.4.1675469240';
const MEDIAPIPE_DRAWING_VERSION = '0.3.1675466124';
const TFJS_VERSION              = '4.22.0';
const POSE_DETECTION_VERSION    = '2.1.3';
const CDN_PROVIDERS = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'] as const;

// ── 모션 감지 파라미터 (RealSignLanguageScreen과 동일) ────────────────
const SHAKE_HISTORY_FRAMES           = 12;
const SHAKE_MIN_FRAMES               = 8;
const SHAKE_STDDEV_THRESHOLD         = 0.015;
const SHAKE_DIRECTION_CHANGES_MIN    = 2;
const SHAKE_DIRECTION_DELTA_MIN      = 0.003;
const MAX_MISSED_FRAMES_BEFORE_CLEAR = 5;
const STABILITY_THRESHOLD            = 5;
const MOTION_STABILITY_THRESHOLD     = 3;
const MOTION_GESTURES                = ['구급차', '급해요'];

const DANGER_COOLDOWN_MS = 5000;
const BASE_LAT = 37.5665;
const BASE_LNG = 126.9780;

// 위험도 분류
const HIGH_DANGER = new Set(['119', '구급차', '급해요', '쓰러졌어요', '기절위기', '위험', 'SOS', '가슴통증']);
const MED_DANGER  = new Set(['아파요', '경찰', '병원', '도움요청', '도와주세요', '두통', '전화']);

interface DangerEvent {
  id: number;
  time: Date;
  lat: number;
  lng: number;
  message: string;
  severity: 'high' | 'medium';
  snapshot?: string;
}

interface CCTVMonitorScreenProps {
  onBack: () => void;
}

export default function CCTVMonitorScreen({ onBack }: CCTVMonitorScreenProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isMobileWeb = Platform.OS === 'web' && (
    /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && width < 1024)
  );

  // ── Refs ────────────────────────────────────────────────────────────
  const videoRef           = useRef<any>(null);
  const canvasRef          = useRef<any>(null);
  const handsRef           = useRef<any>(null);
  const poseDetectorRef    = useRef<any>(null);
  const poseResultsRef     = useRef<any>(null);
  const animFrameRef       = useRef<number | null>(null);
  const workingCdnRef      = useRef<string>(CDN_PROVIDERS[0]);
  const wristHistoryRef    = useRef<Array<Array<{ x: number; y: number }>>>([[], []]);
  const slotMissedRef      = useRef<[number, number]>([0, 0]);
  const isPortraitRef      = useRef(false);
  const gestureStabBuf     = useRef<string[]>([]);
  const lastGestureRef     = useRef('');
  const lastGestureTimeRef = useRef(0);
  const lastDangerRef      = useRef('');
  const lastDangerTimeRef  = useRef(0);
  const eventIdRef         = useRef(0);
  const toastTimerRef      = useRef<any>(null);
  const gestureResetRef    = useRef<any>(null);
  const userLocRef         = useRef<{ lat: number; lng: number }>({ lat: BASE_LAT, lng: BASE_LNG });
  const canvasReadyRef     = useRef(false);

  // ── State ────────────────────────────────────────────────────────────
  const [cameraActive, setCameraActive]     = useState(false);
  const [canvasReady, setCanvasReady]       = useState(false);
  const [aiReady, setAiReady]               = useState(false);
  const [loadingStage, setLoadingStage]     = useState('');
  const [events, setEvents]                 = useState<DangerEvent[]>([]);
  const [toastMsg, setToastMsg]             = useState('');
  const [toastVisible, setToastVisible]     = useState(false);
  const [selectedEvent, setSelectedEvent]   = useState<DangerEvent | null>(null);
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [recVisible, setRecVisible]         = useState(true);
  const [motionDetected, setMotionDetected] = useState(false);
  const [handDetected, setHandDetected]     = useState(false);
  const [currentGesture, setCurrentGesture] = useState('');

  // ── Clock & REC blink ─────────────────────────────────────────────
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    const blink = setInterval(() => setRecVisible(v => !v), 800);
    return () => { clearInterval(clock); clearInterval(blink); };
  }, []);

  // ── Geolocation ───────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { userLocRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => {}
      );
    }
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 4000);
  }, []);

  // ── Add danger event ──────────────────────────────────────────────
  const addDanger = useCallback((message: string, snapshot?: string) => {
    const now = Date.now();
    if (message === lastDangerRef.current && now - lastDangerTimeRef.current < DANGER_COOLDOWN_MS) return;
    lastDangerRef.current = message;
    lastDangerTimeRef.current = now;

    const base = userLocRef.current;
    const lat = parseFloat((base.lat + (Math.random() * 0.004 - 0.002)).toFixed(6));
    const lng = parseFloat((base.lng + (Math.random() * 0.006 - 0.003)).toFixed(6));
    const high = HIGH_DANGER.has(message);

    const ev: DangerEvent = { id: ++eventIdRef.current, time: new Date(), lat, lng, message, severity: high ? 'high' : 'medium', snapshot };
    setEvents(prev => [ev, ...prev]);
    showToast(`${high ? '🚨' : '⚠️'} 위험 감지: ${message}`);
  }, [showToast]);

  // ── 흔들기 감지 (RealSignLanguageScreen과 동일) ───────────────────
  const isSlotShaking = useCallback((slot: number): boolean => {
    const history = wristHistoryRef.current[slot];
    if (!history || history.length < SHAKE_MIN_FRAMES) return false;
    const meanX = history.reduce((s, p) => s + p.x, 0) / history.length;
    const meanY = history.reduce((s, p) => s + p.y, 0) / history.length;
    const varX  = history.reduce((s, p) => s + (p.x - meanX) ** 2, 0) / history.length;
    const varY  = history.reduce((s, p) => s + (p.y - meanY) ** 2, 0) / history.length;
    if (Math.max(Math.sqrt(varX), Math.sqrt(varY)) < SHAKE_STDDEV_THRESHOLD) return false;
    let dir = 0;
    for (let i = 2; i < history.length; i++) {
      const dx1 = history[i-1].x - history[i-2].x;
      const dx2 = history[i].x   - history[i-1].x;
      if (Math.sign(dx1) !== Math.sign(dx2) && Math.abs(dx1) > SHAKE_DIRECTION_DELTA_MIN) dir++;
    }
    return dir >= SHAKE_DIRECTION_CHANGES_MIN;
  }, []);

  // ── 손 제스처 인식 (RealSignLanguageScreen과 동일 — 전체 13종) ────
  const recognizeGesture = useCallback((landmarks: any, isShaking = false): string | null => {
    if (!landmarks || landmarks.length === 0) return null;
    try {
      const wrist=landmarks[0], thumbTip=landmarks[4], indexTip=landmarks[8];
      const middleTip=landmarks[12], ringTip=landmarks[16], pinkyTip=landmarks[20];
      const indexMcp=landmarks[5], middleMcp=landmarks[9], ringMcp=landmarks[13], pinkyMcp=landmarks[17];

      const handSize = Math.abs(wrist.y - middleMcp.y);
      const thr = Math.max(handSize * 0.3, 0.02);

      const indexExt  = indexTip.y  < indexMcp.y  - thr;
      const middleExt = middleTip.y < middleMcp.y - thr;
      const ringExt   = ringTip.y   < ringMcp.y   - thr;
      const pinkyExt  = pinkyTip.y  < pinkyMcp.y  - thr;
      const indexCls  = indexTip.y  > indexMcp.y;
      const middleCls = middleTip.y > middleMcp.y;
      const ringCls   = ringTip.y   > ringMcp.y;
      const pinkyCls  = pinkyTip.y  > pinkyMcp.y;
      const thumbSide = Math.abs(thumbTip.x - indexMcp.x) > Math.max(handSize * 0.8, 0.10);

      const hh = wrist.y;
      const isPortrait    = isPortraitRef.current;
      const faceThr       = isPortrait ? 0.42 : 0.35;
      const helloThr      = isPortrait ? 0.50 : 0.40;
      const midMin        = isPortrait ? 0.42 : 0.35;
      const midMax        = isPortrait ? 0.82 : 0.70;
      const ambMin        = isPortrait ? 0.45 : 0.40;
      const ambMax        = isPortrait ? 0.82 : 0.70;
      const atFace        = hh < faceThr;
      const allExt        = indexExt && middleExt && ringExt && pinkyExt;

      // 긴급 수어 (구체적 패턴 우선)
      if (indexCls && middleCls && ringCls && pinkyCls && atFace)                              return '아파요';
      if (indexExt && middleCls && ringCls && pinkyCls && atFace)                              return '경찰';
      if (indexExt && middleExt && ringExt && pinkyCls)                                        return '119';
      if (thumbSide && pinkyExt && indexCls && middleCls && ringCls)                           return '전화';
      // 모션 기반
      if (allExt && isShaking && hh > ambMin && hh < ambMax)                                  return '구급차';
      // 기본 수어
      if (hh < helloThr && allExt)                                                             return '안녕하세요';
      if (indexCls && middleCls && ringCls && pinkyCls)                                        return '감사합니다';
      if (indexTip.y < indexMcp.y - thr * 2 && middleCls && ringCls && pinkyCls)              return '네';
      if (indexExt && middleExt && ringCls && pinkyCls)                                        return '아니요';
      const thumbUp = thumbTip.y < wrist.y - Math.max(handSize * 0.8, 0.08);
      if (thumbUp && indexCls && middleCls)                                                    return '괜찮아요';
      if (allExt && hh > midMin && hh < midMax)                                               return '도와주세요';
    } catch {}
    return null;
  }, []);

  // ── onResults: 좌우 반전 + 전체 수어/포즈 감지 ─────────────────────
  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 첫 프레임 도달: drawImage 전에 캔버스 활성화 (drawImage 실패해도 overlay 해제)
    if (!canvasReadyRef.current) {
      canvasReadyRef.current = true;
      setCanvasReady(true);
    }

    const img = results.image as HTMLVideoElement | null;
    if (!img) return;
    const videoW = (img.videoWidth  || canvas.width)  || 640;
    const videoH = (img.videoHeight || canvas.height) || 480;
    if (!videoW || !videoH) return;

    const scale  = Math.max(canvas.width / videoW, canvas.height / videoH);
    const imgX   = (canvas.width  - videoW * scale) / 2;
    const imgY   = (canvas.height - videoH * scale) / 2;

    // 좌우 반전 toCanvasPx (DeafParticipantView와 동일)
    const toPx = (nx: number, ny: number) => ({
      x: canvas.width - (nx * videoW * scale + imgX),
      y: ny * videoH * scale + imgY,
    });

    const now = Date.now();
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 좌우 반전 영상 그리기
    try {
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, imgX, imgY, videoW * scale, videoH * scale);
      ctx.restore();
    } catch {
      ctx.restore();
    }

    // 손목 히스토리 업데이트 (누락 프레임 보호)
    const slotHands: [any, any] = [null, null];
    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i]?.label;
        const lm    = results.multiHandLandmarks[i];
        if (label === 'Left'  && !slotHands[0]) slotHands[0] = lm;
        if (label === 'Right' && !slotHands[1]) slotHands[1] = lm;
      }
    }
    for (let s = 0 as 0 | 1; s < 2; s++) {
      const hand = slotHands[s];
      if (hand?.[0]) {
        wristHistoryRef.current[s].push({ x: hand[0].x, y: hand[0].y });
        if (wristHistoryRef.current[s].length > SHAKE_HISTORY_FRAMES) wristHistoryRef.current[s].shift();
        slotMissedRef.current[s] = 0;
      } else {
        slotMissedRef.current[s]++;
        if (slotMissedRef.current[s] >= MAX_MISSED_FRAMES_BEFORE_CLEAR) wristHistoryRef.current[s] = [];
      }
    }
    const shaking = isSlotShaking(0) || isSlotShaking(1);
    setMotionDetected(shaking);

    // 양손 바운딩 박스 헬퍼 (반전 적용: maxX를 기준으로)
    const drawTwoHandBox = (h1: any, h2: any, label: string, color: string) => {
      let mnX=1,mnY=1,mxX=0,mxY=0;
      [h1,h2].forEach(h=>h.forEach((lm:any)=>{ mnX=Math.min(mnX,lm.x);mnY=Math.min(mnY,lm.y);mxX=Math.max(mxX,lm.x);mxY=Math.max(mxY,lm.y); }));
      const {x:bx,y:by}=toPx(mxX,mnY);
      const bw=(mxX-mnX)*videoW*scale, bh=(mxY-mnY)*videoH*scale;
      ctx.strokeStyle=color; ctx.lineWidth=4; ctx.strokeRect(bx,by,bw,bh);
      ctx.fillStyle=color==='#FF0000'?'rgba(255,0,0,0.9)':'rgba(0,136,255,0.9)';
      ctx.fillRect(bx,by-50,Math.max(bw,150),45);
      ctx.fillStyle='#FFF'; ctx.font='bold 28px Arial'; ctx.fillText(label,bx+10,by-18);
    };

    let recognized: string | null = null;

    // ── MoveNet 포즈 기반 긴급 감지 7종 (RealSignLanguageScreen과 동일) ──
    if (poseResultsRef.current && Array.isArray(poseResultsRef.current)) {
      const kp=poseResultsRef.current;
      const v=(k:any)=>k&&typeof k.score==='number'&&k.score>0.3;
      const nose=kp[0],lSh=kp[5],rSh=kp[6],lWr=kp[9],rWr=kp[10],lHip=kp[11],rHip=kp[12];
      let pg:string|null=null, pc='#FF0000', pe='🚨';

      if (!pg&&v(nose)&&v(lSh)&&v(rSh)&&nose.y>(lSh.y+rSh.y)/2+0.05)                        { pg='쓰러졌어요'; pc='#FF0000'; pe='🆘'; }
      if (!pg&&v(lSh)&&v(rSh)&&Math.abs(lSh.y-rSh.y)>0.18)                                   { pg='기절위기'; pc='#FF4500'; pe='⚠️'; }
      if (!pg&&results.multiHandLandmarks?.length===2&&v(lSh)&&v(rSh)) {
        const h1=results.multiHandLandmarks[0],h2=results.multiHandLandmarks[1];
        if (h1.reduce((s:number,l:any)=>s+l.y,0)/h1.length<lSh.y&&h2.reduce((s:number,l:any)=>s+l.y,0)/h2.length<rSh.y) { pg='위험'; pc='#FF0000'; pe='🚨'; }
      }
      if (!pg&&v(lWr)&&v(rWr)&&v(lSh)&&v(rSh)&&lWr.x>rWr.x&&Math.abs(lWr.y-rWr.y)<0.15&&lWr.y>lSh.y&&rWr.y>rSh.y) { pg='SOS'; pc='#FF6600'; pe='🆘'; }
      if (!pg&&v(lWr)&&v(rWr)&&v(lSh)&&v(rSh)) {
        const sw=Math.abs(lSh.x-rSh.x),ww=Math.abs(lWr.x-rWr.x),say=(lSh.y+rSh.y)/2,way=(lWr.y+rWr.y)/2;
        if (ww>sw*1.8&&Math.abs(way-say)<0.25) { pg='도움요청'; pc='#FF8800'; pe='🙏'; }
      }
      if (!pg&&v(nose)&&v(lWr)&&v(rWr)&&Math.hypot(lWr.x-nose.x,lWr.y-nose.y)<0.18&&Math.hypot(rWr.x-nose.x,rWr.y-nose.y)<0.18) { pg='두통'; pc='#CC44FF'; pe='🤕'; }
      if (!pg&&v(lSh)&&v(rSh)&&v(lHip)&&v(rHip)) {
        const cx=(lSh.x+rSh.x)/2,cy=((lSh.y+rSh.y)/2+(lHip.y+rHip.y)/2)/2;
        if ((v(lWr)&&Math.hypot(lWr.x-cx,lWr.y-cy)<0.12)||(v(rWr)&&Math.hypot(rWr.x-cx,rWr.y-cy)<0.12)) { pg='가슴통증'; pc='#FF2255'; pe='💔'; }
      }

      if (pg) {
        recognized = pg;
        let mnX=1,mnY=1,mxX=0,mxY=0;
        kp.forEach((k:any)=>{ if(v(k)){mnX=Math.min(mnX,k.x);mnY=Math.min(mnY,k.y);mxX=Math.max(mxX,k.x);mxY=Math.max(mxY,k.y);} });
        const pad=0.04;
        // 반전: mxX+pad → 화면 기준 왼쪽 시작점
        const {x:bx,y:by}=toPx(Math.min(1,mxX+pad),Math.max(0,mnY-pad));
        const bw=(Math.min(1,mxX+pad)-Math.max(0,mnX-pad))*videoW*scale;
        const bh=(Math.min(1,mxY+pad)-Math.max(0,mnY-pad))*videoH*scale;
        ctx.strokeStyle=pc; ctx.lineWidth=4; ctx.strokeRect(bx,by,bw,bh);
        const lt=`${pe} ${pg}`; ctx.font='bold 26px Arial';
        const lw=Math.max(ctx.measureText(lt).width+24,140);
        ctx.fillStyle=pc; ctx.globalAlpha=0.88; ctx.fillRect(bx,by-46,lw,40); ctx.globalAlpha=1.0;
        ctx.fillStyle='#FFF'; ctx.fillText(lt,bx+10,by-16);
      }
    }

    // ── 병원: 양손 검지 교차 ────────────────────────────────────────
    if (!recognized && results.multiHandLandmarks?.length===2) {
      const h1=results.multiHandLandmarks[0], h2=results.multiHandLandmarks[1];
      const isIndexOnly=(h:any)=>h[8].y<h[5].y-0.03&&h[12].y>h[9].y&&h[16].y>h[13].y&&h[20].y>h[17].y;
      if (isIndexOnly(h1)&&isIndexOnly(h2)&&Math.hypot(h1[8].x-h2[8].x,h1[8].y-h2[8].y)<0.15) {
        recognized='병원'; drawTwoHandBox(h1,h2,'🏥 병원','#0088FF');
      }
    }

    // ── 급해요: 양손 펼침 + 양손 흔들기 ────────────────────────────
    if (!recognized && results.multiHandLandmarks?.length===2) {
      const h1=results.multiHandLandmarks[0], h2=results.multiHandLandmarks[1];
      const isOpen=(h:any)=>h[8].y<h[5].y-0.03&&h[12].y<h[9].y-0.03&&h[16].y<h[13].y-0.03&&h[20].y<h[17].y-0.03;
      if (isOpen(h1)&&isOpen(h2)&&isSlotShaking(0)&&isSlotShaking(1)) {
        recognized='급해요'; drawTwoHandBox(h1,h2,'⚡ 급해요','#FF0000');
      }
    }

    // ── 단일 손 제스처 + 스켈레톤 그리기 ────────────────────────────
    if (!recognized && results.multiHandLandmarks?.length>0) {
      setHandDetected(true);
      for (let hi=0; hi<results.multiHandLandmarks.length; hi++) {
        const lm=results.multiHandLandmarks[hi];
        const label=results.multiHandedness?.[hi]?.label;
        const slot=label==='Right'?1:0;

        // 반전 적용한 스켈레톤 (canvas 재정규화)
        const scaled=lm.map((l:any)=>{ const{x,y}=toPx(l.x,l.y); return{...l,x:x/canvas.width,y:y/canvas.height}; });
        if ((window as any).drawConnectors&&(window as any).HAND_CONNECTIONS) {
          (window as any).drawConnectors(ctx,scaled,(window as any).HAND_CONNECTIONS,{color:'#00FF00',lineWidth:5});
        }
        if ((window as any).drawLandmarks) {
          (window as any).drawLandmarks(ctx,scaled,{color:'#FF0000',lineWidth:2,radius:5});
        }

        // 바운딩 박스 (반전: mxX를 기준)
        let mnX=1,mnY=1,mxX=0,mxY=0;
        lm.forEach((l:any)=>{ mnX=Math.min(mnX,l.x);mnY=Math.min(mnY,l.y);mxX=Math.max(mxX,l.x);mxY=Math.max(mxY,l.y); });
        const {x:bx,y:by}=toPx(mxX,mnY);
        const bw=(mxX-mnX)*videoW*scale, bh=(mxY-mnY)*videoH*scale;
        ctx.strokeStyle='#00FF00'; ctx.lineWidth=3; ctx.strokeRect(bx,by,bw,bh);

        if (!recognized) {
          recognized=recognizeGesture(lm, isSlotShaking(slot));
          if (recognized) {
            const lw=Math.max(bw,120);
            ctx.fillStyle='rgba(0,255,0,0.8)'; ctx.fillRect(bx,by-36,lw,32);
            ctx.fillStyle='#000'; ctx.font='bold 18px Arial'; ctx.fillText(recognized,bx+8,by-12);
          }
        }
      }
    } else if (!recognized) {
      setHandDetected(false);
    }

    // ── 안정화 필터 + 위험 이벤트 트리거 ────────────────────────────
    if (recognized) {
      gestureStabBuf.current.push(recognized);
      if (gestureStabBuf.current.length > 10) gestureStabBuf.current.shift();
      const isMotion = MOTION_GESTURES.includes(recognized);
      const thr      = isMotion ? MOTION_STABILITY_THRESHOLD : STABILITY_THRESHOLD;
      const recent   = gestureStabBuf.current.slice(-thr);
      const stable   = recent.length >= thr && recent.every(g => g === recognized);

      if (stable && recognized !== lastGestureRef.current && (now - lastGestureTimeRef.current) > 1000) {
        lastGestureRef.current  = recognized;
        lastGestureTimeRef.current = now;
        setCurrentGesture(recognized);
        gestureStabBuf.current = [];

        // 5초 뒤 자동 초기화
        if (gestureResetRef.current) clearTimeout(gestureResetRef.current);
        gestureResetRef.current = setTimeout(() => setCurrentGesture(''), 5000);

        // 위험 수어만 이벤트 목록에 추가 (캔버스 스냅샷 함께 저장)
        if (HIGH_DANGER.has(recognized) || MED_DANGER.has(recognized)) {
          const snap = (canvasRef.current as HTMLCanvasElement | null)?.toDataURL('image/jpeg', 0.85) ?? undefined;
          addDanger(recognized, snap);
        }
      }
    } else {
      gestureStabBuf.current = [];
    }

    ctx.restore();
  }, [isSlotShaking, recognizeGesture, addDanger]);

  // ── 스크립트 로더 ────────────────────────────────────────────────
  const loadScript = (src: string, timeout = 15000): Promise<void> => new Promise((res, rej) => {
    if (typeof document === 'undefined') { res(); return; }
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = src;
    const t = setTimeout(() => { s.remove(); rej(new Error(`timeout: ${src}`)); }, timeout);
    s.onload = () => { clearTimeout(t); res(); };
    s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error(`failed: ${src}`)); };
    document.head.appendChild(s);
  });

  const loadWithFallback = async (path: string) => {
    let last: Error | null = null;
    for (const cdn of CDN_PROVIDERS) {
      try { await loadScript(`${cdn}/${path}`); workingCdnRef.current = cdn; return; }
      catch (e) { last = e as Error; }
    }
    throw last;
  };

  // ── 카메라 시작 ──────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    try {
      const vc = isMobileWeb
        ? { facingMode:'user', width:{ideal:640,max:1280}, height:{ideal:480,max:720}, frameRate:{ideal:30} }
        : { width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}, facingMode:'user' };

      const stream = await navigator.mediaDevices
        .getUserMedia({ video: vc, audio: false })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));

      const video  = videoRef.current  as HTMLVideoElement;
      const canvas = canvasRef.current as HTMLCanvasElement;
      video.srcObject = stream;
      await new Promise<void>(res => {
        video.onloadedmetadata = () => {
          isPortraitRef.current = video.videoWidth < video.videoHeight;
          requestAnimationFrame(() => {
            canvas.width  = canvas.clientWidth  || (isMobileWeb ? 360 : 1280);
            canvas.height = canvas.clientHeight || (isMobileWeb ? 450 : 720);
            res();
          });
        };
      });
      await video.play();
      setCameraActive(true);
      setLoadingStage('mediapipe');

      await Promise.all([
        loadWithFallback(`@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/hands.js`),
        loadWithFallback(`@mediapipe/drawing_utils@${MEDIAPIPE_DRAWING_VERSION}/drawing_utils.js`),
      ]);

      const hands = new (window as any).Hands({
        locateFile: (f: string) => `${workingCdnRef.current}/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/${f}`,
      });
      hands.setOptions({ maxNumHands:2, modelComplexity: isMobileWeb?0:1, minDetectionConfidence:0.6, minTrackingConfidence:0.6 });
      hands.onResults(onResults);
      handsRef.current = hands;

      setLoadingStage('tensorflow');
      await loadWithFallback(`@tensorflow/tfjs-core@${TFJS_VERSION}/dist/tf-core.min.js`);
      await Promise.all([
        loadWithFallback(`@tensorflow/tfjs-converter@${TFJS_VERSION}/dist/tf-converter.min.js`),
        loadWithFallback(`@tensorflow/tfjs-backend-webgl@${TFJS_VERSION}/dist/tf-backend-webgl.min.js`),
        loadWithFallback(`@tensorflow-models/pose-detection@${POSE_DETECTION_VERSION}/dist/pose-detection.min.js`),
      ]);

      setLoadingStage('movenet');
      try { await (window as any).tf.setBackend('webgl'); await (window as any).tf.ready(); }
      catch { await (window as any).tf.setBackend('cpu'); await (window as any).tf.ready(); }

      poseDetectorRef.current = await (window as any).poseDetection.createDetector(
        (window as any).poseDetection.SupportedModels.MoveNet,
        { modelType: (window as any).poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      setAiReady(true);
      setLoadingStage('');

      const moveNetInterval = isMobileWeb ? 15 : 3;
      let fc = 0;
      const process = async () => {
        // srcObject가 없어도 루프는 계속 유지 (일시적 null 방어)
        if (!videoRef.current?.srcObject) {
          animFrameRef.current = requestAnimationFrame(process);
          return;
        }
        try {
          fc++;
          await handsRef.current?.send({ image: videoRef.current });
          if (poseDetectorRef.current && fc % moveNetInterval === 0) {
            const poses = await poseDetectorRef.current.estimatePoses(videoRef.current);
            if (poses?.length > 0 && poses[0].keypoints) {
              const vw=videoRef.current?.videoWidth||1, vh=videoRef.current?.videoHeight||1;
              poseResultsRef.current = poses[0].keypoints.map((k:any)=>({...k,x:k.x/vw,y:k.y/vh}));
            } else { poseResultsRef.current = null; }
          }
        } catch {}
        animFrameRef.current = requestAnimationFrame(process);
      };
      process();
    } catch (err) { console.error('CCTV camera error:', err); }
  }, [onResults, isMobileWeb]);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current !== null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    handsRef.current = null; poseDetectorRef.current = null; poseResultsRef.current = null;
    wristHistoryRef.current = [[], []]; gestureStabBuf.current = [];
    setCameraActive(false); setAiReady(false); setCanvasReady(false);
    canvasReadyRef.current = false;
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (gestureResetRef.current) clearTimeout(gestureResetRef.current);
    };
  }, []);

  // ── Format helpers ────────────────────────────────────────────────
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const timeStr      = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  const dateStr      = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const eventTimeStr = (d: Date) => `${pad2(d.getMonth()+1)}/${pad2(d.getDate())} ${timeStr(d)}`;
  const mapEmbedUrl  = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.005},${lat-0.005},${lng+0.005},${lat+0.005}&layer=mapnik&marker=${lat},${lng}`;
  const mapOpenUrl   = (lat: number, lng: number) =>
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  if (Platform.OS !== 'web') {
    return <View style={s.container}><Text style={{ color:'#fff', margin:20 }}>웹 브라우저에서만 지원됩니다</Text></View>;
  }

  const loadingLabel = loadingStage==='mediapipe'?'MediaPipe':loadingStage==='tensorflow'?'TensorFlow':loadingStage==='movenet'?'MoveNet':'';

  return (
    <View style={s.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Text style={s.backText}>← 돌아가기</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>📹 CCTV 위험관제</Text>
        <View style={s.headerRight}>
          <View style={[s.aiDot, { backgroundColor: aiReady ? '#4ade80' : '#fbbf24' }]} />
          <Text style={s.aiLabel}>{aiReady ? 'AI 감지 중' : loadingLabel ? `${loadingLabel} 로딩...` : '준비 중'}</Text>
          {events.length > 0 && <Text style={s.eventCount}>{events.length}건 감지</Text>}
        </View>
      </View>

      {/* Main Area */}
      <View style={[s.main, isWide && s.mainRow]}>

        {/* Left: CCTV 영상 (70%) */}
        <View style={[s.cctvPanel, isWide ? s.cctvWide : s.cctvNarrow]}>
          {/* @ts-ignore */}
          <video ref={videoRef} style={s.hiddenVideo} autoPlay playsInline muted />
          {/* @ts-ignore */}
          <canvas ref={canvasRef} style={{ ...s.canvas, opacity: canvasReady ? 1 : 0 } as any} />

          {/* CCTV 상단 오버레이 */}
          <View style={s.cctvTop}>
            <Text style={s.cctvMono}>CAM-01</Text>
            <View style={s.cctvTopCenter}>
              {motionDetected && cameraActive && (
                <View style={s.motionBadge}><Text style={s.badgeText}>🔄 모션</Text></View>
              )}
              {handDetected && cameraActive && (
                <View style={s.handBadge}><Text style={s.badgeText}>✋ 손감지</Text></View>
              )}
            </View>
            <View style={s.cctvTopRight}>
              <Text style={s.cctvMono}>{timeStr(currentTime)}</Text>
              {cameraActive && recVisible && <Text style={s.cctvRec}>  ● REC</Text>}
            </View>
          </View>

          {/* CCTV 하단 오버레이 */}
          <View style={s.cctvBottom}>
            <Text style={s.cctvMono}>{dateStr(currentTime)}</Text>
            {currentGesture !== '' && (
              <View style={s.gestureBadge}>
                <Text style={s.gestureText}>{currentGesture}</Text>
              </View>
            )}
            <Text style={[s.cctvMono, { color: aiReady ? '#0f0' : '#ff0' }]}>
              {aiReady ? '● 감지 활성' : '● 초기화 중'}
            </Text>
          </View>

          {/* 카메라 로딩 오버레이 — 반전 완료 전까지 숨김 */}
          {(!cameraActive || !canvasReady) && (
            <View style={s.overlay}>
              <Text style={s.overlayText}>
                {!cameraActive
                  ? '📷 카메라 초기화 중...'
                  : loadingLabel
                  ? `🧠 ${loadingLabel} 로딩 중...`
                  : '📷 영상 준비 중...'}
              </Text>
            </View>
          )}
        </View>

        {/* Right: 위험 감지 목록 (30%) */}
        <View style={[s.listPanel, isWide && s.listWide]}>
          <View style={s.listHeader}>
            <Text style={s.listTitle}>위험 감지 목록</Text>
            {events.length > 0 && (
              <TouchableOpacity onPress={() => setEvents([])} style={s.clearBtn}>
                <Text style={s.clearText}>초기화</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={s.list} contentContainerStyle={s.listContent} nestedScrollEnabled>
            {events.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🛡️</Text>
                <Text style={s.emptyText}>감지된 위험 없음</Text>
                <Text style={s.emptySubtext}>AI가 실시간으로{'\n'}모니터링 중입니다</Text>
              </View>
            ) : (
              events.map(ev => (
                <TouchableOpacity
                  key={ev.id}
                  style={[s.eventCard, ev.severity==='high' && s.eventCardHigh]}
                  onPress={() => setSelectedEvent(ev)}
                >
                  <View style={[s.severityBar, { backgroundColor: ev.severity==='high' ? '#ef4444' : '#f59e0b' }]} />
                  <View style={s.eventBody}>
                    <View style={s.eventRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.eventMsg}>
                          {ev.severity==='high'?'🚨':'⚠️'} {ev.message} ({eventTimeStr(ev.time)})
                        </Text>
                        <Text style={s.coordText}>📍 {ev.lat.toFixed(5)}, {ev.lng.toFixed(5)}</Text>
                      </View>
                      <TouchableOpacity style={s.mapLinkBox} onPress={() => setSelectedEvent(ev)}>
                        <Text style={s.mapLinkText}>지도에서{'\n'}보기 ›</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>

      {/* Toast (우측 하단) */}
      {toastVisible && (
        <View style={s.toast}>
          <Text style={s.toastText}>{toastMsg}</Text>
        </View>
      )}

      {/* 지도 팝업 */}
      {selectedEvent && (
        <View style={s.modalBackdrop}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>{selectedEvent.severity==='high'?'🚨':'⚠️'} {selectedEvent.message}</Text>
                <Text style={s.modalTime}>{eventTimeStr(selectedEvent.time)}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedEvent(null)} style={s.closeBtn}>
                <Text style={s.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalCoords}>
              <Text style={s.modalCoord}>📍 {selectedEvent.lat}, {selectedEvent.lng}</Text>
            </View>
            <View style={s.modalMediaRow}>
              {/* 좌: 지도 */}
              <View style={s.mapBox}>
                {/* @ts-ignore */}
                <iframe
                  src={mapEmbedUrl(selectedEvent.lat, selectedEvent.lng)}
                  style={{ width:'100%', height:'100%', border:'none' }}
                  title="위험 위치"
                />
                <TouchableOpacity
                  style={s.openMapBtn}
                  onPress={() => typeof window !== 'undefined' && window.open(mapOpenUrl(selectedEvent.lat, selectedEvent.lng), '_blank')}
                >
                  <Text style={s.openMapText}>🗺️ 지도에서 크게 보기</Text>
                </TouchableOpacity>
              </View>
              {/* 우: 스냅샷 */}
              <View style={s.snapshotBox}>
                {selectedEvent.snapshot ? (
                  <>
                    {/* @ts-ignore */}
                    <img
                      src={selectedEvent.snapshot}
                      style={{ width:'100%', height:'100%', objectFit:'cover' } as any}
                      alt="위험 감지 캡처"
                    />
                    <View style={s.snapshotLabel}>
                      <Text style={s.snapshotLabelText}>📸 감지 순간 캡처</Text>
                    </View>
                  </>
                ) : (
                  <View style={s.snapshotEmpty}>
                    <Text style={s.snapshotEmptyText}>📷{'\n'}스냅샷 없음</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d', overflow: 'hidden' as any },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  backBtn: { marginRight: spacing.md },
  backText: { color: '#aaa', fontSize: fonts.sizes.base },
  headerTitle: { flex: 1, fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold, color: '#fff' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aiDot: { width: 8, height: 8, borderRadius: 4 },
  aiLabel: { fontSize: fonts.sizes.sm, color: '#aaa' },
  eventCount: { fontSize: fonts.sizes.sm, color: '#ef4444', fontWeight: fonts.weights.bold, marginLeft: 4 },

  main: { flex: 1, minHeight: 0, overflow: 'hidden' as any },
  mainRow: { flexDirection: 'row' },

  // CCTV 패널 — 좌측 70%
  cctvPanel: { backgroundColor: '#000', position: 'relative' as any, overflow: 'hidden' as any, minHeight: 0 },
  cctvWide:  { flex: 7 },
  cctvNarrow: { height: 280 },

  hiddenVideo: { width: '100%', height: '100%', opacity: 0 } as any,
  canvas: { position: 'absolute' as any, top: 0, left: 0, width: '100%', height: '100%' } as any,

  cctvTop: {
    position: 'absolute' as any, top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cctvTopCenter: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  cctvTopRight: { flexDirection: 'row', alignItems: 'center' },
  cctvBottom: {
    position: 'absolute' as any, bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cctvMono: { color: '#0f0', fontSize: fonts.sizes.sm, fontFamily: 'monospace' as any },
  cctvRec:  { color: '#f00', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold, fontFamily: 'monospace' as any },

  motionBadge: { backgroundColor: 'rgba(251,191,36,0.85)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  handBadge:   { backgroundColor: 'rgba(74,222,128,0.85)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText:   { color: '#000', fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },

  gestureBadge: { backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  gestureText:  { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },

  overlay: {
    position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center',
  },
  overlayText: { color: '#0f0', fontSize: fonts.sizes.base, fontFamily: 'monospace' as any },

  // 목록 패널 — 우측 30%
  listPanel: { backgroundColor: '#111', flex: 1, minHeight: 0, overflow: 'hidden' as any },
  listWide:  { flex: 3 },

  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: '#1a1a1a', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  listTitle: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold, color: '#fff' },
  clearBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: '#2a2a2a' },
  clearText: { color: '#888', fontSize: fonts.sizes.sm },

  list: { flex: 1, minHeight: 0 },
  listContent: { padding: spacing.sm },

  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: spacing.sm },
  emptyText: { color: '#aaa', fontSize: fonts.sizes.base, marginBottom: 4 },
  emptySubtext: { color: '#555', fontSize: fonts.sizes.sm, textAlign: 'center' },

  eventCard: {
    flexDirection: 'row', backgroundColor: '#1e1e1e', borderRadius: 8,
    marginBottom: spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a',
  },
  eventCardHigh: { borderColor: 'rgba(239,68,68,0.35)' },
  severityBar: { width: 5 },
  eventBody: { flex: 1, padding: spacing.md },
  eventRow:  { flexDirection: 'row', alignItems: 'center' },
  eventMsg:  { color: '#fff', fontSize: fonts.sizes.base, fontWeight: fonts.weights.bold, marginBottom: 4 },
  coordText: { color: '#888', fontSize: fonts.sizes.sm, fontFamily: 'monospace' as any },
  mapLinkBox: { paddingLeft: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  mapLinkText: { color: '#60a5fa', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold, textAlign: 'center' },

  toast: {
    position: 'absolute' as any, bottom: spacing.xl, right: spacing.xl,
    backgroundColor: 'rgba(220,20,20,0.95)',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: 12, maxWidth: 320,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,100,100,0.3)',
  },
  toastText: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },

  modalBackdrop: {
    position: 'absolute' as any, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  modalBox: {
    backgroundColor: '#1a1a1a', borderRadius: 16,
    width: '96%', maxWidth: 870,
    borderWidth: 1, borderColor: '#333', overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  modalTitle: { fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold, color: '#fff' },
  modalTime: { color: '#888', fontSize: fonts.sizes.sm, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 16 },
  modalCoords: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  modalCoord: { color: '#aaa', fontSize: fonts.sizes.sm, fontFamily: 'monospace' as any },
  modalMediaRow: { flexDirection: 'row', height: 420 },
  mapBox: { flex: 1, position: 'relative' as any },
  openMapBtn: {
    position: 'absolute' as any, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(29,78,216,0.92)',
    paddingVertical: spacing.sm, alignItems: 'center',
  },
  openMapText: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold },
  snapshotBox: { flex: 1, backgroundColor: '#000', position: 'relative' as any, borderLeftWidth: 1, borderLeftColor: '#333', overflow: 'hidden' as any },
  snapshotLabel: {
    position: 'absolute' as any, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingVertical: 4, alignItems: 'center',
  },
  snapshotLabelText: { color: '#ccc', fontSize: fonts.sizes.xs },
  snapshotEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  snapshotEmptyText: { color: '#555', fontSize: fonts.sizes.base, textAlign: 'center' },
});
