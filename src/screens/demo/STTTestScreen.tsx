/**
 * STTTestScreen - Whisper STT 단독 테스트
 * 버튼을 누르고 있는 동안 녹음 → 손 떼면 Whisper API 전송 → 텍스트 표시
 * recorder.stop() 방식으로 완전한 오디오 파일 생성 (헤더 포함)
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

interface STTResult {
  id: number;
  text: string;
  ts: Date;
  duration: number;
}

interface Props { onBack: () => void; }

export default function STTTestScreen({ onBack }: Props) {
  const [isRecording, setIsRecording]     = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [results, setResults]             = useState<STTResult[]>([]);
  const [error, setError]                 = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const startTimeRef     = useRef<number>(0);
  const resultIdRef      = useRef(0);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4' :
        'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
    } catch {
      setError('마이크 권한을 허용해주세요.');
    }
  }, [isRecording, isProcessing]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    const duration = Date.now() - startTimeRef.current;
    setIsRecording(false);

    if (duration < 300) {
      recorder.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      setError('너무 짧습니다. 0.5초 이상 발화해주세요.');
      return;
    }

    setIsProcessing(true);

    const mimeBase = recorder.mimeType.split(';')[0];
    const ext = mimeBase.includes('mp4') ? 'mp4' : mimeBase.includes('ogg') ? 'ogg' : 'webm';

    recorder.ondataavailable = async (e) => {
      streamRef.current?.getTracks().forEach(t => t.stop());

      if (e.data.size < 500) {
        setError('오디오 데이터가 너무 작습니다. 다시 시도해주세요.');
        setIsProcessing(false);
        return;
      }

      try {
        const formData = new FormData();
        formData.append('audio', new Blob([e.data], { type: mimeBase }), `audio.${ext}`);

        const response = await fetch(`${SIGNAL_SERVER}/api/stt`, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          setError(`서버 오류 (HTTP ${response.status}): ${data.error ?? 'STT 실패'}`);
          return;
        }

        const text = data.text?.trim();
        if (!text) {
          setError('음성이 인식되지 않았습니다. 더 크고 명확하게 발화해주세요.');
          return;
        }

        setError('');
        setResults(prev => [{
          id: ++resultIdRef.current,
          text,
          ts: new Date(),
          duration,
        }, ...prev.slice(0, 19)]);
      } catch (err) {
        setError(`요청 실패: ${String(err)}`);
      } finally {
        setIsProcessing(false);
      }
    };

    recorder.stop();
  }, []);

  const clearResults = () => setResults([]);

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← 홈</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎙️ STT 테스트</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 안내 */}
        <View style={styles.descBox}>
          <Text style={styles.descText}>
            버튼을 <Text style={styles.bold}>누르고 있는 동안</Text> 발화하세요.{'\n'}
            손을 떼면 Whisper가 텍스트로 변환합니다.
          </Text>
          <Text style={styles.descSub}>서버: {SIGNAL_SERVER}</Text>
        </View>

        {/* 녹음 버튼 */}
        <View style={styles.btnArea}>
          {Platform.OS === 'web' ? (
            // 웹: HTML button으로 mousedown/touchstart 처리
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={isProcessing}
              style={{
                width: 160, height: 160, borderRadius: '50%',
                backgroundColor: isRecording ? '#ef4444' : isProcessing ? '#4b5563' : '#2563eb',
                border: 'none', cursor: isProcessing ? 'wait' : 'pointer',
                fontSize: 56, lineHeight: '160px',
                boxShadow: isRecording
                  ? '0 0 0 16px rgba(239,68,68,0.25), 0 0 0 32px rgba(239,68,68,0.1)'
                  : '0 4px 32px rgba(0,0,0,0.4)',
                transition: 'background-color 0.15s, box-shadow 0.15s',
                userSelect: 'none',
              } as any}
            >
              {isProcessing ? '⏳' : isRecording ? '🔴' : '🎙️'}
            </button>
          ) : (
            <TouchableOpacity
              style={[
                styles.micBtn,
                isRecording  && styles.micBtnActive,
                isProcessing && styles.micBtnProcessing,
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <Text style={styles.micEmoji}>
                {isProcessing ? '⏳' : isRecording ? '🔴' : '🎙️'}
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.btnStatus}>
            {isProcessing
              ? '⏳ Whisper 변환 중...'
              : isRecording
              ? '🔴 녹음 중 — 손을 떼면 전송'
              : '누르고 있는 동안 발화'}
          </Text>
        </View>

        {/* 에러 */}
        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
          </View>
        )}

        {/* 결과 */}
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
                  {' · '}
                  {(r.duration / 1000).toFixed(1)}초 녹음
                </Text>
              </View>
            ))}
          </View>
        )}

        {results.length === 0 && !isRecording && !isProcessing && !error && (
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

  descBox: {
    width: '100%', backgroundColor: '#1A1F3A', borderRadius: 12,
    padding: spacing.lg, marginBottom: spacing.xl,
    borderWidth: 1, borderColor: '#2D3561',
  },
  descText: { color: '#D1D5DB', fontSize: fonts.sizes.base, lineHeight: 24, textAlign: 'center' },
  bold: { color: '#FFFFFF', fontWeight: fonts.weights.bold },
  descSub: { color: '#4B5563', fontSize: fonts.sizes.xs, textAlign: 'center', marginTop: spacing.sm },

  btnArea: { alignItems: 'center', marginBottom: spacing.xl },
  micBtn: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  micBtnActive:      { backgroundColor: '#ef4444' },
  micBtnProcessing:  { backgroundColor: '#4B5563' },
  micEmoji:  { fontSize: 56 },
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
