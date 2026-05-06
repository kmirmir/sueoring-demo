/**
 * 앱 설정 상수
 * 환경 변수와 기본 설정값을 관리합니다.
 */

// API 설정
export const API_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  TIMEOUT: 30000, // 30초
};

// Supabase 설정
export const SUPABASE_CONFIG = {
  URL: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
};

// WebRTC 설정
export const WEBRTC_CONFIG = {
  ICE_SERVERS: [
    {
      urls: process.env.EXPO_PUBLIC_STUN_SERVER_URL || 'stun:stun.l.google.com:19302',
    },
    {
      urls: process.env.EXPO_PUBLIC_TURN_SERVER_URL || 'turn:turn.suearing.io:3478',
      username: process.env.EXPO_PUBLIC_TURN_USERNAME || 'suearing',
      credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL || '',
    },
  ],
  VIDEO_CONSTRAINTS: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
  AUDIO_CONSTRAINTS: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

// 시그널링 서버 설정
export const SIGNALING_CONFIG = {
  URL: process.env.EXPO_PUBLIC_SIGNALING_SERVER_URL || 'http://localhost:3001',
  RECONNECTION_DELAY: 1000,
  MAX_RECONNECTION_ATTEMPTS: 5,
};

// AI 서비스 설정
export const AI_CONFIG = {
  // 수화 인식 설정
  SIGN_LANGUAGE: {
    FRAME_RATE: 30,
    MIN_CONFIDENCE: 0.7,
    RECOGNITION_DELAY: 500, // ms
  },
  // STT 설정
  STT: {
    LANGUAGE: 'ko-KR',
    SAMPLE_RATE: 16000,
  },
  // 아바타 설정
  AVATAR: {
    ANIMATION_SPEED: 1.0,
    DEFAULT_SIZE: { width: 200, height: 300 },
  },
};

// 앱 설정
export const APP_CONFIG = {
  NAME: '수어링 (SueoRing)',
  VERSION: '1.0.0',
  BUILD_NUMBER: 1,
  // 접근성 설정
  ACCESSIBILITY: {
    MIN_TOUCH_TARGET_SIZE: 48, // dp
    MIN_FONT_SIZE: 16, // sp
    HIGH_CONTRAST_MODE: false,
    VIBRATION_ENABLED: true,
  },
  // 저장소 키
  STORAGE_KEYS: {
    ACCESS_TOKEN: '@suearing:accessToken',
    REFRESH_TOKEN: '@suearing:refreshToken',
    USER_TYPE: '@suearing:userType',
    USER_PROFILE: '@suearing:userProfile',
    SETTINGS: '@suearing:settings',
  },
};

// 개발 모드 설정
export const IS_DEV = __DEV__;
export const IS_PROD = !__DEV__;

// 로그 레벨
export const LOG_LEVEL = IS_DEV ? 'debug' : 'error';
