import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing, typography } from '@/constants';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>수어링</Text>
        <Text style={styles.subtitle}>AI 수화 영상통화 서비스</Text>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>통역사 없이,{'\n'}AI가 수화를 통역합니다</Text>
          <Text style={styles.heroDescription}>
            청각장애인과 청인이 실시간 영상통화로{'\n'}자유롭게 소통할 수 있습니다
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>핵심 기능</Text>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureEmoji}>🤟</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>수화 → 자막 변환</Text>
              <Text style={styles.featureDescription}>
                MediaPipe + KSL AI가 수화를{'\n'}실시간으로 한국어 자막으로 변환
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureEmoji}>🗣️</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>음성 → 수화 아바타</Text>
              <Text style={styles.featureDescription}>
                청인의 목소리를 3D 아바타가{'\n'}수화로 실시간 표현
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureEmoji}>📞</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>즉시 영상통화</Text>
              <Text style={styles.featureDescription}>
                대기 없이 바로 연결되는{'\n'}WebRTC 기반 P2P 통화
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureEmoji}>🔒</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>보안 & 프라이버시</Text>
              <Text style={styles.featureDescription}>
                E2E 암호화로 영상 데이터{'\n'}서버 미저장 원칙
              </Text>
            </View>
          </View>
        </View>

        {/* Tech Stack */}
        <View style={styles.techSection}>
          <Text style={styles.sectionTitle}>기술 스택</Text>
          <View style={styles.techGrid}>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>React Native</Text>
            </View>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>TypeScript</Text>
            </View>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>WebRTC</Text>
            </View>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>MediaPipe</Text>
            </View>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>Supabase</Text>
            </View>
            <View style={styles.techBadge}>
              <Text style={styles.techText}>Socket.IO</Text>
            </View>
          </View>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaSection}>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>앱 다운로드 (Coming Soon)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>데모 영상 보기</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Made with ❤️ for accessibility</Text>
          <Text style={styles.footerSubtext}>MVP Phase 1 - Project Setup Complete</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  header: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.primary.main,
    alignItems: 'center',
  },
  logo: {
    fontSize: fonts.sizes['4xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.regular,
    color: colors.primary.contrast,
    opacity: 0.9,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing['2xl'],
  },
  heroSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
    backgroundColor: colors.background.paper,
  },
  heroTitle: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  heroDescription: {
    ...typography.body1,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.base,
  },
  featuresSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary.light + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  featureEmoji: {
    fontSize: 28,
  },
  featureContent: {
    flex: 1,
    justifyContent: 'center',
  },
  featureTitle: {
    ...typography.h5,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  featureDescription: {
    ...typography.body2,
    color: colors.text.secondary,
    lineHeight: fonts.lineHeights.normal * fonts.sizes.sm,
  },
  techSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: colors.background.paper,
  },
  techGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  techBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary.main,
    borderRadius: 20,
  },
  techText: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.medium,
    color: colors.primary.contrast,
  },
  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.primary.main,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.primary.contrast,
    textTransform: 'none',
  },
  secondaryButton: {
    backgroundColor: colors.background.elevated,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary.main,
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.primary.main,
    textTransform: 'none',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.body2,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  footerSubtext: {
    ...typography.caption,
    color: colors.text.disabled,
  },
});
