import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, fonts, spacing } from '@/constants';

interface WaitingAreaProps {
  roomCode: string;
}

export default function WaitingArea({ roomCode }: WaitingAreaProps) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.delay(800 - delay),
        ])
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 250);
    const a3 = animate(dot3, 500);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const dotStyle = (dot: Animated.Value) => ({
    opacity: dot,
    transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📱</Text>
      <View style={styles.dotsRow}>
        <Text style={styles.waitingText}>접속 대기 중</Text>
        <Animated.Text style={[styles.dot, dotStyle(dot1)]}>.</Animated.Text>
        <Animated.Text style={[styles.dot, dotStyle(dot2)]}>.</Animated.Text>
        <Animated.Text style={[styles.dot, dotStyle(dot3)]}>.</Animated.Text>
      </View>
      <Text style={styles.hint}>상대방에게 아래 코드를 공유하세요</Text>
      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>방 코드</Text>
        <Text style={styles.code}>{roomCode}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: spacing.xl,
  },
  icon: { fontSize: 56, marginBottom: spacing.lg },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  waitingText: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.semibold,
    color: colors.text.primary,
  },
  dot: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.main,
    marginLeft: 2,
  },
  hint: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  codeBox: {
    backgroundColor: colors.primary.main,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: fonts.sizes.xs,
    color: colors.primary.contrast,
    opacity: 0.8,
    marginBottom: 4,
  },
  code: {
    fontSize: fonts.sizes['3xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    letterSpacing: 6,
  },
});
