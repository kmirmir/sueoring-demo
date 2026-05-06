# 수어링(SueoRing) 프로젝트 구조

## 📁 폴더 구조 개요

```
SueoRing/
├── src/                          # 소스 코드 루트
│   ├── screens/                  # 화면 컴포넌트
│   │   ├── auth/                 # 인증 관련 화면
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── OTPScreen.tsx
│   │   │   └── UserTypeScreen.tsx
│   │   ├── home/                 # 홈 화면
│   │   │   └── HomeScreen.tsx
│   │   ├── call/                 # 통화 화면
│   │   │   ├── CallScreen.tsx
│   │   │   ├── IncomingCallScreen.tsx
│   │   │   └── OutgoingCallScreen.tsx
│   │   ├── contacts/             # 연락처 화면
│   │   │   ├── ContactListScreen.tsx
│   │   │   └── ContactDetailScreen.tsx
│   │   └── settings/             # 설정 화면
│   │       └── SettingsScreen.tsx
│   │
│   ├── components/               # 재사용 가능한 컴포넌트
│   │   ├── auth/                 # 인증 컴포넌트
│   │   ├── call/                 # 통화 관련 컴포넌트
│   │   │   ├── SignLanguageOverlay.tsx
│   │   │   ├── SubtitleOverlay.tsx
│   │   │   └── AvatarOverlay.tsx
│   │   ├── contacts/             # 연락처 컴포넌트
│   │   └── common/               # 공통 컴포넌트
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       └── LoadingSpinner.tsx
│   │
│   ├── navigation/               # 네비게이션 설정
│   │   ├── AppNavigator.tsx      # 메인 네비게이터
│   │   ├── AuthNavigator.tsx     # 인증 플로우
│   │   └── MainNavigator.tsx     # 메인 앱 플로우
│   │
│   ├── services/                 # 외부 서비스 연동
│   │   ├── api/                  # REST API 클라이언트
│   │   │   ├── client.ts
│   │   │   ├── auth.api.ts
│   │   │   ├── user.api.ts
│   │   │   ├── contact.api.ts
│   │   │   └── call.api.ts
│   │   ├── webrtc/               # WebRTC 통신
│   │   │   ├── WebRTCService.ts
│   │   │   ├── SignalingService.ts
│   │   │   └── types.ts
│   │   ├── ai/                   # AI 처리 서비스
│   │   │   ├── SignLanguageRecognition.ts
│   │   │   ├── AvatarGeneration.ts
│   │   │   └── STTService.ts
│   │   └── storage/              # 로컬 스토리지
│   │       └── SecureStorage.ts
│   │
│   ├── hooks/                    # 커스텀 React Hooks
│   │   ├── useAuth.ts
│   │   ├── useCall.ts
│   │   ├── useContacts.ts
│   │   ├── useWebRTC.ts
│   │   └── useSignLanguage.ts
│   │
│   ├── store/                    # 상태 관리 (Zustand)
│   │   ├── authStore.ts
│   │   ├── callStore.ts
│   │   ├── contactStore.ts
│   │   └── settingsStore.ts
│   │
│   ├── types/                    # TypeScript 타입 정의
│   │   ├── auth.types.ts
│   │   ├── user.types.ts
│   │   ├── call.types.ts
│   │   ├── contact.types.ts
│   │   └── api.types.ts
│   │
│   ├── constants/                # 상수 정의
│   │   ├── colors.ts
│   │   ├── fonts.ts
│   │   ├── config.ts
│   │   └── endpoints.ts
│   │
│   ├── utils/                    # 유틸리티 함수
│   │   ├── validation.ts
│   │   ├── formatters.ts
│   │   └── helpers.ts
│   │
│   └── assets/                   # 정적 리소스
│       ├── images/
│       ├── icons/
│       └── fonts/
│
├── App.tsx                       # 앱 진입점
├── app.json                      # Expo 설정
├── tsconfig.json                 # TypeScript 설정
├── package.json                  # 의존성 관리
└── .env                          # 환경 변수 (gitignore)
```

## 📝 주요 디렉토리 설명

### `src/screens/`
각 화면을 나타내는 컴포넌트들입니다. React Navigation을 통해 관리됩니다.

- **auth/**: 로그인, OTP 인증, 사용자 유형 선택
- **home/**: 메인 홈 화면 (최근 통화, 즐겨찾기)
- **call/**: 통화 중 화면, 수신/발신 화면
- **contacts/**: 연락처 목록 및 상세 화면
- **settings/**: 설정 화면 (프로필, AI 감도, 테마 등)

### `src/components/`
재사용 가능한 UI 컴포넌트들입니다.

- **call/**: 수화 오버레이, 자막, 아바타 컴포넌트
- **common/**: 버튼, 인풋 등 공통 UI 요소
- **auth/**, **contacts/**: 각 도메인별 특화 컴포넌트

### `src/services/`
외부 시스템과의 통신 로직을 담당합니다.

- **api/**: REST API 호출 (Supabase/백엔드 서버)
- **webrtc/**: WebRTC P2P 통신 및 시그널링
- **ai/**: 수화 인식, 아바타 생성, STT 처리
- **storage/**: 로컬 저장소 (토큰, 설정 등)

### `src/hooks/`
비즈니스 로직을 재사용 가능한 Hook으로 분리합니다.

- `useAuth`: 인증 상태 관리
- `useCall`: 통화 로직
- `useWebRTC`: WebRTC 연결 관리
- `useSignLanguage`: 수화 인식 처리

### `src/store/`
전역 상태 관리 (Zustand 사용)

- `authStore`: 사용자 인증 정보
- `callStore`: 현재 통화 상태
- `contactStore`: 연락처 목록
- `settingsStore`: 앱 설정 (테마, AI 감도 등)

### `src/types/`
TypeScript 타입 정의로 타입 안정성을 보장합니다.

### `src/constants/`
앱 전역에서 사용하는 상수 값들입니다.

- `colors.ts`: 디자인 시스템 색상 팔레트
- `config.ts`: API URL, WebRTC 설정 등
- `endpoints.ts`: API 엔드포인트 경로

## 🎯 코딩 컨벤션

### 파일 명명 규칙
- **컴포넌트**: PascalCase (예: `HomeScreen.tsx`, `Button.tsx`)
- **Hooks**: camelCase with 'use' prefix (예: `useAuth.ts`)
- **Utils/Services**: camelCase (예: `validation.ts`, `webrtcService.ts`)
- **Types**: camelCase with '.types' suffix (예: `auth.types.ts`)
- **Constants**: camelCase (예: `colors.ts`, `config.ts`)

### 폴더 명명 규칙
- 소문자 사용
- 복수형 사용 (screens, components, hooks)

### Import 순서
1. React 관련
2. 외부 라이브러리
3. 내부 모듈 (절대 경로)
4. 상대 경로
5. 타입 import

```typescript
// 예시
import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Button } from '@/components/common';
import { useAuth } from '@/hooks';
import { colors } from '@/constants';

import type { AuthState } from '@/types/auth.types';
```

## 🚀 다음 단계

1. 핵심 라이브러리 설치
2. TypeScript 및 ESLint 설정
3. 환경 변수 구성
4. 네비게이션 구조 구현
5. 디자인 시스템 (색상, 폰트) 구성
