/**
 * DeafParticipantView
 * RealSignLanguageScreen의 카메라+인식 엔진을 컴포넌트로 추출.
 * 제스처 인식 시 onGestureRecognized 콜백 호출 (TTS/큐는 상위에서 처리).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, useWindowDimensions } from 'react-native';
import { colors, fonts, spacing } from '@/constants';

// ── 버전 핀 (RealSignLanguageScreen과 동일) ─────────────────────────
const MEDIAPIPE_HANDS_VERSION  = '0.4.1675469240';
const MEDIAPIPE_DRAWING_VERSION = '0.3.1675466124';
const TFJS_VERSION             = '4.22.0';
const POSE_DETECTION_VERSION   = '2.1.3';
const CDN_PROVIDERS = ['https://cdn.jsdelivr.net/npm', 'https://unpkg.com'] as const;

// ── 모션 감지 파라미터 (RealSignLanguageScreen과 동일) ────────────────
const SHAKE_HISTORY_FRAMES        = 12;
const SHAKE_MIN_FRAMES            = 8;
const SHAKE_STDDEV_THRESHOLD      = 0.015;
const SHAKE_DIRECTION_CHANGES_MIN = 2;
const SHAKE_DIRECTION_DELTA_MIN   = 0.003;
const MAX_MISSED_FRAMES_BEFORE_CLEAR = 5;
const STABILITY_THRESHOLD        = 5;
const MOTION_STABILITY_THRESHOLD = 3;
const MOTION_GESTURES            = ['구급차', '급해요'];

// ── 거리 모드 ─────────────────────────────────────────────────────────
type ViewDistance = 'close' | 'far';
const DISTANCE_CONFIG: Record<ViewDistance, { label: string; minDetection: number; minTracking: number; objectFit: string; guideText: string }> = {
  close: { label: '가까이', minDetection: 0.6, minTracking: 0.6, objectFit: 'cover',   guideText: '손을 카메라 가까이 보여주세요' },
  far:   { label: '멀리',   minDetection: 0.4, minTracking: 0.3, objectFit: 'contain', guideText: '상체가 보이도록 1~2m 뒤로 물러나세요' },
};

interface DeafParticipantViewProps {
  onGestureRecognized: (gesture: string) => void;
  onStreamReady?: (stream: MediaStream) => void;
}

export default function DeafParticipantView({ onGestureRecognized, onStreamReady }: DeafParticipantViewProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isMobileWeb = Platform.OS === 'web' && (
    /Android|iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && screenWidth < 1024)
  );

  // ── Refs ────────────────────────────────────────────────────────────
  const videoRef             = useRef<any>(null);
  const canvasRef            = useRef<any>(null);
  const handsRef             = useRef<any>(null);
  const poseDetectorRef      = useRef<any>(null);
  const poseResultsRef       = useRef<any>(null);
  const animationFrameRef    = useRef<number | null>(null);
  const workingCdnRef        = useRef<string>(CDN_PROVIDERS[0]);
  const wristHistoryRef      = useRef<Array<Array<{x:number;y:number}>>>([[], []]);
  const slotMissedFramesRef  = useRef<[number,number]>([0, 0]);
  const isPortraitRef        = useRef(false);
  const gestureStabilityBuf  = useRef<string[]>([]);
  const lastGestureRef       = useRef('');
  const lastGestureTimeRef   = useRef(0);
  const frameCountRef        = useRef(0);
  const lastTimeRef          = useRef(Date.now());
  const distanceRef          = useRef<ViewDistance>('close');

  // ── State ───────────────────────────────────────────────────────────
  const [isCameraActive, setIsCameraActive]   = useState(false);
  const [aiLoadingStage, setAiLoadingStage]   = useState<'idle'|'mediapipe'|'tensorflow'|'movenet'|'ready'>('idle');
  const [cameraError, setCameraError]         = useState<{type:string}|null>(null);
  const [handDetected, setHandDetected]       = useState(false);
  const [motionDetected, setMotionDetected]   = useState(false);
  const [currentGesture, setCurrentGesture]   = useState('');
  const [distance, setDistance]               = useState<ViewDistance>('close');

  // ── 흔들기 감지 ─────────────────────────────────────────────────────
  const isSlotShaking = useCallback((slot: number): boolean => {
    const hist = wristHistoryRef.current[slot];
    if (!hist || hist.length < SHAKE_MIN_FRAMES) return false;
    const meanX = hist.reduce((s,p) => s+p.x, 0) / hist.length;
    const meanY = hist.reduce((s,p) => s+p.y, 0) / hist.length;
    const varX  = hist.reduce((s,p) => s+(p.x-meanX)**2, 0) / hist.length;
    const varY  = hist.reduce((s,p) => s+(p.y-meanY)**2, 0) / hist.length;
    if (Math.max(Math.sqrt(varX), Math.sqrt(varY)) < SHAKE_STDDEV_THRESHOLD) return false;
    let dir = 0;
    for (let i=2; i<hist.length; i++) {
      const dx1 = hist[i-1].x - hist[i-2].x;
      const dx2 = hist[i].x   - hist[i-1].x;
      if (Math.sign(dx1) !== Math.sign(dx2) && Math.abs(dx1) > SHAKE_DIRECTION_DELTA_MIN) dir++;
    }
    return dir >= SHAKE_DIRECTION_CHANGES_MIN;
  }, []);

  // ── 손 제스처 분류 (RealSignLanguageScreen과 동일) ─────────────────
  const recognizeGesture = useCallback((landmarks: any, isShaking = false): string|null => {
    if (!landmarks || landmarks.length === 0) return null;
    try {
      const wrist=landmarks[0], thumbTip=landmarks[4], indexTip=landmarks[8];
      const middleTip=landmarks[12], ringTip=landmarks[16], pinkyTip=landmarks[20];
      const indexMcp=landmarks[5], middleMcp=landmarks[9], ringMcp=landmarks[13], pinkyMcp=landmarks[17];

      const handSize = Math.abs(wrist.y - middleMcp.y);
      const thr = Math.max(handSize*0.3, 0.02);

      const indexExtended  = indexTip.y  < indexMcp.y  - thr;
      const middleExtended = middleTip.y < middleMcp.y - thr;
      const ringExtended   = ringTip.y   < ringMcp.y   - thr;
      const pinkyExtended  = pinkyTip.y  < pinkyMcp.y  - thr;
      const indexClosed    = indexTip.y  > indexMcp.y;
      const middleClosed   = middleTip.y > middleMcp.y;
      const ringClosed     = ringTip.y   > ringMcp.y;
      const pinkyClosed    = pinkyTip.y  > pinkyMcp.y;
      const thumbSideways  = Math.abs(thumbTip.x - indexMcp.x) > Math.max(handSize*0.8, 0.10);

      const handHeight = wrist.y;
      const isPortrait = isPortraitRef.current;
      const faceThreshold  = isPortrait ? 0.42 : 0.35;
      const helloThreshold = isPortrait ? 0.50 : 0.40;
      const midMin = isPortrait ? 0.42 : 0.35;
      const midMax = isPortrait ? 0.82 : 0.70;
      const ambMin = isPortrait ? 0.45 : 0.40;
      const ambMax = isPortrait ? 0.82 : 0.70;
      const handAtFace = handHeight < faceThreshold;
      const allExtended = indexExtended && middleExtended && ringExtended && pinkyExtended;

      if (indexClosed && middleClosed && ringClosed && pinkyClosed && handAtFace)             return '아파요';
      if (indexExtended && middleClosed && ringClosed && pinkyClosed && handAtFace)           return '경찰';
      if (indexExtended && middleExtended && ringExtended && pinkyClosed)                     return '119';
      if (thumbSideways && pinkyExtended && indexClosed && middleClosed && ringClosed)        return '전화';
      if (allExtended && isShaking && handHeight > ambMin && handHeight < ambMax)             return '구급차';
      if (handHeight < helloThreshold && allExtended)                                         return '안녕하세요';
      if (indexClosed && middleClosed && ringClosed && pinkyClosed)                           return '감사합니다';
      if (indexTip.y < indexMcp.y - thr*2 && middleClosed && ringClosed && pinkyClosed)      return '네';
      if (indexExtended && middleExtended && ringClosed && pinkyClosed)                       return '아니요';
      const thumbIsUp = thumbTip.y < wrist.y - Math.max(handSize*0.8, 0.08);
      if (thumbIsUp && indexClosed && middleClosed)                                           return '괜찮아요';
      if (allExtended && handHeight > midMin && handHeight < midMax)                          return '도와주세요';
    } catch { /* ignore */ }
    return null;
  }, []);

  // ── MediaPipe onResults ───────────────────────────────────────────
  const onResults = useCallback((results: any) => {
    const canvas = canvasRef.current as HTMLCanvasElement|null;
    const video  = videoRef.current  as HTMLVideoElement|null;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    frameCountRef.current++;
    const now = Date.now();
    if (now - lastTimeRef.current >= 1000) { frameCountRef.current = 0; lastTimeRef.current = now; }

    const videoW = (results.image as HTMLVideoElement).videoWidth  || canvas.width;
    const videoH = (results.image as HTMLVideoElement).videoHeight || canvas.height;
    const isFar = distanceRef.current === 'far';
    const drawScale = isFar
      ? Math.min(canvas.width/videoW, canvas.height/videoH)
      : Math.max(canvas.width/videoW, canvas.height/videoH);
    const imgX = (canvas.width  - videoW*drawScale) / 2;
    const imgY = (canvas.height - videoH*drawScale) / 2;
    const toCanvasPx = (nx:number, ny:number) => ({ x: canvas.width - (nx*videoW*drawScale+imgX), y: ny*videoH*drawScale+imgY });

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 전면 카메라 거울 반전
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, imgX, imgY, videoW*drawScale, videoH*drawScale);
    ctx.restore();

    let recognized: string|null = null;

    // 손목 히스토리 업데이트
    const slotHands: [any|null, any|null] = [null, null];
    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i=0; i<results.multiHandLandmarks.length; i++) {
        const label = results.multiHandedness[i]?.label;
        const lm = results.multiHandLandmarks[i];
        if (label==='Left'  && !slotHands[0]) slotHands[0]=lm;
        else if (label==='Right' && !slotHands[1]) slotHands[1]=lm;
      }
    }
    for (let slot=0 as 0|1; slot<2; slot++) {
      const hand = slotHands[slot];
      if (hand && hand[0]) {
        wristHistoryRef.current[slot].push({ x:hand[0].x, y:hand[0].y });
        if (wristHistoryRef.current[slot].length > SHAKE_HISTORY_FRAMES) wristHistoryRef.current[slot].shift();
        slotMissedFramesRef.current[slot] = 0;
      } else {
        slotMissedFramesRef.current[slot]++;
        if (slotMissedFramesRef.current[slot] >= MAX_MISSED_FRAMES_BEFORE_CLEAR) wristHistoryRef.current[slot]=[];
      }
    }
    setMotionDetected(isSlotShaking(0) || isSlotShaking(1));

    // 양손 바운딩박스 헬퍼
    const drawTwoHandBox = (h1:any, h2:any, label:string, color:string) => {
      let minX=1,minY=1,maxX=0,maxY=0;
      [h1,h2].forEach(h=>h.forEach((lm:any)=>{ minX=Math.min(minX,lm.x);minY=Math.min(minY,lm.y);maxX=Math.max(maxX,lm.x);maxY=Math.max(maxY,lm.y); }));
      const {x:bx,y:by}=toCanvasPx(maxX,minY);
      const bw=(maxX-minX)*videoW*drawScale, bh=(maxY-minY)*videoH*drawScale;
      ctx.strokeStyle=color; ctx.lineWidth=4; ctx.strokeRect(bx,by,bw,bh);
      ctx.fillStyle=color==='#FF0000'?'rgba(255,0,0,0.9)':'rgba(0,136,255,0.9)';
      ctx.fillRect(bx,by-50,Math.max(bw,150),45);
      ctx.fillStyle='#FFF'; ctx.font='bold 28px Arial'; ctx.fillText(label,bx+10,by-18);
    };

    // MoveNet 포즈 감지
    if (poseResultsRef.current && Array.isArray(poseResultsRef.current)) {
      const kp=poseResultsRef.current;
      const v=(k:any)=>k&&typeof k.score==='number'&&k.score>0.3;
      const nose=kp[0],lSh=kp[5],rSh=kp[6],lWr=kp[9],rWr=kp[10],lHip=kp[11],rHip=kp[12];
      let pg:string|null=null,pc='#FF0000',pe='🚨';

      if (!pg&&v(nose)&&v(lSh)&&v(rSh)&&nose.y>(lSh.y+rSh.y)/2+0.05)               { pg='쓰러졌어요';pc='#FF0000';pe='🆘'; }
      if (!pg&&v(lSh)&&v(rSh)&&Math.abs(lSh.y-rSh.y)>0.18)                          { pg='기절위기';  pc='#FF4500';pe='⚠️'; }
      if (!pg&&results.multiHandLandmarks?.length===2&&v(lSh)&&v(rSh)) {
        const h1=results.multiHandLandmarks[0],h2=results.multiHandLandmarks[1];
        const a1=h1.reduce((s:number,l:any)=>s+l.y,0)/h1.length, a2=h2.reduce((s:number,l:any)=>s+l.y,0)/h2.length;
        if (a1<lSh.y&&a2<rSh.y) { pg='위험';pc='#FF0000';pe='🚨'; }
      }
      if (!pg&&v(lWr)&&v(rWr)&&v(lSh)&&v(rSh)&&lWr.x>rWr.x&&Math.abs(lWr.y-rWr.y)<0.15&&lWr.y>lSh.y&&rWr.y>rSh.y) { pg='SOS';pc='#FF6600';pe='🆘'; }
      if (!pg&&v(lWr)&&v(rWr)&&v(lSh)&&v(rSh)) {
        const sw=Math.abs(lSh.x-rSh.x),ww=Math.abs(lWr.x-rWr.x),say=(lSh.y+rSh.y)/2,way=(lWr.y+rWr.y)/2;
        if (ww>sw*1.8&&Math.abs(way-say)<0.25) { pg='도움요청';pc='#FF8800';pe='🙏'; }
      }
      if (!pg&&v(nose)&&v(lWr)&&v(rWr)) {
        const ld=Math.hypot(lWr.x-nose.x,lWr.y-nose.y),rd=Math.hypot(rWr.x-nose.x,rWr.y-nose.y);
        if (ld<0.18&&rd<0.18) { pg='두통';pc='#CC44FF';pe='🤕'; }
      }
      if (!pg&&v(lSh)&&v(rSh)&&v(lHip)&&v(rHip)) {
        const cx=(lSh.x+rSh.x)/2,cy=((lSh.y+rSh.y)/2+(lHip.y+rHip.y)/2)/2;
        const ln=v(lWr)&&Math.hypot(lWr.x-cx,lWr.y-cy)<0.12, rn=v(rWr)&&Math.hypot(rWr.x-cx,rWr.y-cy)<0.12;
        if (ln||rn) { pg='가슴통증';pc='#FF2255';pe='💔'; }
      }
      if (pg) {
        recognized=pg;
        let bMinX=1,bMinY=1,bMaxX=0,bMaxY=0;
        kp.forEach((k:any)=>{ if(v(k)){bMinX=Math.min(bMinX,k.x);bMinY=Math.min(bMinY,k.y);bMaxX=Math.max(bMaxX,k.x);bMaxY=Math.max(bMaxY,k.y);} });
        const pad=0.04,{x:bx,y:by}=toCanvasPx(Math.min(1,bMaxX+pad),Math.max(0,bMinY-pad));
        const bw=(Math.min(1,bMaxX+pad)-Math.max(0,bMinX-pad))*videoW*drawScale;
        const bh=(Math.min(1,bMaxY+pad)-Math.max(0,bMinY-pad))*videoH*drawScale;
        ctx.strokeStyle=pc;ctx.lineWidth=4;ctx.strokeRect(bx,by,bw,bh);
        const lt=`${pe} ${pg}`;ctx.font='bold 26px Arial';
        const lw=Math.max(ctx.measureText(lt).width+24,140);
        ctx.fillStyle=pc;ctx.globalAlpha=0.88;ctx.fillRect(bx,by-46,lw,40);ctx.globalAlpha=1.0;
        ctx.fillStyle='#FFF';ctx.fillText(lt,bx+10,by-16);
      }
    }

    // 병원: 양손 검지 교차
    if (!recognized&&results.multiHandLandmarks?.length===2) {
      const h1=results.multiHandLandmarks[0],h2=results.multiHandLandmarks[1];
      const isIndexOnly=(h:any)=>h[8].y<h[5].y-0.03&&h[12].y>h[9].y&&h[16].y>h[13].y&&h[20].y>h[17].y;
      if (isIndexOnly(h1)&&isIndexOnly(h2)) {
        const d=Math.hypot(h1[8].x-h2[8].x,h1[8].y-h2[8].y);
        if (d<0.15) { recognized='병원'; drawTwoHandBox(h1,h2,'🏥 병원','#0088FF'); }
      }
    }

    // 급해요: 양손 펼침 + 양손 흔들기
    if (!recognized&&results.multiHandLandmarks?.length===2) {
      const h1=results.multiHandLandmarks[0],h2=results.multiHandLandmarks[1];
      const isOpen=(h:any)=>h[8].y<h[5].y-0.03&&h[12].y<h[9].y-0.03&&h[16].y<h[13].y-0.03&&h[20].y<h[17].y-0.03;
      if (isOpen(h1)&&isOpen(h2)&&isSlotShaking(0)&&isSlotShaking(1)) {
        recognized='급해요'; drawTwoHandBox(h1,h2,'⚡ 급해요','#FF0000');
      }
    }

    // 단일 손 제스처
    if (!recognized&&results.multiHandLandmarks?.length>0) {
      setHandDetected(true);
      for (let hi=0; hi<results.multiHandLandmarks.length; hi++) {
        const lm=results.multiHandLandmarks[hi];
        const label=results.multiHandedness?.[hi]?.label;
        const slot=label==='Right'?1:0;
        const scaled=lm.map((l:any)=>{ const{x,y}=toCanvasPx(l.x,l.y);return{...l,x:x/canvas.width,y:y/canvas.height}; });
        if (window.drawConnectors&&window.HAND_CONNECTIONS) window.drawConnectors(ctx,scaled,window.HAND_CONNECTIONS,{color:'#00FF00',lineWidth:5});
        if (window.drawLandmarks) window.drawLandmarks(ctx,scaled,{color:'#FF0000',lineWidth:2,radius:5});
        let mnX=1,mnY=1,mxX=0,mxY=0;
        lm.forEach((l:any)=>{ mnX=Math.min(mnX,l.x);mnY=Math.min(mnY,l.y);mxX=Math.max(mxX,l.x);mxY=Math.max(mxY,l.y); });
        const{x:bx,y:by}=toCanvasPx(mxX,mnY);
        const bw=(mxX-mnX)*videoW*drawScale,bh=(mxY-mnY)*videoH*drawScale;
        ctx.strokeStyle='#00FF00';ctx.lineWidth=3;ctx.strokeRect(bx,by,bw,bh);
        if (!recognized) {
          recognized=recognizeGesture(lm,isSlotShaking(slot));
          if (recognized) {
            const lw=Math.max(bw,120);
            ctx.fillStyle='rgba(0,255,0,0.8)';ctx.fillRect(bx,by-36,lw,32);
            ctx.fillStyle='#000';ctx.font='bold 18px Arial';ctx.fillText(recognized,bx+8,by-12);
          }
        }
      }
    } else if (!recognized) {
      setHandDetected(false);
    }

    // 안정화 필터 + 콜백
    if (recognized) {
      gestureStabilityBuf.current.push(recognized);
      if (gestureStabilityBuf.current.length>10) gestureStabilityBuf.current.shift();
      const isMotion=MOTION_GESTURES.includes(recognized);
      const thr=isMotion?MOTION_STABILITY_THRESHOLD:STABILITY_THRESHOLD;
      const recent=gestureStabilityBuf.current.slice(-thr);
      const stable=recent.length>=thr&&recent.every(g=>g===recognized);
      if (stable&&recognized!==lastGestureRef.current&&(now-lastGestureTimeRef.current)>1000) {
        lastGestureRef.current=recognized;
        lastGestureTimeRef.current=now;
        setCurrentGesture(recognized);
        onGestureRecognized(recognized);
        gestureStabilityBuf.current=[];
      }
    } else {
      gestureStabilityBuf.current=[];
    }

    ctx.restore();
  }, [recognizeGesture, isSlotShaking, onGestureRecognized]);

  // ── 스크립트 로더 ────────────────────────────────────────────────
  const loadScript = (src:string, timeout=15000): Promise<void> => new Promise((res,rej)=>{
    if (typeof document==='undefined') { res(); return; }
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s=document.createElement('script'); s.src=src;
    const t=setTimeout(()=>{ s.remove(); rej(new Error(`timeout: ${src}`)); },timeout);
    s.onload=()=>{ clearTimeout(t); res(); };
    s.onerror=()=>{ clearTimeout(t); s.remove(); rej(new Error(`failed: ${src}`)); };
    document.head.appendChild(s);
  });

  const loadWithFallback = async (path:string): Promise<void> => {
    let last:Error|null=null;
    for (const cdn of CDN_PROVIDERS) {
      try { await loadScript(`${cdn}/${path}`); workingCdnRef.current=cdn; return; }
      catch(e) { last=e as Error; }
    }
    throw last;
  };

  // ── 카메라 시작 ──────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (Platform.OS!=='web') return;
    setCameraError(null);
    const mode = distanceRef.current;
    const cfg  = DISTANCE_CONFIG[mode];
    try {
      const constraints = isMobileWeb
        ? { facingMode:'user', width:{ideal:640,max:1280}, height:{ideal:480,max:720}, frameRate:{ideal:30} }
        : { width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}, facingMode:'user' };

      const stream = await navigator.mediaDevices.getUserMedia({ video:constraints, audio:true })
        .catch(async () => navigator.mediaDevices.getUserMedia({ video:true, audio:true }));

      onStreamReady?.(stream);

      if (videoRef.current && canvasRef.current) {
        const video=videoRef.current as HTMLVideoElement;
        const canvas=canvasRef.current as HTMLCanvasElement;
        video.srcObject=stream;
        await new Promise<void>(res=>{
          video.onloadedmetadata=()=>{
            isPortraitRef.current=video.videoWidth<video.videoHeight;
            requestAnimationFrame(()=>{
              canvas.width  = canvas.clientWidth  || (isMobileWeb?360:640);
              canvas.height = canvas.clientHeight || 450;
              res();
            });
          };
        });
        await video.play();
        setIsCameraActive(true);
        setAiLoadingStage('mediapipe');
      }

      await Promise.all([
        loadWithFallback(`@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/hands.js`),
        loadWithFallback(`@mediapipe/drawing_utils@${MEDIAPIPE_DRAWING_VERSION}/drawing_utils.js`),
      ]);

      const modelComplexity = isMobileWeb?0:1;
      const hands=new window.Hands({
        locateFile:(f:string)=>`${workingCdnRef.current}/@mediapipe/hands@${MEDIAPIPE_HANDS_VERSION}/${f}`
      });
      hands.setOptions({ maxNumHands:2, modelComplexity, minDetectionConfidence:cfg.minDetection, minTrackingConfidence:cfg.minTracking });
      hands.onResults(onResults);
      handsRef.current=hands;

      setAiLoadingStage('tensorflow');
      await loadWithFallback(`@tensorflow/tfjs-core@${TFJS_VERSION}/dist/tf-core.min.js`);
      await Promise.all([
        loadWithFallback(`@tensorflow/tfjs-converter@${TFJS_VERSION}/dist/tf-converter.min.js`),
        loadWithFallback(`@tensorflow/tfjs-backend-webgl@${TFJS_VERSION}/dist/tf-backend-webgl.min.js`),
        loadWithFallback(`@tensorflow-models/pose-detection@${POSE_DETECTION_VERSION}/dist/pose-detection.min.js`),
      ]);

      try { await window.tf.setBackend('webgl'); await window.tf.ready(); }
      catch { await window.tf.setBackend('cpu'); await window.tf.ready(); }

      setAiLoadingStage('movenet');
      poseDetectorRef.current=await window.poseDetection.createDetector(
        window.poseDetection.SupportedModels.MoveNet,
        { modelType:window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      setAiLoadingStage('ready');

      const moveNetInterval=isMobileWeb?15:3;
      let fc=0;
      const processFrame=async ()=>{
        if (!videoRef.current?.srcObject) return;
        try {
          fc++;
          await handsRef.current?.send({ image:videoRef.current });
          if (poseDetectorRef.current&&fc%moveNetInterval===0) {
            const poses=await poseDetectorRef.current.estimatePoses(videoRef.current);
            if (poses?.length>0&&poses[0].keypoints) {
              const vw=videoRef.current?.videoWidth||1, vh=videoRef.current?.videoHeight||1;
              poseResultsRef.current=poses[0].keypoints.map((k:any)=>({...k,x:k.x/vw,y:k.y/vh}));
            } else { poseResultsRef.current=null; }
          }
        } catch { /* ignore single-frame errors */ }
        animationFrameRef.current=requestAnimationFrame(processFrame);
      };
      processFrame();

    } catch(err) {
      const e=err as DOMException;
      if (e.name==='NotAllowedError'||e.name==='PermissionDeniedError') setCameraError({type:'permission'});
      else if (e.name==='NotFoundError') setCameraError({type:'notfound'});
      else if (e.name==='NotReadableError') setCameraError({type:'inuse'});
      else setCameraError({type:'unknown'});
    }
  }, [isMobileWeb, onResults]);

  // ── 카메라 정지 ──────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current!==null) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current=null; }
    if (videoRef.current?.srcObject) { (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); videoRef.current.srcObject=null; }
    handsRef.current=null; poseDetectorRef.current=null; poseResultsRef.current=null;
    wristHistoryRef.current=[[],[]]; gestureStabilityBuf.current=[];
    setIsCameraActive(false); setHandDetected(false); setMotionDetected(false); setAiLoadingStage('idle');
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, []);  // 마운트 시 한 번만 실행

  // ── 거리 모드 토글 ───────────────────────────────────────────────
  const handleDistanceToggle = async (mode: ViewDistance) => {
    if (mode === distance) return;
    distanceRef.current = mode;
    setDistance(mode);
    setCurrentGesture('');
    gestureStabilityBuf.current = [];
    lastGestureRef.current = '';
    // MediaPipe 신뢰도만 재설정 (재시작 없이)
    const cfg = DISTANCE_CONFIG[mode];
    handsRef.current?.setOptions({
      maxNumHands: 2, modelComplexity: isMobileWeb ? 0 : 1,
      minDetectionConfidence: cfg.minDetection,
      minTrackingConfidence:  cfg.minTracking,
    });
  };

  if (Platform.OS !== 'web') {
    return <View style={s.container}><Text style={s.unsupported}>웹 브라우저에서만 지원됩니다</Text></View>;
  }

  const cfg = DISTANCE_CONFIG[distance];

  return (
    <View style={s.container}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.roleLabel}>🤟 청각장애인</Text>
        <View style={s.headerRight}>
          <View style={s.distToggle}>
            {(['close','far'] as ViewDistance[]).map(m=>(
              <TouchableOpacity key={m} style={[s.distBtn, distance===m&&s.distBtnOn]} onPress={()=>handleDistanceToggle(m)}>
                <Text style={[s.distBtnTxt, distance===m&&s.distBtnTxtOn]}>{DISTANCE_CONFIG[m].label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[s.statusDot, {backgroundColor: handDetected ? colors.success.main : colors.gray[400]}]} />
          {motionDetected && <Text style={s.motionBadge}>🔄</Text>}
        </View>
      </View>

      {/* 카메라 영역 */}
      <View style={s.cameraArea}>
        {/* @ts-ignore */}
        <video ref={videoRef} style={{...s.video, objectFit: cfg.objectFit as any}} autoPlay playsInline muted />
        {/* @ts-ignore */}
        <canvas ref={canvasRef} style={s.canvas} />

        {/* 카메라 비활성 오버레이 */}
        {!isCameraActive && (
          <View style={s.overlay}>
            {cameraError ? (
              <>
                <Text style={s.overlayEmoji}>{cameraError.type==='permission'?'🚫':'⚠️'}</Text>
                <Text style={s.overlayText}>
                  {cameraError.type==='permission' && '카메라 권한이 필요합니다'}
                  {cameraError.type==='notfound'   && '카메라를 찾을 수 없습니다'}
                  {cameraError.type==='inuse'       && '카메라가 사용 중입니다'}
                  {cameraError.type==='unknown'     && '카메라 오류가 발생했습니다'}
                </Text>
              </>
            ) : (
              <>
                <Text style={s.overlayEmoji}>📷</Text>
                <Text style={s.overlayText}>카메라 시작 중...</Text>
              </>
            )}
          </View>
        )}

        {/* AI 로딩 배지 */}
        {isCameraActive && aiLoadingStage!=='ready' && aiLoadingStage!=='idle' && (
          <View style={s.aiBadge}>
            <Text style={s.aiBadgeText}>
              {aiLoadingStage==='mediapipe' && '🤚 MediaPipe 로딩...'}
              {aiLoadingStage==='tensorflow' && '🧠 TensorFlow 로딩...'}
              {aiLoadingStage==='movenet'    && '🦴 MoveNet 로딩...'}
            </Text>
          </View>
        )}

        {/* 거리 안내 */}
        {aiLoadingStage==='ready' && (
          <View style={s.guideBar}>
            <Text style={s.guideText}>{cfg.guideText}</Text>
          </View>
        )}
      </View>

      {/* 제스처 바 */}
      <View style={s.gestureBar}>
        <Text style={s.gestureLabel}>인식된 수어</Text>
        <Text style={s.gestureText}>{currentGesture || '—'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0a0a0a', borderRadius:12, overflow:'hidden' },
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:spacing.md, paddingVertical:spacing.sm, backgroundColor:'rgba(0,0,0,0.6)' },
  roleLabel: { fontSize:fonts.sizes.base, fontWeight:fonts.weights.semibold, color:'#fff' },
  headerRight: { flexDirection:'row', alignItems:'center', gap:spacing.sm },
  distToggle: { flexDirection:'row', backgroundColor:'rgba(255,255,255,0.1)', borderRadius:16, padding:2 },
  distBtn: { paddingHorizontal:10, paddingVertical:3, borderRadius:14 },
  distBtnOn: { backgroundColor:colors.primary.main },
  distBtnTxt: { fontSize:fonts.sizes.xs, color:'rgba(255,255,255,0.6)', fontWeight:fonts.weights.medium },
  distBtnTxtOn: { color:'#fff' },
  statusDot: { width:10, height:10, borderRadius:5 },
  motionBadge: { fontSize:14 },
  cameraArea: { flex:1, position:'relative' as any },
  video: { width:'100%', height:'100%', opacity: 0 } as any,
  canvas: { position:'absolute' as any, top:0, left:0, width:'100%', height:'100%' } as any,
  overlay: { position:'absolute' as any, inset:0, backgroundColor:'rgba(0,0,0,0.75)', alignItems:'center', justifyContent:'center' },
  overlayEmoji: { fontSize:40, marginBottom:spacing.sm },
  overlayText: { color:'#fff', fontSize:fonts.sizes.base, textAlign:'center' },
  aiBadge: { position:'absolute' as any, top:8, left:8, backgroundColor:'rgba(0,0,0,0.7)', borderRadius:8, paddingHorizontal:10, paddingVertical:4 },
  aiBadgeText: { color:'#fff', fontSize:fonts.sizes.xs },
  guideBar: { position:'absolute' as any, bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.5)', paddingVertical:4, alignItems:'center' },
  guideText: { fontSize:fonts.sizes.xs, color:'rgba(255,255,255,0.7)' },
  gestureBar: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:spacing.md, paddingVertical:spacing.sm, backgroundColor:'rgba(37,99,235,0.85)' },
  gestureLabel: { fontSize:fonts.sizes.sm, color:'rgba(255,255,255,0.7)' },
  gestureText: { fontSize:fonts.sizes.lg, fontWeight:fonts.weights.bold, color:'#fff' },
  unsupported: { color:colors.text.secondary, textAlign:'center', margin:spacing.lg },
});
