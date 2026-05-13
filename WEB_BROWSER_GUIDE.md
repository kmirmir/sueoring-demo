# 🌐 웹 브라우저 열기 가이드

수어링(SueoRing) 웹 앱을 브라우저에서 실행하는 방법입니다.

## 🚀 방법 1: 자동 브라우저 열기 (추천)

### Windows 사용자
```bash
# 배치 파일 더블클릭
open-web.bat
```

또는 터미널에서:
```bash
npm run web:dev
```

### Mac/Linux 사용자
```bash
npm run web:dev
```

## 📝 방법 2: 수동으로 열기

1. **웹 서버 시작**
   ```bash
   npm run web
   ```

2. **서버가 시작되면 아래 주소 중 하나를 브라우저에서 열기**
   - http://localhost:8081 (기본 포트)
   - http://localhost:8082 (대체 포트)
   - http://localhost:19006 (Expo 기본 포트)

3. **터미널 출력 확인**
   ```
   Metro waiting on exp://192.168.x.x:8081
   ```
   위와 같은 메시지에서 포트 번호를 확인하세요.

## 🔧 방법 3: 헬퍼 스크립트 사용

서버가 이미 실행 중일 때:
```bash
npm run web:open
```

이 명령은 실행 중인 서버를 자동으로 찾아 브라우저를 엽니다.

## ⚠️ 문제 해결

### 브라우저가 열리지 않을 때

1. **포트 충돌 확인**
   ```bash
   # Windows
   netstat -ano | findstr "8081"

   # Mac/Linux
   lsof -i :8081
   ```

2. **다른 포트로 시도**
   - http://localhost:8082
   - http://localhost:19006
   - http://localhost:19007

3. **서버 재시작**
   ```bash
   # Ctrl+C로 중지 후
   npm run web
   ```

4. **캐시 정리**
   ```bash
   # Expo 캐시 정리
   npx expo start --clear
   ```

### "Port 8081 is being used" 에러

다른 포트를 사용하도록 설정:
```bash
# 환境変数 설정 후 실행
set PORT=8082 && npm run web
```

또는 기존 프로세스 종료:
```bash
# Windows
netstat -ano | findstr "8081"
taskkill /PID [PID번호] /F

# Mac/Linux
lsof -i :8081
kill -9 [PID번호]
```

## 💡 팁

### 브라우저 개발자 도구 열기
- **Chrome/Edge**: `F12` 또는 `Ctrl+Shift+I`
- **Firefox**: `F12` 또는 `Ctrl+Shift+K`
- **Safari**: `Cmd+Option+I`

### 모바일 뷰 테스트
개발자 도구에서 `Ctrl+Shift+M` (또는 `Cmd+Shift+M`)을 눌러 모바일 기기 에뮬레이션

### 네트워크 디버깅
개발자 도구 → Network 탭에서 API 호출 모니터링

## 📱 QR 코드로 모바일 접속

1. `npm run web` 실행
2. 터미널에 표시되는 QR 코드를 스캔
3. 또는 표시된 URL을 모바일 브라우저에 입력

## 🔗 유용한 링크

- Expo 웹 문서: https://docs.expo.dev/workflow/web/
- Metro Bundler: https://facebook.github.io/metro/
- 수어링 GitHub: (프로젝트 링크)

---

**도움이 필요하신가요?**
이슈가 지속되면 GitHub Issues에 문의해주세요.
