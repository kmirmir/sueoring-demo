/**
 * OutgoingCallScreen - 통화 발신 화면
 * 상대방이 응답할 때까지 대기 중 표시
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing, typography } from '@/constants';

interface OutgoingCallScreenProps {
  callerName: string;
  callerPhone: string;
  callerType: 'deaf' | 'hearing';
  onCancel: () => void;
}

export default function OutgoingCallScreen({
  callerName,
  callerPhone,
  callerType,
  onCancel,
}: OutgoingCallScreenProps) {
  const [pulseAnim] = useState(new Animated.Value(1));
  const [callDuration, setCallDuration] = useState(0);

  // 통화 연결 대기 시간 카운트
  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 펄스 애니메이션 (호출 중 표시)
  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
    };
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Status Banner */}
      <View style={styles.statusBanner}>
        <Text style={styles.statusText}>전화를 걸고 있습니다...</Text>
        <Text style={styles.statusDuration}>{callDuration}초</Text>
      </View>

      {/* Caller Info */}
      <View style={styles.callerInfoContainer}>
        {/* Avatar with pulse animation */}
        <Animated.View
          style={[
            styles.avatarContainer,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Text style={styles.avatarEmoji}>
            {callerType === 'deaf' ? '🤟' : '🗣️'}
          </Text>
        </Animated.View>

        {/* Name & Phone */}
        <Text style={styles.callerName}>{callerName}</Text>
        <Text style={styles.callerPhone}>{callerPhone}</Text>

        {/* Caller Type Badge */}
        <View style={styles.callerTypeBadge}>
          <Text style={styles.callerTypeText}>
            {callerType === 'deaf' ? '수화 사용자' : '음성 사용자'}
          </Text>
        </View>

        {/* Calling Status */}
        <View style={styles.callingStatusContainer}>
          <View style={styles.callingDot} />
          <Text style={styles.callingText}>수어링 영상통화 연결 중</Text>
        </View>
      </View>

      {/* Cancel Button */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
          <View style={styles.buttonIconContainer}>
            <Text style={styles.buttonIcon}>✕</Text>
          </View>
          <Text style={styles.buttonLabel}>취소</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          💡 상대방이 응답할 때까지 기다려주세요
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary.dark,
    justifyContent: 'space-between',
  },
  statusBanner: {
    backgroundColor: 'rgba(37, 99, 235, 0.3)',
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  statusText: {
    ...typography.h4,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
    marginBottom: spacing.xs,
  },
  statusDuration: {
    fontSize: fonts.sizes.base,
    color: colors.gray[200],
    fontWeight: fonts.weights.medium,
  },

  // Caller Info
  callerInfoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  avatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 4,
    borderColor: colors.primary.light,
    shadowColor: colors.primary.main,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarEmoji: {
    fontSize: 64,
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
  callingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 24,
  },
  callingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning.main,
    marginRight: spacing.sm,
  },
  callingText: {
    fontSize: fonts.sizes.base,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.medium,
  },

  // Actions
  actionsContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  cancelButton: {
    alignItems: 'center',
  },
  buttonIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.error.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.error.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
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

  // Info
  infoContainer: {
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
