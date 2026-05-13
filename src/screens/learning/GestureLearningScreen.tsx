/**
 * GestureLearningScreen - 제스처 학습 모드
 * 각 수어 제스처를 단계별로 학습할 수 있는 화면
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isLargeScreen = SCREEN_WIDTH > 768;

interface Gesture {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  emoji: string;
}

const GESTURES: Gesture[] = [
  {
    id: '1',
    name: '안녕하세요',
    category: '기본 인사',
    description: '손을 위로 들고 모든 손가락을 펴는 제스처',
    steps: [
      '1. 손을 어깨 높이보다 위로 올립니다',
      '2. 손바닥이 상대방을 향하도록 합니다',
      '3. 모든 손가락을 활짝 펴줍니다',
      '4. 손을 좌우로 가볍게 흔들어줍니다'
    ],
    difficulty: 'easy',
    emoji: '👋'
  },
  {
    id: '2',
    name: '감사합니다',
    category: '기본 인사',
    description: '주먹을 쥐는 제스처',
    steps: [
      '1. 손을 가슴 앞으로 가져옵니다',
      '2. 손가락을 모두 안으로 접습니다',
      '3. 주먹을 꽉 쥡니다',
      '4. 살짝 고개를 숙이며 표현합니다'
    ],
    difficulty: 'easy',
    emoji: '🙏'
  },
  {
    id: '3',
    name: '네',
    category: '긍정/부정',
    description: '검지만 펴는 제스처',
    steps: [
      '1. 손을 주먹 쥔 상태로 준비합니다',
      '2. 검지손가락만 위로 펴줍니다',
      '3. 나머지 손가락은 접힌 상태 유지',
      '4. 검지를 위아래로 끄덕이듯 움직입니다'
    ],
    difficulty: 'easy',
    emoji: '☝️'
  },
  {
    id: '4',
    name: '아니요',
    category: '긍정/부정',
    description: '검지와 중지를 펴는 V자 제스처',
    steps: [
      '1. 손을 주먹 쥔 상태로 준비합니다',
      '2. 검지와 중지를 위로 펴줍니다',
      '3. V자 모양을 만듭니다',
      '4. 좌우로 가볍게 흔들어줍니다'
    ],
    difficulty: 'easy',
    emoji: '✌️'
  },
  {
    id: '5',
    name: '괜찮아요',
    category: '감정 표현',
    description: '엄지를 위로 올리는 제스처',
    steps: [
      '1. 손을 주먹 쥔 상태로 준비합니다',
      '2. 엄지손가락만 위로 펴줍니다',
      '3. 나머지 손가락은 접힌 상태 유지',
      '4. 밝은 표정과 함께 표현합니다'
    ],
    difficulty: 'easy',
    emoji: '👍'
  },
  {
    id: '6',
    name: '도와주세요',
    category: '요청',
    description: '손바닥을 펴서 보이는 제스처',
    steps: [
      '1. 손을 가슴 앞으로 가져옵니다',
      '2. 손바닥이 상대방을 향하도록 합니다',
      '3. 모든 손가락을 활짝 펴줍니다',
      '4. 간절한 표정과 함께 표현합니다'
    ],
    difficulty: 'medium',
    emoji: '🤲'
  },

  // ===== 긴급 상황 (119 관련) =====
  {
    id: '7',
    name: '위험',
    category: '긴급 상황',
    description: '양손을 어깨보다 높이 들어 위험 신호를 표시',
    steps: [
      '1. 카메라에 상체 전체가 보이도록 거리를 둡니다',
      '2. 양손을 머리 위로 올립니다',
      '3. 양손이 어깨 위에 있어야 인식됩니다',
      '4. 빨간색 바운딩 박스가 표시되면 성공'
    ],
    difficulty: 'easy',
    emoji: '⚠️'
  },
  {
    id: '8',
    name: '경찰',
    category: '긴급 상황',
    description: '검지로 경찰 신호',
    steps: [
      '1. 손을 얼굴 높이로 올립니다',
      '2. 검지만 위로 펴고 나머지는 접습니다',
      '3. 손이 얼굴 가까이 있어야 "네"와 구별됩니다'
    ],
    difficulty: 'easy',
    emoji: '🚔'
  },
  {
    id: '9',
    name: '병원',
    category: '긴급 상황',
    description: '양손 검지를 교차해 십자(+) 표현',
    steps: [
      '1. 양손 모두 검지만 펴고 나머지는 접습니다',
      '2. 양손을 가슴 앞으로 가져옵니다',
      '3. 두 검지의 끝을 서로 가깝게 합니다',
      '4. 십자(+) 모양이 되면 인식됩니다'
    ],
    difficulty: 'medium',
    emoji: '🏥'
  },
  {
    id: '10',
    name: '아파요',
    category: '긴급 상황',
    description: '주먹을 얼굴 가까이로',
    steps: [
      '1. 손을 주먹 쥡니다',
      '2. 주먹을 이마(얼굴 높이)까지 올립니다',
      '3. 손이 얼굴 가까이 있어야 "감사합니다"와 구별됩니다'
    ],
    difficulty: 'easy',
    emoji: '🤕'
  },
  {
    id: '11',
    name: '119',
    category: '긴급 상황',
    description: '세 손가락(W자)으로 응급 신고',
    steps: [
      '1. 손을 가슴 앞으로 가져옵니다',
      '2. 검지·중지·약지 세 손가락을 위로 펴줍니다',
      '3. 엄지와 새끼손가락은 접습니다',
      '4. W자 모양이 되면 인식됩니다'
    ],
    difficulty: 'medium',
    emoji: '🚨'
  },
  {
    id: '12',
    name: '전화',
    category: '긴급 상황',
    description: '엄지+새끼만 펴서 전화 표현 (🤙 shaka)',
    steps: [
      '1. 손을 주먹 쥡니다',
      '2. 엄지손가락을 옆으로 펴줍니다',
      '3. 새끼손가락도 위로 펴줍니다',
      '4. 다른 손가락은 접은 상태를 유지합니다'
    ],
    difficulty: 'medium',
    emoji: '📞'
  },
  {
    id: '13',
    name: '구급차',
    category: '긴급 상황',
    description: '손바닥을 흔들어 구급차 호출 (모션)',
    steps: [
      '1. 손바닥을 펴고 모든 손가락을 활짝 폅니다',
      '2. 손을 중간 높이(가슴~배 사이)로 들어 올립니다',
      '3. 약 0.5초 동안 좌우로 빠르게 흔듭니다 (3회 이상)',
      '4. 흔들기 감지되면 빨간 박스가 나타납니다'
    ],
    difficulty: 'medium',
    emoji: '🚑'
  },
  {
    id: '14',
    name: '급해요',
    category: '긴급 상황',
    description: '양손을 동시에 흔들어 긴급함 표현 (모션)',
    steps: [
      '1. 양손을 모두 펴고 손가락을 활짝 폅니다',
      '2. 양손을 가슴 앞으로 가져옵니다',
      '3. 동시에 양손을 좌우로 빠르게 흔듭니다',
      '4. 두 손이 모두 흔들려야 인식됩니다'
    ],
    difficulty: 'hard',
    emoji: '⚡'
  }
];

interface GestureLearningScreenProps {
  onBack: () => void;
}

export default function GestureLearningScreen({ onBack: _onBack }: GestureLearningScreenProps) {
  const [selectedGesture, setSelectedGesture] = useState<Gesture | null>(null);
  const [completedGestures, setCompletedGestures] = useState<Set<string>>(new Set());

  const handleGestureComplete = (gestureId: string) => {
    setCompletedGestures(prev => new Set([...prev, gestureId]));
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'hard': return '#EF4444';
      default: return colors.gray[500];
    }
  };

  const getDifficultyText = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '쉬움';
      case 'medium': return '보통';
      case 'hard': return '어려움';
      default: return '알 수 없음';
    }
  };

  if (selectedGesture) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />

        {/* 상세 학습 화면 */}
        <View style={styles.detailContainer}>
          {/* 헤더 */}
          <View style={styles.detailHeader}>
            <TouchableOpacity
              style={styles.detailBackButton}
              onPress={() => setSelectedGesture(null)}
            >
              <Text style={styles.detailBackButtonText}>← 뒤로</Text>
            </TouchableOpacity>
            <Text style={styles.detailCategory}>{selectedGesture.category}</Text>
          </View>

          {/* 제스처 정보 */}
          <View style={styles.gestureInfo}>
            <Text style={styles.gestureEmoji}>{selectedGesture.emoji}</Text>
            <Text style={styles.gestureName}>{selectedGesture.name}</Text>
            <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(selectedGesture.difficulty) }]}>
              <Text style={styles.difficultyText}>{getDifficultyText(selectedGesture.difficulty)}</Text>
            </View>
            <Text style={styles.gestureDescription}>{selectedGesture.description}</Text>
          </View>

          {/* 학습 단계 */}
          <ScrollView style={styles.stepsContainer}>
            <Text style={styles.stepsTitle}>학습 단계</Text>
            {selectedGesture.steps.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}

            {/* 완료 버튼 */}
            <TouchableOpacity
              style={[
                styles.completeButton,
                completedGestures.has(selectedGesture.id) && styles.completedButton
              ]}
              onPress={() => handleGestureComplete(selectedGesture.id)}
            >
              <Text style={styles.completeButtonText}>
                {completedGestures.has(selectedGesture.id) ? '✓ 학습 완료' : '학습 완료 표시'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => _onBack()}
        >
          <Text style={styles.backButtonText}>← 홈으로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>제스처 학습 모드</Text>
        <Text style={styles.subtitle}>
          수어 제스처를 단계별로 학습해보세요
        </Text>
        <View style={styles.progressBar}>
          <Text style={styles.progressText}>
            학습 진행률: {completedGestures.size}/{GESTURES.length} ({Math.round((completedGestures.size / GESTURES.length) * 100)}%)
          </Text>
          <View style={styles.progressBarBackground}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(completedGestures.size / GESTURES.length) * 100}%` }
              ]}
            />
          </View>
        </View>
      </View>

      {/* 제스처 목록 */}
      <ScrollView style={styles.content} contentContainerStyle={isLargeScreen && styles.contentGrid}>
        {GESTURES.map((gesture) => {
          const isCompleted = completedGestures.has(gesture.id);
          return (
            <TouchableOpacity
              key={gesture.id}
              style={[
                styles.gestureCard,
                isCompleted && styles.gestureCardCompleted,
                isLargeScreen && styles.gestureCardGrid
              ]}
              onPress={() => setSelectedGesture(gesture)}
            >
              <View style={styles.gestureCardLeft}>
                <Text style={styles.gestureCardEmoji}>{gesture.emoji}</Text>
                <View style={styles.gestureCardInfo}>
                  <Text style={styles.gestureCardName}>{gesture.name}</Text>
                  <Text style={styles.gestureCardCategory}>{gesture.category}</Text>
                </View>
              </View>
              <View style={styles.gestureCardRight}>
                <View style={[styles.difficultyBadgeSmall, { backgroundColor: getDifficultyColor(gesture.difficulty) }]}>
                  <Text style={styles.difficultyTextSmall}>{getDifficultyText(gesture.difficulty)}</Text>
                </View>
                {isCompleted && (
                  <Text style={styles.completedBadge}>✓</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  header: {
    backgroundColor: colors.primary.main,
    padding: spacing['2xl'],
    paddingTop: spacing['3xl'],
    position: 'relative',
  },
  backButton: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.lg,
    padding: spacing.sm,
    zIndex: 10,
  },
  backButtonText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    color: colors.primary.contrast,
  },
  title: {
    fontSize: fonts.sizes['3xl'],
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fonts.sizes.base,
    color: colors.primary.contrast,
    opacity: 0.9,
    marginBottom: spacing.lg,
  },
  progressBar: {
    marginTop: spacing.md,
  },
  progressText: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    marginBottom: spacing.sm,
    fontWeight: fonts.weights.semibold,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  contentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    maxWidth: 1400,
    alignSelf: 'center',
    width: '100%',
  },
  gestureCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1F3A',
    padding: spacing.lg,
    borderRadius: 12,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary.dark,
  },
  gestureCardGrid: {
    width: `${(100 - 4) / 3}%`,
    minWidth: 300,
  },
  gestureCardCompleted: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  gestureCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  gestureCardEmoji: {
    fontSize: 40,
    marginRight: spacing.md,
  },
  gestureCardInfo: {
    flex: 1,
  },
  gestureCardName: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.xs,
  },
  gestureCardCategory: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[400],
  },
  gestureCardRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  difficultyBadgeSmall: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  difficultyTextSmall: {
    fontSize: fonts.sizes.xs,
    color: '#FFFFFF',
    fontWeight: fonts.weights.bold,
  },
  completedBadge: {
    fontSize: 24,
    color: '#10B981',
  },
  difficultyBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    marginBottom: spacing.md,
  },
  difficultyText: {
    fontSize: fonts.sizes.sm,
    color: '#FFFFFF',
    fontWeight: fonts.weights.bold,
  },

  // 상세 화면
  detailContainer: {
    flex: 1,
  },
  detailHeader: {
    backgroundColor: colors.primary.main,
    padding: spacing.xl,
    paddingTop: spacing['3xl'],
  },
  detailBackButton: {
    marginBottom: spacing.md,
  },
  detailBackButtonText: {
    fontSize: fonts.sizes.base,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
  },
  detailCategory: {
    fontSize: fonts.sizes.base,
    color: colors.primary.contrast,
    opacity: 0.8,
  },
  gestureInfo: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: '#1A1F3A',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary.dark,
  },
  gestureEmoji: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  gestureName: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.md,
  },
  gestureDescription: {
    fontSize: fonts.sizes.base,
    color: colors.gray[300],
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 24,
  },
  stepsContainer: {
    flex: 1,
    padding: spacing.xl,
  },
  stepsTitle: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.lg,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  stepNumberText: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.bold,
    color: colors.primary.contrast,
  },
  stepText: {
    flex: 1,
    fontSize: fonts.sizes.base,
    color: '#FFFFFF',
    lineHeight: 24,
  },
  completeButton: {
    backgroundColor: colors.success.main,
    padding: spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing['2xl'],
  },
  completedButton: {
    backgroundColor: colors.gray[600],
  },
  completeButtonText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
  },
});
