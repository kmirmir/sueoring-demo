import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { colors, fonts, spacing } from '@/constants';

interface HearingParticipantViewProps {
  onSpeechResult: (text: string) => void;
  onStreamReady?: (stream: MediaStream) => void;
}

export default function HearingParticipantView({ onSpeechResult, onStreamReady }: HearingParticipantViewProps) {
  const videoRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [sttSupported, setSttSupported] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setSttSupported(false); }

    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        onStreamReady?.(stream);
        const video = videoRef.current as HTMLVideoElement | null;
        if (video) { video.srcObject = stream; video.play(); }
        setCameraReady(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleSTT = () => {
    if (!sttSupported || Platform.OS !== 'web') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText('');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript.trim();
          if (text) { onSpeechResult(text); setInterimText(''); }
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = () => { setIsListening(false); setInterimText(''); };
    recognition.onend = () => { setIsListening(false); setInterimText(''); };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.unsupported}>웹 브라우저에서만 지원됩니다</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roleLabel}>🗣️ 청인</Text>
        <View style={[styles.statusDot, { backgroundColor: cameraReady ? colors.success.main : colors.gray[400] }]} />
      </View>

      <View style={styles.cameraArea}>
        {/* @ts-ignore */}
        <video ref={videoRef} style={styles.video} autoPlay playsInline muted />
        {!cameraReady && (
          <View style={styles.overlay}>
            <Text style={styles.overlayText}>카메라 준비 중...</Text>
          </View>
        )}
      </View>

      <View style={styles.sttBar}>
        {sttSupported ? (
          <>
            <TouchableOpacity style={[styles.sttBtn, isListening && styles.sttBtnActive]} onPress={toggleSTT}>
              <Text style={styles.sttBtnText}>{isListening ? '🔴 음성 인식 중' : '🎤 음성 인식 시작'}</Text>
            </TouchableOpacity>
            {interimText ? (
              <Text style={styles.interimText} numberOfLines={1}>{interimText}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.noSttText}>이 브라우저는 음성 인식을 지원하지 않습니다</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', borderRadius: 12, overflow: 'hidden' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  roleLabel: { fontSize: fonts.sizes.base, fontWeight: fonts.weights.semibold, color: '#fff' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  cameraArea: { flex: 1, position: 'relative' as any },
  video: { width: '100%', height: '100%', objectFit: 'cover' as any, transform: 'scaleX(-1)' as any } as any,
  overlay: {
    position: 'absolute' as any, inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
  },
  overlayText: { color: '#fff', fontSize: fonts.sizes.base },
  sttBar: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: 'rgba(124,58,237,0.85)',
    minHeight: 48,
    justifyContent: 'center',
  },
  sttBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
  },
  sttBtnActive: { borderColor: '#FF4444', backgroundColor: 'rgba(255,68,68,0.2)' },
  sttBtnText: { color: '#fff', fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
  interimText: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.sm, marginTop: 4 },
  noSttText: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.sm },
  unsupported: { color: colors.text.secondary, textAlign: 'center', margin: spacing.lg },
});
