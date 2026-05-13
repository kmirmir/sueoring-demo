/**
 * SignDictionaryScreen - 수어 사전
 * 전체 수어 제스처 목록과 검색 기능 제공
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, spacing } from '@/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isLargeScreen = SCREEN_WIDTH > 768;

interface SignEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  howTo: string;
  emoji: string;
  tags: string[];
}

const SIGN_DICTIONARY: SignEntry[] = [
  // 기본 인사
  {
    id: '1',
    name: '안녕하세요',
    category: '기본 인사',
    description: '만남의 인사',
    howTo: '손을 위로 들고 모든 손가락 펴기',
    emoji: '👋',
    tags: ['인사', '안녕', '반갑습니다']
  },
  {
    id: '2',
    name: '감사합니다',
    category: '기본 인사',
    description: '고마움의 표현',
    howTo: '주먹 쥐기',
    emoji: '🙏',
    tags: ['감사', '고맙습니다', '고마워요']
  },

  // 긍정/부정
  {
    id: '3',
    name: '네',
    category: '긍정/부정',
    description: '긍정의 대답',
    howTo: '검지만 펴기',
    emoji: '☝️',
    tags: ['네', '예', '그렇습니다', '맞아요']
  },
  {
    id: '4',
    name: '아니요',
    category: '긍정/부정',
    description: '부정의 대답',
    howTo: '검지+중지 펴기 (V자)',
    emoji: '✌️',
    tags: ['아니요', '아니', '싫어요', '안돼요']
  },

  // 감정 표현
  {
    id: '5',
    name: '괜찮아요',
    category: '감정 표현',
    description: '괜찮다는 표현',
    howTo: '엄지 위로 (👍)',
    emoji: '👍',
    tags: ['괜찮아요', '좋아요', '오케이', 'OK']
  },

  // 요청
  {
    id: '6',
    name: '도와주세요',
    category: '요청',
    description: '도움 요청',
    howTo: '손바닥 보이기 (모든 손가락 펴기)',
    emoji: '🤲',
    tags: ['도와주세요', '도움', '부탁', '헬프']
  },

  // 긴급 상황 (실시간 인식 가능한 패턴 — 데모 환경에 최적화)
  {
    id: '7',
    name: '위험',
    category: '긴급 상황',
    description: '위험한 상황 알림',
    howTo: '양손을 어깨보다 높이 들기 (몸 전체가 카메라에 잡혀야 함)',
    emoji: '⚠️',
    tags: ['위험', '조심', '경고', '비상']
  },
  {
    id: '8',
    name: '경찰',
    category: '긴급 상황',
    description: '경찰 호출 (112)',
    howTo: '검지만 펴서 얼굴 높이로 들기',
    emoji: '🚔',
    tags: ['경찰', '신고', '112']
  },
  {
    id: '9',
    name: '병원',
    category: '긴급 상황',
    description: '병원 찾기',
    howTo: '양손 모두 검지만 펴고 두 검지 끝을 가깝게 (십자 모양)',
    emoji: '🏥',
    tags: ['병원', '의사', '치료', '응급실']
  },
  {
    id: '10',
    name: '아파요',
    category: '긴급 상황',
    description: '통증 표현',
    howTo: '주먹을 얼굴(이마) 가까이로',
    emoji: '🤕',
    tags: ['아파요', '통증', '아픔']
  },
  {
    id: '11',
    name: '119',
    category: '긴급 상황',
    description: '응급 신고',
    howTo: '검지·중지·약지 세 손가락 펴기 (W자)',
    emoji: '🚨',
    tags: ['119', '응급', '긴급호출', '구조요청']
  },
  {
    id: '12',
    name: '전화',
    category: '긴급 상황',
    description: '전화 통화',
    howTo: '엄지+새끼손가락만 펴기 (🤙 shaka)',
    emoji: '📞',
    tags: ['전화', '통화', '콜']
  },
  {
    id: '13',
    name: '구급차',
    category: '긴급 상황',
    description: '구급차 호출 (모션 인식)',
    howTo: '손바닥을 펴고 중간 높이에서 좌우로 빠르게 흔들기',
    emoji: '🚑',
    tags: ['구급차', '응급차', '구조']
  },
  {
    id: '14',
    name: '급해요',
    category: '긴급 상황',
    description: '긴급함 표현 (모션 인식)',
    howTo: '양손을 모두 펴고 동시에 좌우로 빠르게 흔들기',
    emoji: '⚡',
    tags: ['급해요', '빨리', '긴급', '서둘러']
  },
];

const CATEGORIES = ['전체', '기본 인사', '긍정/부정', '감정 표현', '요청', '긴급 상황'];

interface SignDictionaryScreenProps {
  onBack: () => void;
}

export default function SignDictionaryScreen({ onBack: _onBack }: SignDictionaryScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [selectedSign, setSelectedSign] = useState<SignEntry | null>(null);

  const filteredSigns = SIGN_DICTIONARY.filter(sign => {
    const matchesCategory = selectedCategory === '전체' || sign.category === selectedCategory;
    const matchesSearch = searchQuery === '' ||
      sign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sign.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  if (selectedSign) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />

        {/* 상세 화면 */}
        <View style={styles.detailContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity
              style={styles.detailBackButton}
              onPress={() => setSelectedSign(null)}
            >
              <Text style={styles.detailBackButtonText}>← 뒤로</Text>
            </TouchableOpacity>
            <Text style={styles.detailCategory}>{selectedSign.category}</Text>
          </View>

          <ScrollView style={styles.detailContent}>
            <View style={styles.detailMain}>
              <Text style={styles.detailEmoji}>{selectedSign.emoji}</Text>
              <Text style={styles.detailName}>{selectedSign.name}</Text>
              <Text style={styles.detailDescription}>{selectedSign.description}</Text>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>수어 방법</Text>
              <View style={styles.howToBox}>
                <Text style={styles.howToText}>{selectedSign.howTo}</Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>관련 키워드</Text>
              <View style={styles.tagsContainer}>
                {selectedSign.tags.map((tag, index) => (
                  <View key={index} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
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
        <Text style={styles.title}>수어 사전</Text>
        <Text style={styles.subtitle}>
          {SIGN_DICTIONARY.length}개의 수어 제스처
        </Text>

        {/* 검색 */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="수어 검색..."
            placeholderTextColor={colors.gray[400]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 카테고리 필터 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
        >
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text
                style={[
                  styles.categoryButtonText,
                  selectedCategory === category && styles.categoryButtonTextActive
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 결과 */}
      <ScrollView style={styles.content} contentContainerStyle={isLargeScreen && styles.contentGrid}>
        <Text style={[styles.resultCount, isLargeScreen && styles.resultCountFull]}>
          {filteredSigns.length}개의 결과
        </Text>

        {filteredSigns.map((sign) => (
          <TouchableOpacity
            key={sign.id}
            style={[styles.signCard, isLargeScreen && styles.signCardGrid]}
            onPress={() => setSelectedSign(sign)}
          >
            <Text style={styles.signEmoji}>{sign.emoji}</Text>
            <View style={styles.signInfo}>
              <Text style={styles.signName}>{sign.name}</Text>
              <Text style={styles.signCategory}>{sign.category}</Text>
              <Text style={styles.signDescription}>{sign.description}</Text>
            </View>
            <Text style={styles.arrowIcon}>›</Text>
          </TouchableOpacity>
        ))}

        {filteredSigns.length === 0 && (
          <View style={[styles.emptyState, isLargeScreen && styles.emptyStateFull]}>
            <Text style={styles.emptyEmoji}>🔍</Text>
            <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
            <Text style={styles.emptySubtext}>다른 키워드로 검색해보세요</Text>
          </View>
        )}
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
    padding: spacing.xl,
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
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fonts.sizes.base,
    color: colors.primary.contrast,
    opacity: 0.8,
    marginBottom: spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  searchIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fonts.sizes.base,
    color: '#FFFFFF',
  },
  clearIcon: {
    fontSize: 20,
    color: colors.primary.contrast,
    paddingHorizontal: spacing.sm,
  },
  categoriesContainer: {
    marginBottom: spacing.md,
  },
  categoryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginRight: spacing.sm,
  },
  categoryButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  categoryButtonText: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
  },
  categoryButtonTextActive: {
    color: colors.primary.main,
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
  resultCount: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[400],
    marginBottom: spacing.md,
  },
  resultCountFull: {
    width: '100%',
  },
  signCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1F3A',
    padding: spacing.xl,
    borderRadius: 12,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary.dark,
  },
  signCardGrid: {
    width: `${(100 - 4) / 3}%`,
    minWidth: 300,
  },
  signEmoji: {
    fontSize: 40,
    marginRight: spacing.md,
  },
  signInfo: {
    flex: 1,
  },
  signName: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.sm,
  },
  signCategory: {
    fontSize: fonts.sizes.xs,
    color: colors.primary.main,
    marginBottom: spacing.xs,
  },
  signDescription: {
    fontSize: fonts.sizes.sm,
    color: colors.gray[400],
  },
  arrowIcon: {
    fontSize: 32,
    color: colors.gray[500],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyStateFull: {
    width: '100%',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyText: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: fonts.sizes.base,
    color: colors.gray[400],
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
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    opacity: 0.8,
  },
  detailContent: {
    flex: 1,
  },
  detailMain: {
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: '#1A1F3A',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary.dark,
  },
  detailEmoji: {
    fontSize: 80,
    marginBottom: spacing.lg,
  },
  detailName: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.sm,
  },
  detailDescription: {
    fontSize: fonts.sizes.base,
    color: colors.gray[300],
    textAlign: 'center',
  },
  detailSection: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary.dark,
  },
  sectionTitle: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    color: '#FFFFFF',
    marginBottom: spacing.md,
  },
  howToBox: {
    backgroundColor: '#1A1F3A',
    padding: spacing.lg,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary.main,
  },
  howToText: {
    fontSize: fonts.sizes.base,
    color: '#FFFFFF',
    lineHeight: 24,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    backgroundColor: colors.primary.main,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  tagText: {
    fontSize: fonts.sizes.sm,
    color: colors.primary.contrast,
    fontWeight: fonts.weights.semibold,
  },
});
