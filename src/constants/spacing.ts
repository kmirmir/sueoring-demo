/**
 * 수어링 디자인 시스템 - 간격 및 레이아웃
 */

// Spacing (8pt grid system)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 96,
};

// Border Radius
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

// Shadows (Elevation)
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Layout Dimensions
export const layout = {
  // 최소 터치 영역 (WCAG 2.1 AA)
  minTouchTarget: 48,
  // 앱 패딩
  screenPadding: spacing.md,
  // 컴포넌트 간격
  componentSpacing: spacing.lg,
  // 아이콘 크기
  iconSizes: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 48,
  },
  // 버튼 높이
  buttonHeights: {
    sm: 36,
    md: 48,
    lg: 56,
  },
  // 인풋 높이
  inputHeight: 48,
  // 헤더 높이
  headerHeight: 56,
  // 탭 바 높이
  tabBarHeight: 60,
};

// Breakpoints (반응형 디자인, Post-MVP)
export const breakpoints = {
  xs: 0,
  sm: 375,
  md: 768,
  lg: 1024,
  xl: 1280,
};

// Z-Index
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600,
};
