/**
 * STT VAD (Voice Activity Detection) 공통 파라미터
 * STTTestScreen, BiDirectionalCallScreen 등 모든 메뉴에서 공유
 */

export const STT_VAD = {
  RMS_THRESHOLD:    0.025,  // 이 값 이하 → 침묵
  SILENCE_MS:       400,    // 침묵 지속 시간(ms) → 세그먼트 종료
  MIN_SEGMENT_MS:   300,    // 최소 세그먼트 길이(ms)
  MIN_VOICE_MS:     200,    // RMS가 이 시간 이상 연속 초과해야 발화 인정(ms)
} as const;
