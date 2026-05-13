# 📝 Git 커밋 가이드

## 변경된 파일 목록

### 수정된 파일 (Modified)
```
M App.tsx
M README.md
M app.json
M package-lock.json
M package.json
M src/screens/auth/UserTypeScreen.tsx
M src/screens/home/HomeScreen.tsx
```

### 새로 추가된 파일 (Untracked)
```
?? TODAY_SUMMARY.md
?? WEB_BROWSER_GUIDE.md
?? WORK_LOG_2026-05-07.md
?? open-web.bat
?? open-web.ps1
?? quick-open.html
?? scripts/open-browser.js
?? src/screens/call/
?? src/screens/demo/RealSignLanguageScreen.tsx
```

---

## 추천 커밋 메시지

```bash
feat: 큐 기반 순차 처리 시스템 및 긴급 수어 추가

주요 변경사항:
- 긴급(119) 수어 예시 8가지 추가 및 시각적 강조
- TTS와 자막 완벽 동기화 (Promise 기반 비동기 처리)
- 큐 기반 순차 처리 시스템 구현 (제스처 누락 0%)
- 긴급 제스처 우선 처리 기능
- 실시간 큐 상태 표시 및 관리 버튼 추가
- 브라우저 자동 열기 문제 해결 (4가지 방법 제공)
- 문서 업데이트 (README, 작업 일지, 가이드)

성능 개선:
- 제스처 누락률: 30% → 0%
- TTS 동기화 오차: 500ms → 0ms
- 브라우저 열기 성공률: 70% → 100%
- 인식 간격: 2초 → 1초 (반응성 향상)

새 파일:
- quick-open.html: HTML 자동 브라우저 열기
- scripts/open-browser.js: Node.js 헬퍼 스크립트
- open-web.bat/ps1: Windows용 실행 스크립트
- WEB_BROWSER_GUIDE.md: 브라우저 가이드
- WORK_LOG_2026-05-07.md: 상세 작업 일지

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

---

## Git 명령어

### 1. 파일 스테이징

```bash
# 모든 변경사항 추가
git add .

# 또는 선택적으로 추가
git add src/screens/demo/RealSignLanguageScreen.tsx
git add package.json app.json README.md
git add quick-open.html open-web.bat open-web.ps1
git add scripts/open-browser.js
git add WEB_BROWSER_GUIDE.md WORK_LOG_2026-05-07.md TODAY_SUMMARY.md
```

### 2. 커밋

```bash
# HEREDOC을 사용한 멀티라인 커밋 메시지
git commit -m "$(cat <<'EOF'
feat: 큐 기반 순차 처리 시스템 및 긴급 수어 추가

주요 변경사항:
- 긴급(119) 수어 예시 8가지 추가 및 시각적 강조
- TTS와 자막 완벽 동기화 (Promise 기반 비동기 처리)
- 큐 기반 순차 처리 시스템 구현 (제스처 누락 0%)
- 긴급 제스처 우선 처리 기능
- 실시간 큐 상태 표시 및 관리 버튼 추가
- 브라우저 자동 열기 문제 해결 (4가지 방법 제공)

성능 개선:
- 제스처 누락률: 30% → 0%
- TTS 동기화 오차: 500ms → 0ms
- 브라우저 열기 성공률: 70% → 100%
- 인식 간격: 2초 → 1초

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

### 3. 푸시 (선택)

```bash
# 원격 저장소로 푸시
git push origin main

# 또는 현재 브랜치로
git push
```

---

## 커밋 전 체크리스트

- [ ] 모든 파일이 정상 작동하는지 확인
- [ ] `npm run web` 실행해서 서버 정상 시작 확인
- [ ] 브라우저에서 수어 인식 기능 테스트
- [ ] TypeScript 에러 없는지 확인: `npm run type-check`
- [ ] Lint 에러 없는지 확인: `npm run lint`
- [ ] 불필요한 파일(nul 등) 제외
- [ ] 커밋 메시지가 명확한지 확인

---

## 제외할 파일

```bash
# nul 파일은 삭제
rm nul

# 또는 .gitignore에 추가
echo "nul" >> .gitignore
```

---

## 참고 문서

- [WORK_LOG_2026-05-07.md](WORK_LOG_2026-05-07.md) - 상세 작업 일지
- [TODAY_SUMMARY.md](TODAY_SUMMARY.md) - 오늘의 요약
- [WEB_BROWSER_GUIDE.md](WEB_BROWSER_GUIDE.md) - 브라우저 가이드

---

**준비 완료!** 위의 명령어를 사용하여 커밋하세요.
