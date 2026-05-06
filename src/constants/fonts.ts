/**
 * 수어링 디자인 시스템 - 타이포그래피
 * 접근성을 고려한 폰트 크기 및 스타일
 */

export const fonts = {
  // Font Families
  families: {
    primary: 'System', // System font for best performance
    secondary: 'System',
    monospace: 'monospace',
  },

  // Font Sizes (최소 16sp for accessibility)
  sizes: {
    xs: 12,
    sm: 14,
    base: 16, // 기본 크기
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },

  // Font Weights
  weights: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },

  // Line Heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  // Letter Spacing
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
  },
};

// Typography Styles (재사용 가능한 텍스트 스타일)
export const typography = {
  // Headings
  h1: {
    fontSize: fonts.sizes['4xl'],
    fontWeight: fonts.weights.bold,
    lineHeight: fonts.lineHeights.tight,
    letterSpacing: fonts.letterSpacing.tight,
  },
  h2: {
    fontSize: fonts.sizes['3xl'],
    fontWeight: fonts.weights.bold,
    lineHeight: fonts.lineHeights.tight,
    letterSpacing: fonts.letterSpacing.tight,
  },
  h3: {
    fontSize: fonts.sizes['2xl'],
    fontWeight: fonts.weights.semibold,
    lineHeight: fonts.lineHeights.normal,
  },
  h4: {
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.semibold,
    lineHeight: fonts.lineHeights.normal,
  },
  h5: {
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.medium,
    lineHeight: fonts.lineHeights.normal,
  },
  h6: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.medium,
    lineHeight: fonts.lineHeights.normal,
  },

  // Body Text
  body1: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.regular,
    lineHeight: fonts.lineHeights.normal,
  },
  body2: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.regular,
    lineHeight: fonts.lineHeights.normal,
  },

  // Captions & Labels
  caption: {
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.regular,
    lineHeight: fonts.lineHeights.normal,
  },
  label: {
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.medium,
    lineHeight: fonts.lineHeights.normal,
  },

  // Buttons
  button: {
    fontSize: fonts.sizes.base,
    fontWeight: fonts.weights.semibold,
    lineHeight: fonts.lineHeights.normal,
    letterSpacing: fonts.letterSpacing.wide,
    textTransform: 'uppercase' as const,
  },

  // 수어링 특화 스타일
  subtitle: {
    // 통화 중 자막
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.semibold,
    lineHeight: fonts.lineHeights.relaxed,
    letterSpacing: fonts.letterSpacing.wide,
  },
  callInfo: {
    // 통화 정보 (이름, 시간 등)
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    lineHeight: fonts.lineHeights.tight,
  },
};

export type Typography = typeof typography;
