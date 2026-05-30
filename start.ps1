# Cengsta Paradise — tüm servisleri başlat

Write-Host "Cengsta Paradise başlatılıyor..." -ForegroundColor Cyan

# Docker (infrastructure)
Write-Host "Docker servisleri başlatılıyor..." -ForegroundColor Yellow
docker compose up -d

Start-Sleep -Seconds 2

# Auth svc
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\services\auth-svc'; go run cmd/server/main.go"

Start-Sleep -Seconds 1

# Chat svc  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\services\chat-svc'; go run cmd/server/main.go"

Start-Sleep -Seconds 1

# API Gateway
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\services\api-gateway'; go run cmd/server/main.go"

Start-Sleep -Seconds 1

# Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; go run server.go"

Write-Host ""
Write-Host "Tüm servisler başlatıldı!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan