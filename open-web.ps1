# 수어링 웹 앱 브라우저 열기 스크립트 (PowerShell)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   수어링 (SueoRing) Web App" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ports = @(8081, 8082, 19006, 19007)
$found = $false

foreach ($port in $ports) {
    $url = "http://localhost:$port"

    try {
        # 포트가 열려있는지 확인
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connection = $tcpClient.BeginConnect("localhost", $port, $null, $null)
        $wait = $connection.AsyncWaitHandle.WaitOne(100, $false)

        if ($wait -and $tcpClient.Connected) {
            Write-Host "✅ 서버 발견: $url" -ForegroundColor Green
            Start-Process $url
            $found = $true
            $tcpClient.Close()
            break
        }

        $tcpClient.Close()
    }
    catch {
        # 포트가 열려있지 않음
    }
}

if (-not $found) {
    Write-Host "⚠️ 실행 중인 서버를 찾을 수 없습니다." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "다음 명령으로 서버를 시작하세요:" -ForegroundColor Yellow
    Write-Host "  npm run web" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "또는 아래 주소를 직접 열어보세요:" -ForegroundColor Yellow
    foreach ($port in $ports) {
        Write-Host "  http://localhost:$port" -ForegroundColor Cyan
    }
    Write-Host ""

    # 모든 포트 시도
    Write-Host "모든 포트를 브라우저에서 열어볼까요? (실행 중인 서버가 있다면 열립니다)" -ForegroundColor Yellow
    foreach ($port in $ports) {
        Start-Process "http://localhost:$port"
    }
}

Write-Host ""
Write-Host "브라우저가 열렸습니다!" -ForegroundColor Green
Write-Host ""
