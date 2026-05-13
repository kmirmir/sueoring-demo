/**
 * 브라우저 자동 열기 스크립트
 * Expo 웹 서버가 준비되면 자동으로 브라우저를 엽니다.
 */

const { exec } = require('child_process');
const http = require('http');

// 시도할 포트 목록
const PORTS = [8081, 8082, 19006, 19007];
const HOST = 'localhost';

// 서버가 준비될 때까지 대기 (최대 30초)
const MAX_RETRIES = 60;
const RETRY_INTERVAL = 500; // 0.5초

let retries = 0;

console.log('🔍 Expo 웹 서버를 찾는 중...');

function checkServer(port) {
  return new Promise((resolve) => {
    const options = {
      host: HOST,
      port: port,
      path: '/',
      method: 'GET',
      timeout: 1000
    };

    const req = http.request(options, (res) => {
      // 서버가 응답하면 성공
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function findRunningServer() {
  for (const port of PORTS) {
    const isRunning = await checkServer(port);
    if (isRunning) {
      return port;
    }
  }
  return null;
}

async function waitForServer() {
  const port = await findRunningServer();

  if (port) {
    console.log(`✅ Expo 웹 서버 발견: http://${HOST}:${port}`);
    openBrowser(port);
    return;
  }

  retries++;

  if (retries >= MAX_RETRIES) {
    console.error('❌ 타임아웃: Expo 웹 서버를 찾을 수 없습니다.');
    console.log('\n💡 수동으로 브라우저를 열어주세요:');
    PORTS.forEach(port => {
      console.log(`   http://${HOST}:${port}`);
    });
    process.exit(1);
  }

  // 진행 상황 표시
  if (retries % 4 === 0) {
    console.log(`⏳ 대기 중... (${retries}/${MAX_RETRIES})`);
  }

  setTimeout(waitForServer, RETRY_INTERVAL);
}

function openBrowser(port) {
  const url = `http://${HOST}:${port}`;

  // 운영체제별 브라우저 열기 명령
  let command;

  if (process.platform === 'win32') {
    // Windows
    command = `start ${url}`;
  } else if (process.platform === 'darwin') {
    // macOS
    command = `open ${url}`;
  } else {
    // Linux
    command = `xdg-open ${url} || sensible-browser ${url} || x-www-browser ${url}`;
  }

  console.log(`🌐 브라우저 실행 중: ${url}`);

  exec(command, (error) => {
    if (error) {
      console.error('⚠️ 브라우저를 자동으로 열 수 없습니다.');
      console.log(`💡 수동으로 열어주세요: ${url}`);
      return;
    }
    console.log('✅ 브라우저가 열렸습니다!');
  });
}

// 즉시 실행
waitForServer();
