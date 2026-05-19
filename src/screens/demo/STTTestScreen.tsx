/**
 * STTTestScreen - Whisper STT 스트리밍 테스트
 * 버튼을 누르면 200ms 단위로 Whisper에 병렬 전송 → 실시간 텍스트 표시
 * stop/start cycle 방식 (timeslice 미사용) → 완전한 WEBM 파일 보장
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

const SEGMENT_MS = 2000;

interface STTResult {
  id: number;
  text: string;
  ts: Date;
}

interface Props { onBack: () => void; }

export default function STTTestScreen({ onBack }: Props) {
  const [isStreaming, setIsStreaming]   = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [results, setResults]          = useState<STTResult[]>([]);
  const [error, setError]              = useState('');

  const streamRef      = useRef<MediaStream | null>(null);
  const activeRef      = useRef(false);   // 스트리밍 중 여부
  const resultIdRef    = useRef(0);
  const doSegmentRef   = useRef<() => void>(() => {});

  // 청크 하나를 백그라운드에서 Whisper로 전송
  const processChunk = useCallback(async (blob: Blob, mimeBase: string, ext: string) => {
    if (blob.size < 500) return;
    setPendingCount(c => c + 1);
    try {
      const formData = new FormData();
      formData.append('audio', new Blob([blob], { type: mimeBase }), `audio.${ext}`);
      const response = await fetch(`${SIGNAL_SERVER}/api/stt`, { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) { setError(`서버 오류 (${response.status}): ${data.error ?? 'STT 실패'}`); return; }
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

  const startStreaming = useCallback(async () => {
    if (activeRef.current) return;
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      activeRef.current = true;
      setIsStreaming(true);

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4' :
        'audio/ogg';
      const mimeBase = mimeType.split(';')[0];
      const ext = mimeBase.includes('mp4') ? 'mp4' : mimeBase.includes('ogg') ? 'ogg' : 'webm';

      doSegmentRef.current = () => {
        if (!activeRef.current || !streamRef.current) return;

        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        recorder.addEventListener('dataavailable', (e) => {
          processChunk(e.data, mimeBase, ext);
          // 다음 세그먼트 즉시 시작
          doSegmentRef.current();
        }, { once: true });

        recorder.start();
        setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
        }, SEGMENT_MS);
      };

      doSegmentRef.current();
    } catch {
      setError('마이크 권한을 허용해주세요.');
      activeRef.current = false;
      setIsStreaming(false);
    }
  }, [processChunk]);

  const stopStreaming = useCallback(() => {
    activeRef.current = false;
    setIsStreaming(false);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const toggleStreaming = useCallback(() => {
    if (activeRef.current) stopStreaming();
    else startStreaming();
  }, [startStreaming, stopStreaming]);

  const clearResults = () => setResults([]);

  const btnColor = isStreaming ? '#ef4444' : '#2563eb';
  const btnEmoji = isStreaming ? '⏹️' : '🎙️';
  const btnLabel = isStreaming
    ? `🔴 스트리밍 중${pendingCount > 0 ? ` (처리 중 ${pendingCount}건)` : ''} — 누르면 중지`
    : '버튼을 눌러 스트리밍 시작';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← 홈</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎙️ STT 스트리밍 테스트</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.descBox}>
          <Text style={styles.descText}>
            버튼을 누르면 <Text style={styles.bold}>{SEGMENT_MS}ms</Text> 단위로 Whisper에 전송합니다.{'\n'}
            결과는 실시간으로 아래에 표시됩니다.
          </Text>
          <Text style={styles.descSub}>서버: {SIGNAL_SERVER}</Text>
        </View>

        <View style={styles.btnArea}>
          {Platform.OS === 'web' ? (
            <button
              onClick={toggleStreaming}
              style={{
                width: 160, height: 160, borderRadius: '50%',
                backgroundColor: btnColor,
                border: 'none', cursor: 'pointer',
                fontSize: 56, lineHeight: '160px',
                boxShadow: isStreaming
                  ? '0 0 0 16px rgba(239,68,68,0.25), 0 0 0 32px rgba(239,68,68,0.1)'
                  : '0 4px 32px rgba(0,0,0,0.4)',
                transition: 'background-color 0.15s, box-shadow 0.15s',
                userSelect: 'none',
              } as React.CSSProperties}
            >
              {btnEmoji}
            </button>
          ) : (
            <TouchableOpacity
              style={[styles.micBtn, isStreaming && styles.micBtnActive]}
              onPress={toggleStreaming}
              activeOpacity={0.8}
            >
              <Text style={styles.micEmoji}>{btnEmoji}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.btnStatus}>{btnLabel}</Text>
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
  micBtnActive: { backgroundColor: '#ef4444' },
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
