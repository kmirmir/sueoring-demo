/**
 * 수어링 디자인 시스템 - 색상 팔레트
 * WCAG 2.1 AA 접근성 기준 준수
 */

export const colors = {
  // Primary Colors
  primary: {
    main: '#2563EB', // Blue 600
    light: '#60A5FA', // Blue 400
    dark: '#1E40AF', // Blue 800
    contrast: '#FFFFFF',
  },

  // Secondary Colors
  secondary: {
    main: '#7C3AED', // Purple 600
    light: '#A78BFA', // Purple 400
    dark: '#5B21B6', // Purple 800
    contrast: '#FFFFFF',
  },

  // Status Colors
  success: {
    main: '#10B981', // Green 500
    light: '#6EE7B7', // Green 300
    dark: '#047857', // Green 700
    background: '#D1FAE5', // Green 100
  },

  error: {
    main: '#EF4444', // Red 500
    light: '#FCA5A5', // Red 300
    dark: '#B91C1C', // Red 700
    background: '#FEE2E2', // Red 100
  },

  warning: {
    main: '#F59E0B', // Amber 500
    light: '#FCD34D', // Amber 300
    dark: '#B45309', // Amber 700
    background: '#FEF3C7', // Amber 100
  },

  info: {
    main: '#3B82F6', // Blue 500
    light: '#93C5FD', // Blue 300
    dark: '#1E40AF', // Blue 800
    background: '#DBEAFE', // Blue 100
  },

  // Grayscale
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Background Colors
  background: {
    default: '#FFFFFF',
    paper: '#F9FAFB',
    elevated: '#FFFFFF',
    dark: '#111827',
  },

  // Text Colors
  text: {
    primary: '#111827', // Gray 900
    secondary: '#6B7280', // Gray 500
    disabled: '#9CA3AF', // Gray 400
    inverse: '#FFFFFF',
  },

  // Border Colors
  border: {
    default: '#E5E7EB', // Gray 200
    dark: '#D1D5DB', // Gray 300
    light: '#F3F4F6', // Gray 100
  },

  // Overlay
  overlay: {
    light: 'rgba(0, 0, 0, 0.1)',
    medium: 'rgba(0, 0, 0, 0.5)',
    dark: 'rgba(0, 0, 0, 0.8)',
  },

  // 수어링 특화 색상
  suearing: {
    // 수화 오버레이
    signOverlay: 'rgba(37, 99, 235, 0.1)', // Primary with low opacity
    // 자막 배경
    subtitleBackground: 'rgba(0, 0, 0, 0.7)',
    // 아바타 배경
    avatarBackground: 'rgba(255, 255, 255, 0.95)',
    // 통화 중 강조 색상
    callActive: '#10B981', // Green
    callIncoming: '#F59E0B', // Amber
    callEnded: '#EF4444', // Red
  },

  // 고대비 모드 (접근성)
  highContrast: {
    background: '#000000',
    foreground: '#FFFFFF',
    primary: '#00D9FF',
    secondary: '#FFD900',
    error: '#FF4444',
    success: '#00FF00',
  },
};

// 테마 타입 정의
export type ColorPalette = typeof colors;

// 다크 모드 색상 (Post-MVP)
export const darkColors: ColorPalette = {
  ...colors,
  background: {
    default: '#111827',
    paper: '#1F2937',
    elevated: '#374151',
    dark: '#000000',
  },
  text: {
    primary: '#F9FAFB',
    secondary: '#D1D5DB',
    disabled: '#6B7280',
    inverse: '#111827',
  },
  border: {
    default: '#374151',
    dark: '#4B5563',
    light: '#1F2937',
  },
};
