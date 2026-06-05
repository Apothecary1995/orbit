# Orbit — Geliştirme ortamı başlatıcı
# Kullanım:
#   .\start.ps1          → Go kaynak kodundan çalıştır (hot-reload)
#   .\start.ps1 -Docker  → Docker image'larıyla çalıştır (prod'a yakın)

param(
    [switch]$Docker
)

$Root = $PSScriptRoot

Write-Host "Orbit baslatiliyor..." -ForegroundColor Cyan

if ($Docker) {
    # ── Docker modu — tüm stack container olarak ──────────
    Write-Host "Docker image'lari build ediliyor..." -ForegroundColor Yellow
    docker compose build --parallel
    if ($LASTEXITCODE -ne 0) { Write-Host "Build basarisiz!" -ForegroundColor Red; exit 1 }

    Write-Host "Servisler baslatiliyor..." -ForegroundColor Yellow
    docker compose up -d

    Write-Host ""
    Write-Host "Orbit calisiyor!" -ForegroundColor Green
    Write-Host "  Uygulama : http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  API      : http://localhost:8080" -ForegroundColor Cyan
    Write-Host "  Grafana  : http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  MinIO    : http://localhost:9001" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Durdurmak icin: docker compose down" -ForegroundColor DarkGray
} else {
    # ── Go kaynak modu — her servis ayrı terminal ─────────
    Write-Host "Altyapi baslatiliyor (Docker)..." -ForegroundColor Yellow
    docker compose up -d postgres redis rabbitmq minio minio-init jaeger prometheus grafana
    if ($LASTEXITCODE -ne 0) { Write-Host "Altyapi baslamadiSleep 3..." -ForegroundColor Red }

    Start-Sleep -Seconds 3

    Write-Host "Uygulama servisleri baslatiliyor..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\services\auth-svc'; go run cmd/server/main.go"
    Start-Sleep -Seconds 1
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\services\chat-svc'; go run cmd/server/main.go"
    Start-Sleep -Seconds 1
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\services\api-gateway'; go run cmd/server/main.go"
    Start-Sleep -Seconds 1
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; go run server.go"

    Write-Host ""
    Write-Host "Orbit calisiyor!" -ForegroundColor Green
    Write-Host "  Frontend : http://localhost:5173" -ForegroundColor Cyan
    Write-Host "  API      : http://localhost:8080" -ForegroundColor Cyan
    Write-Host "  Grafana  : http://localhost:3000" -ForegroundColor Cyan
}
