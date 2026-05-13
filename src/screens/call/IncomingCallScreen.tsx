/**
 * IncomingCallScreen - 통화 수신 화면
 * 청각장애인 특화: 화면 전체 점멸 + 강진동
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing, typography } from '@/constants';

interface IncomingCallScreenProps {
  callerName: string;
  callerPhone: string;
  callerType: 'deaf' | 'hearing';
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallScreen({
  callerName,
  callerPhone,
  callerType,
  onAccept,
  onReject,
}: IncomingCallScreenProps) {
  const [flashAnim] = useState(new Animated.Value(1));

  // 접근성: 화면 점멸 애니메이션 (청각장애인용)
  useEffect(() => {
    // 진동 패턴: [대기, 진동, 대기, 진동, ...]
    const vibrationPattern = [0, 400, 200, 400, 200, 400];
    Vibration.vibrate(vibrationPattern, true); // 반복

    // 화면 점멸 애니메이션
    const flashAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    flashAnimation.start();

    return () => {
      Vibration.cancel();
      flashAnimation.stop();
    };
  }, [flashAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: flashAnim }]}>
      <StatusBar style="light" />

      {/* Visual Alert Banner */}
      <View style={styles.alertBanner}>
        <Text style={styles.alertText}>📞 전화가 왔습니다!</Text>
      </View>

      {/* Caller Info */}
      <View style={styles.callerInfoContainer}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarEmoji}>
            {callerType === 'deaf' ? '🤟' : '🗣️'}
          </Text>
        </View>

        {/* Name & Phone */}
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callerPhone}>{callerPhone}</Text>

        {/* Caller Type Badge */}
        <View style={styles.callerTypeBadge}>
          <Text style={styles.callerTypeText}>
            {callerType === 'deaf' ? '수화 사용자' : '음성 사용자'}
          </Text>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>수어링 영상통화</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Reject Button */}
        <TouchableOpacity style={styles.rejectButton} onPress={onReject} activeOpacity={0.8}>
          <View style={styles.buttonIconContainer}>
            <Text style={styles.buttonIcon}>✕</Text>
          </View>
          <Text style={styles.buttonLabel}>거절</Text>
        </TouchableOpacity>

        {/* Accept Button */}
        <TouchableOpacity style={styles.acceptButton} onPress={onAccept} activeOpacity={0.8}>
          <View style={styles.buttonIconContainer}>
            <Text style={styles.buttonIcon}>✓</Text>
          </View>
          <Text style={styles.buttonLabel}>수락</Text>
        </TouchableOpacity>
      </View>

      {/* Accessibility Info */}
      <View style={styles.accessibilityInfo}>
        <Text style={styles.infoText}>
          💡 화면 점멸과 진동으로 알려드립니다
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary.dark,
    justifyContent: 'space-between',
  },
  alertBanner: {
    backgroundColor: colors.warning.main,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  alertText: {
    ...typography.h4,
    color: colors.gray[900],
    fontWeight: fonts.weights.bold,
  },

  // Caller Info
  callerInfoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 4,
    borderColor: colors.primary.light,
  },
  avatarEmoji: {
    fontSize: 56,
  },
  callerName: {
    ...typography.h1,
    color: colors.primary.contrast,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  callerPhone: {
    fontSize: fonts.sizes.xl,
    color: colors.gray[200],
    marginBottom: spacing.lg,
  },
  callerTypeBadge: {
    backgroundColor: colors.secondary.main,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    marginBottom: spacing.xl,
  },
  callerTypeText: {
    fontSize: fonts.sizes.base,
    color: colors.secondary.contrast,
    fontWeight: fonts.weights.semibold,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success.main,
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: fonts.sizes.base,
    color: colors.gray[200],
    fontWeight: fonts.weights.medium,
  },

  // Actions
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
  },
  rejectButton: {
    alignItems: 'center',
  },
  acceptButton: {
    alignItems: 'center',
  },
  buttonIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonIcon: {
    fontSize: 40,
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
  },
  buttonLabel: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },

  // Accessibility
  accessibilityInfo: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  infoText: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[400],
    textAlign: 'center',
  },
});

// Override button icon container styles
const rejectButtonIconStyle = {
  ...styles.buttonIconContainer,
  backgroundColor: colors.error.main,
};

const acceptButtonIconStyle = {
  ...styles.buttonIconContainer,
  backgroundColor: colors.success.main,
};

// Export styled buttons
export { rejectButtonIconStyle, acceptButtonIconStyle };
