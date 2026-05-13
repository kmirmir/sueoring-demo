# 수어링 (SueoRing)

**인간 통역사 없는 AI 수화 영상통화 서비스**

[![React Native](https://img.shields.io/badge/React%20Native-0.81-blue.svg)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Expo](https://img.shields.io/badge/Expo-54.0-black.svg)](https://expo.dev/)

## 📖 프로젝트 소개

수어링은 청각장애인과 청인이 인간 통역사 없이 AI 기술을 통해 실시간 영상통화로 소통할 수 있는 모바일 앱입니다.

### 핵심 기능
- 🤟 **수화 → 자막 변환**: MediaPipe + KSL 인식 AI
- 🗣️ **음성 → 수화 아바타**: STT + 3D 아바타 생성
- 📞 **1:1 실시간 영상통화**: WebRTC P2P 통신
- ⚡ **즉시 연결**: 대기 시간 없이 바로 통화
- 🔒 **보안**: E2E 암호화 및 개인정보 보호

## 🚀 시작하기

### 필수 요구사항

- Node.js 18 이상
- npm 또는 yarn
- Expo CLI
- iOS: Xcode (macOS 필요)
- Android: Android Studio

### 설치 방법

1. **저장소 클론**
```bash
git clone https://github.com/your-org/suearing.git
cd suearing/SueoRing
```

2. **의존성 설치**
```bash
npm install
```

3. **환경 변수 설정**
```bash
cp .env.example .env
# .env 파일을 열어 필요한 값을 입력하세요
```

4. **앱 실행**
```bash
# Expo 개발 서버 시작
npm start

# Android 에뮬레이터에서 실행
npm run android

# iOS 시뮬레이터에서 실행 (macOS만 가능)
npm run ios

# 웹 브라우저에서 실행 (자동으로 브라우저 열림)
npm run web:dev

# 또는 서버만 시작
npm run web
```

**💡 브라우저가 자동으로 열리지 않을 때:**
- `quick-open.html` 파일을 더블클릭하거나
- `npm run web:open` 명령을 실행하세요
- 자세한 내용은 [WEB_BROWSER_GUIDE.md](WEB_BROWSER_GUIDE.md)를 참조하세요

## 📁 프로젝트 구조

상세한 프로젝트 구조는 [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)를 참조하세요.

```
SueoRing/
├── src/
│   ├── screens/        # 화면 컴포넌트
│   ├── components/     # 재사용 컴포넌트
│   ├── navigation/     # 네비게이션 설정
│   ├── services/       # API, WebRTC, AI 서비스
│   ├── hooks/          # 커스텀 Hooks
│   ├── store/          # 상태 관리 (Zustand)
│   ├── types/          # TypeScript 타입
│   ├── constants/      # 상수 (색상, 폰트, 설정)
│   └── utils/          # 유틸리티 함수
├── assets/             # 정적 리소스
└── App.tsx            # 앱 진입점
```

## 🛠️ 개발 가이드

### 사용 가능한 스크립트

```bash
# 개발 서버 시작
npm start

# 웹 서버 시작 + 브라우저 자동 열기 (추천)
npm run web:dev

# 웹 서버만 시작
npm run web

# 실행 중인 웹 서버에 브라우저 열기
npm run web:open

# 코드 린트 검사
npm run lint

# 코드 린트 자동 수정
npm run lint:fix

# 코드 포맷팅
npm run format

# TypeScript 타입 체크
npm run type-check

# 테스트 실행 (Phase 2에서 추가 예정)
npm test

# 의존성 재설치
npm run clean
```

### 코딩 컨벤션

- **컴포넌트**: PascalCase (예: `HomeScreen.tsx`)
- **Hooks**: camelCase with 'use' prefix (예: `useAuth.ts`)
- **Types**: camelCase with '.types' suffix (예: `auth.types.ts`)
- **Imports**: 절대 경로 사용 (`@/components/Button`)

### Import 순서
```typescript
// 1. React 관련
import React, { useState } from 'react';

// 2. 외부 라이브러리
import { View, Text } from 'react-native';

// 3. 내부 모듈 (절대 경로)
import { Button } from '@/components';
import { useAuth } from '@/hooks';

// 4. 타입
import type { User } from '@/types';
```

## 🎨 디자인 시스템

### 색상 팔레트
- Primary: `#2563EB` (Blue 600)
- Secondary: `#7C3AED` (Purple 600)
- Success: `#10B981` (Green 500)
- Error: `#EF4444` (Red 500)

### 타이포그래피
- 최소 폰트 크기: 16sp (접근성 준수)
- 최소 터치 영역: 48×48dp (WCAG 2.1 AA)

자세한 내용은 [src/constants](src/constants/)를 참조하세요.

## 🔧 기술 스택

### Frontend
- **React Native** (Expo): 크로스 플랫폼 모바일 앱
- **TypeScript**: 타입 안정성
- **React Navigation**: 화면 네비게이션
- **Zustand**: 경량 상태 관리
- **React Query**: 서버 상태 관리

### Backend (계획)
- **Node.js + Express**: REST API
- **Supabase**: 데이터베이스 + 인증
- **Socket.IO**: WebRTC 시그널링
- **AWS**: 인프라 호스팅

### AI/ML
- **MediaPipe Hands**: 실시간 손 랜드마크 추출 (21 포인트)
- **패턴 기반 제스처 인식**: 6가지 기본 수어 (안녕하세요, 감사합니다, 네, 아니요, 괜찮아요, 도와주세요)
- **Web Speech API**: 브라우저 네이티브 TTS (한국어)
- **KSL 인식 모델** (계획): 한국수어 사전 통합
- **Clova Speech** (계획): 음성 인식 (STT)
- **EQ4ALL API** (계획): 수화 아바타 생성

### DevOps
- **Git**: 버전 관리
- **ESLint + Prettier**: 코드 품질
- **TypeScript**: 정적 타입 검사

## 📱 지원 플랫폼

- ✅ **Web** (Chrome, Edge, Safari) - 현재 개발 중
- 🔄 Android 12 이상 (Post-MVP)
- 🔄 iOS 15 이상 (Post-MVP)

**현재 웹 데모 버전이 실행 가능합니다!**
- 실시간 수어 인식 (카메라 필요)
- 자막 + TTS 음성 출력
- 큐 기반 순차 처리

## 🔐 보안

- E2E 암호화 (WebRTC DTLS-SRTP)
- 영상 데이터 서버 미저장
- AI 학습 데이터 명시적 동의 수집
- 개인정보처리방침 준수

## 🗺️ 로드맵

### MVP (0-6개월)
- [x] 프로젝트 초기 셋업
- [x] 기본 UI/UX 구현 (홈, 인증 플로우)
- [x] MediaPipe 수어 인식 데모 (6가지 제스처)
- [x] 실시간 자막 + TTS 음성 출력
- [x] 큐 기반 순차 처리 시스템
- [x] 긴급(119) 수어 예시 추가
- [ ] WebRTC 영상통화 구현
- [ ] 수어 제스처 확장 (20개 이상)
- [ ] 음성 → 수어 아바타 AI
- [ ] 베타 테스트
- [ ] 정식 출시

### Phase 2 (6-12개월)
- [ ] 수화 → 음성 출력 (TTS)
- [ ] 3자 이상 그룹 통화
- [ ] 통화 자막 저장/내보내기
- [ ] 웹 버전 출시

### Phase 3 (12개월~)
- [ ] 수화 학습 모드
- [ ] B2B API (기업/병원)
- [ ] 다국어 수어 지원

## 📄 라이선스

본 프로젝트는 MIT 라이선스를 따릅니다.

## 👥 팀

- PM/기획: TBD
- AI/ML 엔지니어: TBD
- 앱 개발자: TBD
- 백엔드 개발자: TBD
- UX 디자이너: TBD
- 수어 전문가 (자문): TBD

## 📞 문의

- 이메일: contact@suearing.io
- 웹사이트: https://suearing.io
- GitHub Issues: [이슈 등록](https://github.com/your-org/suearing/issues)

## 🙏 감사의 말

이 프로젝트는 청각장애인 커뮤니티의 소중한 피드백과 협력을 통해 개발되고 있습니다.

---

**Made with ❤️ for accessibility**
