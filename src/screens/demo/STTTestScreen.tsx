/**
 * STTTestScreen - VAD(Voice Activity Detection) 기반 Whisper STT
 * RMS threshold / 침묵 판정 시간 / 최소 세그먼트 길이를 화면에서 실시간 조정 가능
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fonts, spacing } from '@/constants';

const SIGNAL_SERVER =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://sueoring-server.onrender.com'
    : 'http://localhost:3001';

// 기본값
const DEFAULT_RMS_THRESHOLD    = 0.015;
const DEFAULT_SILENCE_DURATION = 600;
const DEFAULT_MIN_SEGMENT      = 300;
const DEFAULT_MIN_VOICE        = 200;  // RMS가 이 시간 이상 연속으로 threshold 초과해야 발화로 인정

interface STTResult {
  id: number;
  text: string;
  ts: Date;
}

interface Props { onBack: () => void; }

// ── 설정 행 컴포넌트 ──────────────────────────────────────────
interface SettingRowProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}
function SettingRow({ label, value, display, min, max, step, onChange }: SettingRowProps) {
  const dec = () => onChange(Math.max(min, parseFloat((value - step).toFixed(4))));
  const inc = () => onChange(Math.min(max, parseFloat((value + step).toFixed(4))));

  return (
    <View style={settingStyles.row}>
      <Text style={settingStyles.label}>{label}</Text>
      <View style={settingStyles.controls}>
        {Platform.OS === 'web' ? (
          <>
            <input
              type="range"
              min={min} max={max} step={step}
              value={value}
              onChange={e => onChange(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#60A5FA', margin: '0 8px' } as React.CSSProperties}
            />
            <Text style={settingStyles.valueText}>{display}</Text>
          </>
        ) : (
          <>
            <TouchableOpacity style={settingStyles.btn} onPress={dec}>
              <Text style={settingStyles.btnText}>−</Text>
            </TouchableOpacity>
            <Text style={settingStyles.valueText}>{display}</Text>
            <TouchableOpacity style={settingStyles.btn} onPress={inc}>
              <Text style={settingStyles.btnText}>+</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const settingStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    color: '#9CA3AF', fontSize: fonts.sizes.sm,
    width: 100,
  },
  controls: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
  },
  valueText: {
    color: '#FFFFFF', fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
    minWidth: 60, textAlign: 'right',
  },
  btn: {
    backgroundColor: '#374151', width: 32, height: 32,
    borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  btnText: { color: '#FFFFFF', fontSize: fonts.sizes.lg, lineHeight: 20 },
});

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export default function STTTestScreen({ onBack }: Props) {
  // 튜닝 값 (state: 표시용, ref: 클로저 안에서 최신값 참조)
  const [rmsThreshold,    setRmsThreshold]    = useState(DEFAULT_RMS_THRESHOLD);
  const [silenceDuration, setSilenceDuration] = useState(DEFAULT_SILENCE_DURATION);
  const [minSegment,      setMinSegment]      = useState(DEFAULT_MIN_SEGMENT);
  const [minVoice,        setMinVoice]        = useState(DEFAULT_MIN_VOICE);
  const rmsThresholdRef    = useRef(DEFAULT_RMS_THRESHOLD);
  const silenceDurationRef = useRef(DEFAULT_SILENCE_DURATION);
  const minSegmentRef      = useRef(DEFAULT_MIN_SEGMENT);
  const minVoiceRef        = useRef(DEFAULT_MIN_VOICE);

  const updateRms     = (v: number) => { setRmsThreshold(v);    rmsThresholdRef.current    = v; };
  const updateSilence = (v: number) => { setSilenceDuration(v); silenceDurationRef.current = v; };
  const updateMin     = (v: number) => { setMinSegment(v);      minSegmentRef.current      = v; };
  const updateMinVoice= (v: number) => { setMinVoice(v);        minVoiceRef.current        = v; };

  const [isStreaming,    setIsStreaming]    = useState(false);
  const [isVoiceActive,  setIsVoiceActive]  = useState(false);
  const [rmsLevel,       setRmsLevel]       = useState(0);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [results,        setResults]        = useState<STTResult[]>([]);
  const [error,          setError]          = useState('');

  const activeRef       = useRef(false);
  const streamRef       = useRef<MediaStream | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const recorderRef     = useRef<MediaRecorder | null>(null);
  const mimeBaseRef     = useRef('audio/webm');
  const extRef          = useRef('webm');
  const mimeTypeRef     = useRef('audio/webm');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rmsIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentStartRef = useRef(0);
  const hasSoundRef     = useRef(false);
  const voiceStartRef   = useRef<number | null>(null); // 연속 발화 시작 시점
  const resultIdRef     = useRef(0);

  // ── Whisper 전송 ───────────────────────────────────────────
  const processChunk = useCallback(async (blob: Blob) => {
    if (blob.size < 500) return;
    setPendingCount(c => c + 1);
    try {
      const formData = new FormData();
      formData.append('audio', new Blob([blob], { type: mimeBaseRef.current }), `audio.${extRef.current}`);
      const res = await fetch(`${SIGNAL_SERVER}/api/stt`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(`서버 오류 (${res.status}): ${data.error ?? 'STT 실패'}`); return; }
      const text = data.text?.trim();
      if (!text) return;
      setError('');
      setResults(prev => [{ id: ++resultIdRef.current, text, ts: new Date() }, ...prev.slice(0, 49)]);
    } catch (err) {
      setError(`요청 실패: ${String(err)}`);
    } finally {
      setPendingCount(c => c - 1);
    }
  }, []);

  // ── 세그먼트 시작 ─────────────────────────────────────────
  const startSegment = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;
    hasSoundRef.current     = false;
    voiceStartRef.current   = null;
    segmentStartRef.current = Date.now();

    const recorder = new MediaRecorder(streamRef.current, { mimeType: mimeTypeRef.current });
    recorderRef.current = recorder;

    recorder.addEventListener('dataavailable', (e) => {
      const duration = Date.now() - segmentStartRef.current;
      if (hasSoundRef.current && duration >= minSegmentRef.current) {
        processChunk(e.data);
      }
      if (activeRef.current) startSegment();
    }, { once: true });

    recorder.start();
  }, [processChunk]);

  // ── 침묵 감지 시 세그먼트 종료 ────────────────────────────
  const triggerCut = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  }, []);

  // ── RMS 폴링 ─────────────────────────────────────────────
  const startRMSPolling = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);

    rmsIntervalRef.current = setInterval(() => {
      if (!activeRef.current) return;
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      setRmsLevel(rms);

      if (rms > rmsThresholdRef.current) {
        // 연속 발화 시작 시점 기록
        if (voiceStartRef.current === null) voiceStartRef.current = Date.now();
        const voiceDuration = Date.now() - voiceStartRef.current;
        const confirmed = voiceDuration >= minVoiceRef.current;
        setIsVoiceActive(confirmed);
        if (confirmed) hasSoundRef.current = true;
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
      } else {
        // 침묵 → 연속 발화 카운터 리셋
        voiceStartRef.current = null;
        setIsVoiceActive(false);
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null;
            triggerCut();
          }, silenceDurationRef.current);
        }
      }
    }, 50);
  }, [triggerCut]);

  // ── 스트리밍 시작 ─────────────────────────────────────────
  const startStreaming = useCallback(async () => {
    if (activeRef.current) return;
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4' : 'audio/ogg';
      mimeTypeRef.current = mimeType;
      mimeBaseRef.current = mimeType.split(';')[0];
      extRef.current = mimeBaseRef.current.includes('mp4') ? 'mp4'
                     : mimeBaseRef.current.includes('ogg') ? 'ogg' : 'webm';

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      activeRef.current = true;
      setIsStreaming(true);
      startRMSPolling();
      startSegment();
    } catch {
      setError('마이크 권한을 허용해주세요.');
    }
  }, [startRMSPolling, startSegment]);

  // ── 스트리밍 중지 ─────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    activeRef.current = false;
    setIsStreaming(false);
    setIsVoiceActive(false);
    setRmsLevel(0);

    if (rmsIntervalRef.current)  { clearInterval(rmsIntervalRef.current);   rmsIntervalRef.current  = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current);   silenceTimerRef.current = null; }

    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') rec.stop();
    recorderRef.current = null;

    audioCtxRef.current?.close();
    audioCtxRef.current  = null;
    analyserRef.current  = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const toggleStreaming = () => activeRef.current ? stopStreaming() : startStreaming();
  const clearResults    = () => setResults([]);

  const rmsBarPct   = Math.min(100, (rmsLevel / 0.1) * 100);
  const threshPct   = Math.min(100, (rmsThreshold / 0.1) * 100);
  const rmsColor    = isVoiceActive ? '#00FF88' : '#4B5563';
  const btnColor    = isStreaming ? '#ef4444' : '#2563eb';
  const btnEmoji    = isStreaming ? '⏹️' : '🎙️';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← 홈</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎙️ STT VAD 테스트</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 설정 패널 */}
        <View style={styles.settingsBox}>
          <Text style={styles.settingsTitle}>⚙️ 설정</Text>
          <SettingRow
            label="RMS 임계값"
            value={rmsThreshold}
            display={rmsThreshold.toFixed(3)}
            min={0.005} max={0.1} step={0.005}
            onChange={updateRms}
          />
          <SettingRow
            label="침묵 판정"
            value={silenceDuration}
            display={`${silenceDuration}ms`}
            min={200} max={3000} step={100}
            onChange={updateSilence}
          />
          <SettingRow
            label="최소 세그먼트"
            value={minSegment}
            display={`${minSegment}ms`}
            min={100} max={1000} step={100}
            onChange={updateMin}
          />
          <SettingRow
            label="연속 발화"
            value={minVoice}
            display={`${minVoice}ms`}
            min={50} max={1000} step={50}
            onChange={updateMinVoice}
          />
        </View>

        {/* RMS 레벨 바 */}
        {isStreaming && (
          <View style={styles.rmsContainer}>
            <Text style={[styles.rmsLabel, { color: rmsColor }]}>
              {isVoiceActive ? '🔊 발화 중' : '🔇 침묵'}
            </Text>
            <View style={styles.rmsBarBg}>
              <View style={[styles.rmsBarFill, { width: `${rmsBarPct}%` as any, backgroundColor: rmsColor }]} />
              <View style={[styles.rmsThresholdLine, { left: `${threshPct}%` as any }]} />
            </View>
            <Text style={styles.rmsValue}>RMS: {rmsLevel.toFixed(4)}</Text>
          </View>
        )}

        {/* 토글 버튼 */}
        <View style={styles.btnArea}>
          {Platform.OS === 'web' ? (
            <button
              onClick={toggleStreaming}
              style={{
                width: 160, height: 160, borderRadius: '50%',
                backgroundColor: btnColor,
                border: isVoiceActive ? '4px solid #00FF88' : 'none',
                cursor: 'pointer', fontSize: 56, lineHeight: '152px',
                boxShadow: isVoiceActive
                  ? '0 0 0 16px rgba(0,255,136,0.2)'
                  : isStreaming ? '0 0 0 16px rgba(239,68,68,0.2)'
                  : '0 4px 32px rgba(0,0,0,0.4)',
                transition: 'all 0.1s', userSelect: 'none',
              } as React.CSSProperties}
            >
              {btnEmoji}
            </button>
          ) : (
            <TouchableOpacity
              style={[styles.micBtn, isStreaming && styles.micBtnActive, isVoiceActive && styles.micBtnVoice]}
              onPress={toggleStreaming}
              activeOpacity={0.8}
            >
              <Text style={styles.micEmoji}>{btnEmoji}</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.btnStatus}>
            {isStreaming
              ? pendingCount > 0 ? `⏳ 처리 중 (${pendingCount}건)...`
              : isVoiceActive    ? '🔊 발화 감지됨'
              :                    '🔇 침묵 대기 중'
              : '버튼을 눌러 시작'}
          </Text>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {results.length > 0 && (
          <View style={styles.resultSection}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>인식 결과 ({results.length}건)</Text>
              <TouchableOpacity onPress={clearResults} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>전체 삭제</Text>
              </TouchableOpacity>
            </View>
            {results.map(r => (
              <View key={r.id} style={styles.resultCard}>
                <Text style={styles.resultText}>"{r.text}"</Text>
                <Text style={styles.resultMeta}>
                  {r.ts.toLocaleTimeString('ko-KR', { hour12: false })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {results.length === 0 && !isStreaming && !error && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>결과가 여기에 표시됩니다</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A1F3A', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, borderBottomWidth: 2, borderBottomColor: '#2D3561',
  },
  backBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, width: 60 },
  backBtnText: { color: '#60A5FA', fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold },
  headerTitle: { color: '#FFFFFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },

  content: { padding: spacing.xl, alignItems: 'center', paddingBottom: 60 },

  settingsBox: {
    width: '100%', backgroundColor: '#1A1F3A', borderRadius: 12,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: '#2D3561',
  },
  settingsTitle: {
    color: '#FFFFFF', fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold, marginBottom: spacing.md,
  },

  rmsContainer: { width: '100%', marginBottom: spacing.lg, alignItems: 'center' },
  rmsLabel: { fontSize: fonts.sizes.sm, fontWeight: fonts.weights.semibold, marginBottom: spacing.xs },
  rmsBarBg: {
    width: '100%', height: 12, backgroundColor: '#1F2937', borderRadius: 6,
    overflow: 'hidden', position: 'relative',
  },
  rmsBarFill: { height: '100%', borderRadius: 6 },
  rmsThresholdLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#F59E0B' },
  rmsValue: { color: '#6B7280', fontSize: fonts.sizes.xs, marginTop: 4 },

  btnArea: { alignItems: 'center', marginBottom: spacing.xl },
  micBtn: {
    width: 160, height: 160, borderRadius: 80, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  micBtnActive: { backgroundColor: '#ef4444' },
  micBtnVoice:  { backgroundColor: '#059669', borderWidth: 4, borderColor: '#00FF88' },
  micEmoji: { fontSize: 56 },
  btnStatus: {
    color: '#9CA3AF', fontSize: fonts.sizes.base, marginTop: spacing.lg,
    textAlign: 'center', minHeight: 24,
  },

  errorBox: {
    width: '100%', backgroundColor: '#7F1D1D', borderRadius: 10,
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: '#EF4444',
  },
  errorText: { color: '#FCA5A5', fontSize: fonts.sizes.sm, textAlign: 'center' },

  resultSection: { width: '100%' },
  resultHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  resultTitle: { color: '#FFFFFF', fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  clearBtn: {
    backgroundColor: '#374151', paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md, borderRadius: 8,
  },
  clearBtnText: { color: '#9CA3AF', fontSize: fonts.sizes.sm },
  resultCard: {
    backgroundColor: '#1A1F3A', borderRadius: 12, padding: spacing.lg,
    marginBottom: spacing.md, borderWidth: 1, borderColor: '#2D3561',
    borderLeftWidth: 4, borderLeftColor: '#00FF88',
  },
  resultText: {
    color: '#FFFFFF', fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.semibold, lineHeight: 30, marginBottom: spacing.sm,
  },
  resultMeta: { color: '#6B7280', fontSize: fonts.sizes.sm },

  emptyState: { marginTop: spacing.xl, alignItems: 'center' },
  emptyText: { color: '#374151', fontSize: fonts.sizes.base },
});
