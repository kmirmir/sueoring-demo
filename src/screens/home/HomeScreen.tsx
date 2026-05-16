import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing, typography } from '@/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isLargeScreen = SCREEN_WIDTH > 768;

interface HomeScreenProps {
  onSignLanguageDemo?: () => void;
  onRealSignLanguage?: () => void;
  onBiDirectionalCall?: () => void;
  onGestureLearning?: () => void;
  onSignDictionary?: () => void;
}

export default function HomeScreen({ onSignLanguageDemo, onRealSignLanguage, onBiDirectionalCall, onGestureLearning, onSignDictionary }: HomeScreenProps = {}) {
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
          <Text style={styles.heroTitle}>통역사 없이,</Text>
          <Text style={styles.heroTitle}>AI가 수화를 통역합니다</Text>
          <View style={styles.heroDescriptionContainer}>
            <Text style={styles.heroDescription}>
              청각장애인과 청인이 실시간 영상통화로
            </Text>
            <Text style={styles.heroDescription}>
              자유롭게 소통할 수 있습니다
            </Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>핵심 기능</Text>

          <View style={[styles.featuresGrid, isLargeScreen && styles.featuresGridLarge]}>
            <View style={[styles.featureCard, isLargeScreen && styles.featureCardLarge]}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>🤟</Text>
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>수화 → 자막 변환</Text>
                <Text style={styles.featureDescription}>
                  MediaPipe + KSL AI가 수화를 실시간으로 한국어 자막으로 변환
                </Text>
              </View>
            </View>

            <View style={[styles.featureCard, isLargeScreen && styles.featureCardLarge]}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>🗣️</Text>
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>음성 → 수화 아바타</Text>
                <Text style={styles.featureDescription}>
                  청인의 목소리를 3D 아바타가 수화로 실시간 표현
                </Text>
              </View>
            </View>

            <View style={[styles.featureCard, isLargeScreen && styles.featureCardLarge]}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>📞</Text>
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>즉시 영상통화</Text>
                <Text style={styles.featureDescription}>
                  대기 없이 바로 연결되는 WebRTC 기반 P2P 통화
                </Text>
              </View>
            </View>

            <View style={[styles.featureCard, isLargeScreen && styles.featureCardLarge]}>
              <View style={styles.featureIcon}>
                <Text style={styles.featureEmoji}>🔒</Text>
              </View>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>보안 & 프라이버시</Text>
                <Text style={styles.featureDescription}>
                  E2E 암호화로 영상 데이터 서버 미저장 원칙
                </Text>
              </View>
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

        {/* Learning Section */}
        {(onGestureLearning || onSignDictionary) && (
          <View style={styles.learningSection}>
            <Text style={styles.sectionTitle}>📚 학습 도구</Text>

            {onGestureLearning && (
              <TouchableOpacity style={styles.learningCard} onPress={onGestureLearning}>
                <View style={styles.learningIcon}>
                  <Text style={styles.learningEmoji}>🎓</Text>
                </View>
                <View style={styles.learningContent}>
                  <Text style={styles.learningTitle}>제스처 학습 모드</Text>
                  <Text style={styles.learningDescription}>
                    수어 제스처를 단계별로 학습하세요
                  </Text>
                </View>
                <Text style={styles.arrowIcon}>›</Text>
              </TouchableOpacity>
            )}

            {onSignDictionary && (
              <TouchableOpacity style={styles.learningCard} onPress={onSignDictionary}>
                <View style={styles.learningIcon}>
                  <Text style={styles.learningEmoji}>📖</Text>
                </View>
                <View style={styles.learningContent}>
                  <Text style={styles.learningTitle}>수어 사전</Text>
                  <Text style={styles.learningDescription}>
                    전체 수어 제스처 목록과 검색
                  </Text>
                </View>
                <Text style={styles.arrowIcon}>›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Demo Menu */}
        {(onRealSignLanguage || onBiDirectionalCall || onSignLanguageDemo) && (
          <View style={styles.demoSection}>
            <Text style={styles.demoTitle}>🎬 수어링 Demo 시연 메뉴</Text>

            {onRealSignLanguage && (
              <TouchableOpacity style={[styles.demoButton, styles.demoButton_highlight]} onPress={onRealSignLanguage}>
                <Text style={styles.demoButtonText}>🤟 실시간 수어 인식 (일방향 커뮤니케이션)</Text>
                <Text style={styles.demoButtonSub}>수어 모션 및 성능 체크</Text>
              </TouchableOpacity>
            )}

            {onBiDirectionalCall && (
              <TouchableOpacity style={[styles.demoButton, styles.demoButton_webrtc]} onPress={onBiDirectionalCall}>
                <Text style={styles.demoButtonText}>📹 실시간 수어 인식 (양방향 커뮤니케이션)</Text>
                <Text style={styles.demoButtonSub}>수어 ↔ 음성 WebRTC 영상통화</Text>
              </TouchableOpacity>
            )}

            {onSignLanguageDemo && (
              <TouchableOpacity style={[styles.demoButton, styles.demoButton_primary]} onPress={onSignLanguageDemo}>
                <Text style={styles.demoButtonText}>🖥️ 실시간 수어 인식 (가상 Demo 시연)</Text>
                <Text style={styles.demoButtonSub}>실제 수어 인식 → 가상 청인 자막·음성 전달</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
    backgroundColor: colors.background.paper,
  },
  heroTitle: {
    fontSize: fonts.sizes['3xl'],
    fontWeight: fonts.weights.bold,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    lineHeight: fonts.sizes['3xl'] * 1.3,
  },
  heroDescriptionContainer: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  heroDescription: {
    fontSize: fonts.sizes.lg,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fonts.sizes.lg * 1.6,
    marginBottom: spacing.xs,
  },
  featuresSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...(isLargeScreen && {
      maxWidth: 1200,
      alignSelf: 'center',
      width: '100%',
    }),
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  featuresGridLarge: {
    gap: spacing.lg,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    width: '100%',
  },
  featureCardLarge: {
    width: '48%',
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
    marginBottom: spacing.sm,
  },
  featureDescription: {
    ...typography.body2,
    color: colors.text.secondary,
    lineHeight: fonts.sizes.sm * 1.6,
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
  demoSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    backgroundColor: colors.warning.background,
    borderRadius: 12,
    marginHorizontal: spacing.lg,
  },
  demoTitle: {
    ...typography.h4,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  demoButton: {
    backgroundColor: colors.secondary.main,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  demoButton_primary: {
    backgroundColor: colors.primary.main,
  },
  demoButton_highlight: {
    backgroundColor: colors.error.main,
  },
  demoButton_webrtc: {
    backgroundColor: '#0D7A3E',
  },
  demoButtonText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },
  demoButtonSub: {
    fontSize: fonts.sizes.sm,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 3,
  },
  learningSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  learningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    padding: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  learningIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary.light + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  learningEmoji: {
    fontSize: 28,
  },
  learningContent: {
    flex: 1,
  },
  learningTitle: {
    ...typography.h5,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  learningDescription: {
    ...typography.body2,
    color: colors.text.secondary,
    lineHeight: fonts.lineHeights.normal * fonts.sizes.sm,
  },
  arrowIcon: {
    fontSize: 32,
    color: colors.gray[500],
  },
});
