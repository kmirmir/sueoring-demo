import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Button from '@/components/common/Button';
import { colors, fonts, spacing, typography } from '@/constants';

type UserType = 'deaf' | 'hearing' | null;

interface UserTypeScreenProps {
  onComplete: (userType: UserType) => void;
}

export default function UserTypeScreen({ onComplete }: UserTypeScreenProps) {
  const [selectedType, setSelectedType] = useState<UserType>(null);

  const handleComplete = () => {
    if (selectedType) {
      onComplete(selectedType);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.title}>사용자 유형을 선택해주세요</Text>
          <Text style={styles.description}>
            맞춤형 UI와 기능을 제공하기 위해{'\n'}사용자 유형이 필요합니다
          </Text>
        </View>

        {/* User Type Cards */}
        <View style={styles.cardsContainer}>
          {/* 청각장애인 */}
          <TouchableOpacity
            style={[styles.card, selectedType === 'deaf' && styles.card_selected]}
            onPress={() => setSelectedType('deaf')}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>🤟</Text>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>청각장애인</Text>
                <Text style={styles.cardSubtitle}>수화 사용자</Text>
              </View>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.cardDescription}>수화가 주요 의사소통 수단인 경우</Text>

              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>수화 인식 최적화</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>큰 자막 표시</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>진동 알림 강화</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>시각적 피드백</Text>
                </View>
              </View>
            </View>

            {selectedType === 'deaf' && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>선택됨</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* 청인 */}
          <TouchableOpacity
            style={[styles.card, selectedType === 'hearing' && styles.card_selected]}
            onPress={() => setSelectedType('hearing')}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>🗣️</Text>
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTitle}>청인</Text>
                <Text style={styles.cardSubtitle}>음성 사용자</Text>
              </View>
            </View>

            <View style={styles.cardContent}>
              <Text style={styles.cardDescription}>
                음성이 주요 의사소통 수단인 경우
              </Text>

              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>음성 인식 활성화</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>수화 아바타 표시</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>음성 알림</Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={styles.featureBullet}>✓</Text>
                  <Text style={styles.featureText}>수화 학습 지원</Text>
                </View>
              </View>
            </View>

            {selectedType === 'hearing' && (
              <View style={styles.selectedBadge}>
                <Text style={styles.selectedBadgeText}>선택됨</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            💡 나중에 설정에서 변경할 수 있습니다
          </Text>
        </View>

        {/* Button */}
        <Button
          title="시작하기"
          onPress={handleComplete}
          fullWidth
          size="large"
          disabled={!selectedType}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body1,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: fonts.lineHeights.relaxed * fonts.sizes.base,
  },
  cardsContainer: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border.default,
  },
  card_selected: {
    borderColor: colors.primary.main,
    backgroundColor: colors.primary.main + '10',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardEmoji: {
    fontSize: 48,
    marginRight: spacing.md,
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    ...typography.h4,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
  },
  cardContent: {
    paddingLeft: spacing.sm,
  },
  cardDescription: {
    ...typography.body2,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  featuresList: {
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureBullet: {
    fontSize: fonts.sizes.base,
    color: colors.success.main,
    marginRight: spacing.sm,
    fontWeight: fonts.weights.bold,
  },
  featureText: {
    fontSize: fonts.sizes.sm,
    color: colors.text.primary,
  },
  selectedBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  selectedBadgeText: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
  },
  infoContainer: {
    padding: spacing.md,
    backgroundColor: colors.info.background,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  infoText: {
    fontSize: fonts.sizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
