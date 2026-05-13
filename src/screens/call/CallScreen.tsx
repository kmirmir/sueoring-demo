/**
 * CallScreen - 실시간 영상통화 화면
 * 수화 인식, 음성 인식, 자막, 아바타 오버레이 포함
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

interface CallScreenProps {
  callerName: string;
  callerType: 'deaf' | 'hearing';
  myType: 'deaf' | 'hearing';
  onEndCall: () => void;
}

export default function CallScreen({
  callerName,
  callerType,
  myType,
  onEndCall,
}: CallScreenProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [showAvatarDemo, setShowAvatarDemo] = useState(false);

  // 통화 시간 타이머
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 데모: 자막 시뮬레이션
  useEffect(() => {
    const subtitles = [
      '안녕하세요',
      '오늘 날씨가 좋네요',
      '통화 잘 들리시나요?',
      '수어링 서비스 어떠세요?',
    ];
    let index = 0;

    const interval = setInterval(() => {
      setCurrentSubtitle(subtitles[index % subtitles.length]);
      index++;
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header - 통화 정보 */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
        </View>
        <View style={styles.userTypeBadge}>
          <Text style={styles.userTypeText}>
            {callerType === 'deaf' ? '🤟 수화' : '🗣️ 음성'}
          </Text>
        </View>
      </View>

      {/* Main Video Area - 상대방 영상 */}
      <View style={styles.remoteVideoContainer}>
        {/* 실제로는 WebRTC 영상 스트림 */}
        <View style={styles.videoPlaceholder}>
          <Text style={styles.videoPlaceholderText}>📹</Text>
          <Text style={styles.videoPlaceholderLabel}>상대방 화면</Text>
          <Text style={styles.videoPlaceholderSubtext}>(WebRTC 영상)</Text>
        </View>

        {/* 자막 오버레이 (청인이 말할 때 청각장애인에게 표시) */}
        {myType === 'deaf' && currentSubtitle && (
          <View style={styles.subtitleOverlay}>
            <Text style={styles.subtitleText}>{currentSubtitle}</Text>
          </View>
        )}

        {/* 아바타 오버레이 (청인이 말할 때 수화 아바타 표시) */}
        {myType === 'deaf' && showAvatarDemo && (
          <View style={styles.avatarOverlay}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarPlaceholder}>🤖</Text>
              <Text style={styles.avatarLabel}>수화 아바타</Text>
            </View>
          </View>
        )}
      </View>

      {/* Local Video - 내 영상 (작은 화면) */}
      <View style={styles.localVideoContainer}>
        {!isVideoOff ? (
          <View style={styles.localVideoPlaceholder}>
            <Text style={styles.localVideoText}>📱</Text>
            <Text style={styles.localVideoLabel}>나</Text>
          </View>
        ) : (
          <View style={[styles.localVideoPlaceholder, styles.localVideoOff]}>
            <Text style={styles.localVideoText}>📷</Text>
            <Text style={styles.localVideoLabel}>카메라 꺼짐</Text>
          </View>
        )}
      </View>

      {/* 수화 인식 상태 표시 (청각장애인이 수화할 때) */}
      {myType === 'deaf' && (
        <View style={styles.signRecognitionStatus}>
          <View style={styles.recognitionIndicator} />
          <Text style={styles.recognitionText}>수화 인식 중...</Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.controlsContainer}>
        {/* 아바타 토글 (데모용) */}
        {myType === 'deaf' && (
          <TouchableOpacity
            style={styles.controlButton}
            onPress={() => setShowAvatarDemo(!showAvatarDemo)}
          >
            <Text style={styles.controlIcon}>🤖</Text>
            <Text style={styles.controlLabel}>
              {showAvatarDemo ? '아바타 숨김' : '아바타 표시'}
            </Text>
          </TouchableOpacity>
        )}

        {/* 마이크 음소거 */}
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButton_active]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Text style={styles.controlIcon}>{isMuted ? '🔇' : '🎤'}</Text>
          <Text style={styles.controlLabel}>{isMuted ? '음소거됨' : '마이크'}</Text>
        </TouchableOpacity>

        {/* 비디오 끄기 */}
        <TouchableOpacity
          style={[styles.controlButton, isVideoOff && styles.controlButton_active]}
          onPress={() => setIsVideoOff(!isVideoOff)}
        >
          <Text style={styles.controlIcon}>{isVideoOff ? '📷' : '📹'}</Text>
          <Text style={styles.controlLabel}>{isVideoOff ? '카메라 꺼짐' : '비디오'}</Text>
        </TouchableOpacity>

        {/* 통화 종료 */}
        <TouchableOpacity style={styles.endCallButton} onPress={onEndCall}>
          <Text style={styles.endCallIcon}>📞</Text>
          <Text style={styles.endCallLabel}>종료</Text>
        </TouchableOpacity>
      </View>

      {/* 접근성: 진동 피드백 안내 */}
      <View style={styles.accessibilityHint}>
        <Text style={styles.hintText}>💡 통화 상태 변경 시 진동으로 알려드립니다</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[900],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  headerInfo: {
    flex: 1,
  },
  callerName: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    marginBottom: spacing.sm,
  },
  callDuration: {
    fontSize: fonts.sizes.base,
    color: colors.gray[200],
    fontWeight: fonts.weights.medium,
  },
  userTypeBadge: {
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  userTypeText: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
  },

  // Video Areas
  remoteVideoContainer: {
    flex: 1,
    position: 'relative',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.gray[800],
  },
  videoPlaceholderText: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  videoPlaceholderLabel: {
    fontSize: fonts.sizes.xl,
    color: colors.gray[100],
    fontWeight: fonts.weights.semibold,
  },
  videoPlaceholderSubtext: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[300],
    marginTop: spacing.xs,
  },

  // 자막 오버레이
  subtitleOverlay: {
    position: 'absolute',
    bottom: spacing['2xl'],
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.suearing.subtitleBackground,
    padding: spacing.md,
    borderRadius: 8,
  },
  subtitleText: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
    textAlign: 'center',
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.xl,
  },

  // 아바타 오버레이
  avatarOverlay: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    width: 200,
    height: 300,
    backgroundColor: colors.suearing.avatarBackground,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
  },
  avatarPlaceholder: {
    fontSize: 80,
    marginBottom: spacing.sm,
  },
  avatarLabel: {
    fontSize: fonts.sizes.sm,
    color: colors.text.primary,
    fontWeight: fonts.weights.medium,
  },

  // Local Video (PIP)
  localVideoContainer: {
    position: 'absolute',
    top: spacing['3xl'],
    left: spacing.lg,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.gray[600],
  },
  localVideoPlaceholder: {
    flex: 1,
    backgroundColor: colors.gray[700],
    justifyContent: 'center',
    alignItems: 'center',
  },
  localVideoOff: {
    backgroundColor: colors.gray[900],
  },
  localVideoText: {
    fontSize: 32,
    marginBottom: spacing.xs,
  },
  localVideoLabel: {
    fontSize: fonts.sizes.xs,
    color: colors.gray[300],
  },

  // 수화 인식 상태
  signRecognitionStatus: {
    position: 'absolute',
    top: spacing['3xl'] + 180,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.9)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  recognitionIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success.main,
    marginRight: spacing.sm,
  },
  recognitionText: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.medium,
  },

  // Controls
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    gap: spacing.md,
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.gray[700],
  },
  controlButton_active: {
    backgroundColor: colors.primary.main,
  },
  controlIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  controlLabel: {
    fontSize: fonts.sizes.xs,
    color: colors.primary.contrast,
  },
  endCallButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.error.main,
  },
  endCallIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  endCallLabel: {
    fontSize: fonts.sizes.xs,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
  },

  // Accessibility Hint
  accessibilityHint: {
    position: 'absolute',
    bottom: spacing['4xl'] + 100,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  hintText: {
    fontSize: fonts.sizes.xs,
    color: colors.gray[400],
    textAlign: 'center',
  },
});
