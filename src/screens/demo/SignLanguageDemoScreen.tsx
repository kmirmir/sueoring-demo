/**
 * SignLanguageDemoScreen - 수어 인식 데모 화면
 * 농인과 청인 화면을 나란히 보여주며 카메라 연동 + 자막/TTS 시뮬레이션
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

// 간단한 수어 인식 시뮬레이션 데이터
const SIGN_LANGUAGE_SAMPLES = [
  { sign: '안녕하세요', text: '안녕하세요' },
  { sign: '감사합니다', text: '감사합니다' },
  { sign: '도와주세요', text: '도와주세요' },
  { sign: '괜찮아요', text: '괜찮아요' },
  { sign: '네', text: '네' },
  { sign: '아니요', text: '아니요' },
];

export default function SignLanguageDemoScreen() {
  // 농인 화면 상태
  const [deafCameraActive, setDeafCameraActive] = useState(false);
  const [currentSign, setCurrentSign] = useState<string>('');

  // 청인 화면 상태
  const [receivedSubtitles, setReceivedSubtitles] = useState<string[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // TTS 시뮬레이션
  const speakText = (text: string) => {
    setIsSpeaking(true);

    // 웹 환경에서 Web Speech API 사용
    if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      // 모바일에서는 시뮬레이션
      setTimeout(() => setIsSpeaking(false), 2000);
    }
  };

  // 수어 인식 시뮬레이션 (랜덤으로 수어 선택)
  const simulateSignRecognition = () => {
    const randomSign = SIGN_LANGUAGE_SAMPLES[Math.floor(Math.random() * SIGN_LANGUAGE_SAMPLES.length)];
    setCurrentSign(randomSign.text);

    // 청인 화면에 자막 추가
    setReceivedSubtitles(prev => [...prev, randomSign.text]);

    // TTS 재생
    speakText(randomSign.text);

    // 3초 후 초기화
    setTimeout(() => {
      setCurrentSign('');
    }, 3000);
  };

  // 카메라 시작/중지
  const toggleCamera = () => {
    setDeafCameraActive(!deafCameraActive);
    if (!deafCameraActive) {
      console.log('카메라 활성화 - 실제 구현 시 MediaPipe 연동');
    }
  };

  // 자막 초기화
  const clearSubtitles = () => {
    setReceivedSubtitles([]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🤟 수어 인식 데모</Text>
        <Text style={styles.headerSubtitle}>카메라 연동 + 실시간 자막 + TTS</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* 설명 */}
        <View style={styles.descriptionBox}>
          <Text style={styles.descriptionTitle}>💡 데모 설명</Text>
          <Text style={styles.descriptionText}>
            • 왼쪽: 농인 화면 (카메라로 수어 인식){'\n'}
            • 오른쪽: 청인 화면 (자막 표시 + TTS 음성 재생){'\n'}
            • "수어 인식 테스트" 버튼으로 시뮬레이션 실행
          </Text>
        </View>

        {/* 2개 화면 나란히 배치 */}
        <View style={styles.screensContainer}>
          {/* 농인(Deaf) 화면 */}
          <View style={styles.screenBox}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>👤 농인 화면</Text>
              <View style={[styles.statusBadge, deafCameraActive && styles.statusBadge_active]}>
                <Text style={styles.statusBadgeText}>
                  {deafCameraActive ? '🔴 카메라 ON' : '⚫ 카메라 OFF'}
                </Text>
              </View>
            </View>

            {/* 카메라 영역 */}
            <View style={styles.videoArea}>
              {deafCameraActive ? (
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.videoPlaceholderEmoji}>📹</Text>
                  <Text style={styles.videoPlaceholderText}>카메라 피드</Text>
                  <Text style={styles.videoPlaceholderSubtext}>
                    실제 구현 시{'\n'}MediaPipe 손 인식
                  </Text>
                </View>
              ) : (
                <View style={styles.videoPlaceholder}>
                  <Text style={styles.videoPlaceholderEmoji}>📷</Text>
                  <Text style={styles.videoPlaceholderText}>카메라 비활성화</Text>
                </View>
              )}

              {/* 현재 인식된 수어 표시 */}
              {currentSign && (
                <View style={styles.recognitionOverlay}>
                  <Text style={styles.recognitionText}>인식됨: {currentSign}</Text>
                </View>
              )}
            </View>

            {/* 농인 화면 컨트롤 */}
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.controlButton, deafCameraActive && styles.controlButton_active]}
                onPress={toggleCamera}
              >
                <Text style={styles.controlButtonText}>
                  {deafCameraActive ? '📹 카메라 중지' : '📷 카메라 시작'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, styles.controlButton_test]}
                onPress={simulateSignRecognition}
                disabled={!deafCameraActive}
              >
                <Text style={styles.controlButtonText}>🤟 수어 인식 테스트</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 청인(Hearing) 화면 */}
          <View style={styles.screenBox}>
            <View style={styles.screenHeader}>
              <Text style={styles.screenTitle}>👤 청인 화면</Text>
              <View style={[styles.statusBadge, isSpeaking && styles.statusBadge_speaking]}>
                <Text style={styles.statusBadgeText}>
                  {isSpeaking ? '🔊 TTS 재생 중' : '🔇 대기 중'}
                </Text>
              </View>
            </View>

            {/* 비디오 영역 (청인은 농인의 영상을 봄) */}
            <View style={styles.videoArea}>
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoPlaceholderEmoji}>👤</Text>
                <Text style={styles.videoPlaceholderText}>상대방 영상</Text>
                <Text style={styles.videoPlaceholderSubtext}>
                  농인의 수어 영상
                </Text>
              </View>

              {/* 자막 오버레이 */}
              {receivedSubtitles.length > 0 && (
                <View style={styles.subtitleOverlay}>
                  <Text style={styles.subtitleText}>
                    {receivedSubtitles[receivedSubtitles.length - 1]}
                  </Text>
                  {isSpeaking && (
                    <Text style={styles.speakingIndicator}>🔊 음성 재생 중...</Text>
                  )}
                </View>
              )}
            </View>

            {/* 자막 히스토리 */}
            <View style={styles.subtitleHistory}>
              <View style={styles.subtitleHistoryHeader}>
                <Text style={styles.subtitleHistoryTitle}>📝 자막 기록</Text>
                {receivedSubtitles.length > 0 && (
                  <TouchableOpacity onPress={clearSubtitles}>
                    <Text style={styles.clearButton}>지우기</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={styles.subtitleList}>
                {receivedSubtitles.length === 0 ? (
                  <Text style={styles.emptyText}>아직 수신된 자막이 없습니다</Text>
                ) : (
                  receivedSubtitles.map((subtitle, index) => (
                    <View key={index} style={styles.subtitleItem}>
                      <Text style={styles.subtitleItemText}>• {subtitle}</Text>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>

        {/* 기술 정보 */}
        <View style={styles.techInfo}>
          <Text style={styles.techInfoTitle}>🛠️ 실제 구현 시 사용 기술</Text>
          <View style={styles.techStack}>
            <View style={styles.techItem}>
              <Text style={styles.techItemTitle}>수어 인식</Text>
              <Text style={styles.techItemText}>MediaPipe Hands + KSL AI Model</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techItemTitle}>실시간 처리</Text>
              <Text style={styles.techItemText}>WebRTC + WebSocket</Text>
            </View>
            <View style={styles.techItem}>
              <Text style={styles.techItemTitle}>TTS 엔진</Text>
              <Text style={styles.techItemText}>Web Speech API / Google TTS</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[900],
  },
  header: {
    backgroundColor: colors.primary.main,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },

  // Description
  descriptionBox: {
    backgroundColor: colors.primary.dark,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: 12,
  },
  descriptionTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
    marginBottom: spacing.sm,
  },
  descriptionText: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[300],
    lineHeight: 20,
  },

  // Screens Container
  screensContainer: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  screenBox: {
    flex: 1,
    backgroundColor: colors.gray[800],
    borderRadius: 12,
    padding: spacing.md,
    minWidth: Platform.OS === 'web' ? 400 : undefined,
  },
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  screenTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
  },
  statusBadge: {
    backgroundColor: colors.gray[700],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  statusBadge_active: {
    backgroundColor: colors.error.main,
  },
  statusBadge_speaking: {
    backgroundColor: colors.success.main,
  },
  statusBadgeText: {
    fontSize: fonts.sizes.xs,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.medium,
  },

  // Video Area
  videoArea: {
    height: 300,
    backgroundColor: colors.gray[900],
    borderRadius: 8,
    marginBottom: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderEmoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  videoPlaceholderText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    color: colors.gray[400],
    marginBottom: spacing.xs,
  },
  videoPlaceholderSubtext: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[500],
    textAlign: 'center',
  },

  // Recognition Overlay
  recognitionOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  recognitionText: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    textAlign: 'center',
  },

  // Subtitle Overlay
  subtitleOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
  },
  subtitleText: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  speakingIndicator: {
    fontSize: fonts.sizes.sm,
    color: colors.success.main,
    textAlign: 'center',
  },

  // Controls
  controls: {
    gap: spacing.sm,
  },
  controlButton: {
    backgroundColor: colors.primary.main,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  controlButton_active: {
    backgroundColor: colors.error.main,
  },
  controlButton_test: {
    backgroundColor: colors.secondary.main,
  },
  controlButtonText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },

  // Subtitle History
  subtitleHistory: {
    backgroundColor: colors.gray[700],
    borderRadius: 8,
    padding: spacing.md,
    maxHeight: 200,
  },
  subtitleHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subtitleHistoryTitle: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },
  clearButton: {
    fontSize: fonts.sizes.sm,
    color: colors.error.main,
    fontWeight: fonts.weights.medium,
  },
  subtitleList: {
    maxHeight: 120,
  },
  emptyText: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[500],
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  subtitleItem: {
    paddingVertical: spacing.xs,
  },
  subtitleItemText: {
    fontSize: fonts.sizes.base,
    color: colors.gray[300],
  },

  // Tech Info
  techInfo: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.gray[800],
    borderRadius: 12,
  },
  techInfoTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    marginBottom: spacing.md,
  },
  techStack: {
    gap: spacing.md,
  },
  techItem: {
    backgroundColor: colors.gray[700],
    padding: spacing.md,
    borderRadius: 8,
  },
  techItemTitle: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.main,
    marginBottom: spacing.xs,
  },
  techItemText: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[300],
  },
});
