Write-Host "Cengsta Paradise -- proje iskeleti kuruluyor..." -ForegroundColor Cyan

$dirs = @(
    # Proto
    "proto/auth/v1","proto/chat/v1","proto/media/v1",
    "proto/call/v1","proto/notification/v1",

    # Shared
    "shared/pkg/logger","shared/pkg/tracer",
    "shared/pkg/middleware","shared/pkg/errors",

    # API Gateway
    "services/api-gateway/cmd/server",
    "services/api-gateway/internal/delivery/http",
    "services/api-gateway/internal/delivery/websocket",
    "services/api-gateway/internal/grpcclient",
    "services/api-gateway/config",

    # Auth Service
    "services/auth-svc/cmd/server",
    "services/auth-svc/internal/domain/entity",
    "services/auth-svc/internal/domain/repository",
    "services/auth-svc/internal/domain/usecase",
    "services/auth-svc/internal/usecase",
    "services/auth-svc/internal/repository/postgres",
    "services/auth-svc/internal/delivery/grpc",
    "services/auth-svc/internal/infrastructure/db",
    "services/auth-svc/internal/infrastructure/redis",
    "services/auth-svc/config",
    "services/auth-svc/migrations",

    # Chat Service
    "services/chat-svc/cmd/server",
    "services/chat-svc/internal/domain/entity",
    "services/chat-svc/internal/domain/repository",
    "services/chat-svc/internal/domain/usecase",
    "services/chat-svc/internal/usecase",
    "services/chat-svc/internal/repository/postgres",
    "services/chat-svc/internal/delivery/grpc",
    "services/chat-svc/internal/infrastructure/db",
    "services/chat-svc/internal/infrastructure/redis",
    "services/chat-svc/internal/infrastructure/rabbitmq",
    "services/chat-svc/config",
    "services/chat-svc/migrations",

    # Media Service
    "services/media-svc/cmd/server",
    "services/media-svc/internal/domain/entity",
    "services/media-svc/internal/domain/repository",
    "services/media-svc/internal/domain/usecase",
    "services/media-svc/internal/usecase",
    "services/media-svc/internal/repository/postgres",
    "services/media-svc/internal/delivery/grpc",
    "services/media-svc/internal/infrastructure/db",
    "services/media-svc/internal/infrastructure/minio",
    "services/media-svc/config",
    "services/media-svc/migrations",

    # Call Service
    "services/call-svc/cmd/server",
    "services/call-svc/internal/domain/entity",
    "services/call-svc/internal/domain/repository",
    "services/call-svc/internal/domain/usecase",
    "services/call-svc/internal/usecase",
    "services/call-svc/internal/repository/postgres",
    "services/call-svc/internal/delivery/grpc",
    "services/call-svc/internal/infrastructure/db",
    "services/call-svc/internal/infrastructure/webrtc",
    "services/call-svc/config",

    # Notification Service
    "services/notification-svc/cmd/server",
    "services/notification-svc/internal/domain/entity",
    "services/notification-svc/internal/domain/usecase",
    "services/notification-svc/internal/usecase",
    "services/notification-svc/internal/delivery/grpc",
    "services/notification-svc/internal/infrastructure/rabbitmq",
    "services/notification-svc/config",

    # Frontend — plain HTML/CSS/JS
    "frontend/css",
    "frontend/js",
    "frontend/pages",
    "frontend/assets/icons",
    "frontend/assets/sounds",

    # Kubernetes
    "k8s/base/deployments",
    "k8s/base/services",
    "k8s/base/configmaps",
    "k8s/overlays/development",
    "k8s/overlays/production",

    # Monitoring
    "monitoring/prometheus",
    "monitoring/grafana/dashboards",
    "monitoring/grafana/provisioning",
    "monitoring/jaeger",

    # Scripts & CI
    "scripts",
    ".github/workflows"
)

$files = @(
    # Root
    ".gitignore",
    ".env.example",
    "docker-compose.yml",
    "buf.yaml",
    "Makefile",

    # Proto
    "proto/auth/v1/auth.proto",
    "proto/chat/v1/chat.proto",
    "proto/media/v1/media.proto",
    "proto/call/v1/call.proto",
    "proto/notification/v1/notification.proto",

    # Shared
    "shared/pkg/logger/logger.go",
    "shared/pkg/tracer/tracer.go",
    "shared/pkg/middleware/auth.go",
    "shared/pkg/errors/errors.go",

    # API Gateway
    "services/api-gateway/cmd/server/main.go",
    "services/api-gateway/internal/delivery/http/handler.go",
    "services/api-gateway/internal/delivery/websocket/hub.go",
    "services/api-gateway/internal/grpcclient/client.go",
    "services/api-gateway/config/config.go",
    "services/api-gateway/Dockerfile",
    "services/api-gateway/go.mod",

    # Auth Service
    "services/auth-svc/cmd/server/main.go",
    "services/auth-svc/internal/domain/entity/user.go",
    "services/auth-svc/internal/domain/entity/device.go",
    "services/auth-svc/internal/domain/repository/user_repository.go",
    "services/auth-svc/internal/domain/usecase/auth_usecase.go",
    "services/auth-svc/internal/usecase/auth_usecase_impl.go",
    "services/auth-svc/internal/repository/postgres/user_repository_impl.go",
    "services/auth-svc/internal/delivery/grpc/auth_handler.go",
    "services/auth-svc/internal/infrastructure/db/postgres.go",
    "services/auth-svc/internal/infrastructure/redis/redis.go",
    "services/auth-svc/config/config.go",
    "services/auth-svc/Dockerfile",
    "services/auth-svc/go.mod",

    # Chat Service
    "services/chat-svc/cmd/server/main.go",
    "services/chat-svc/internal/domain/entity/message.go",
    "services/chat-svc/internal/domain/entity/conversation.go",
    "services/chat-svc/internal/domain/repository/message_repository.go",
    "services/chat-svc/internal/domain/usecase/chat_usecase.go",
    "services/chat-svc/internal/usecase/chat_usecase_impl.go",
    "services/chat-svc/internal/repository/postgres/message_repository_impl.go",
    "services/chat-svc/internal/delivery/grpc/chat_handler.go",
    "services/chat-svc/internal/infrastructure/db/postgres.go",
    "services/chat-svc/internal/infrastructure/redis/pubsub.go",
    "services/chat-svc/internal/infrastructure/rabbitmq/producer.go",
    "services/chat-svc/config/config.go",
    "services/chat-svc/Dockerfile",
    "services/chat-svc/go.mod",

    # Media Service
    "services/media-svc/cmd/server/main.go",
    "services/media-svc/internal/domain/entity/media.go",
    "services/media-svc/internal/domain/repository/media_repository.go",
    "services/media-svc/internal/domain/usecase/media_usecase.go",
    "services/media-svc/internal/usecase/media_usecase_impl.go",
    "services/media-svc/internal/repository/postgres/media_repository_impl.go",
    "services/media-svc/internal/delivery/grpc/media_handler.go",
    "services/media-svc/internal/infrastructure/db/postgres.go",
    "services/media-svc/internal/infrastructure/minio/minio.go",
    "services/media-svc/config/config.go",
    "services/media-svc/Dockerfile",
    "services/media-svc/go.mod",

    # Call Service
    "services/call-svc/cmd/server/main.go",
    "services/call-svc/internal/domain/entity/call.go",
    "services/call-svc/internal/domain/repository/call_repository.go",
    "services/call-svc/internal/domain/usecase/call_usecase.go",
    "services/call-svc/internal/usecase/call_usecase_impl.go",
    "services/call-svc/internal/repository/postgres/call_repository_impl.go",
    "services/call-svc/internal/delivery/grpc/call_handler.go",
    "services/call-svc/internal/infrastructure/db/postgres.go",
    "services/call-svc/internal/infrastructure/webrtc/signal.go",
    "services/call-svc/config/config.go",
    "services/call-svc/Dockerfile",
    "services/call-svc/go.mod",

    # Notification Service
    "services/notification-svc/cmd/server/main.go",
    "services/notification-svc/internal/domain/entity/notification.go",
    "services/notification-svc/internal/domain/usecase/notification_usecase.go",
    "services/notification-svc/internal/usecase/notification_usecase_impl.go",
    "services/notification-svc/internal/delivery/grpc/notification_handler.go",
    "services/notification-svc/internal/infrastructure/rabbitmq/consumer.go",
    "services/notification-svc/config/config.go",
    "services/notification-svc/Dockerfile",
    "services/notification-svc/go.mod",

    # Frontend — plain HTML/CSS/JS (no build tool, no framework)
    "frontend/index.html",
    "frontend/css/style.css",
    "frontend/css/theme.css",
    "frontend/css/components.css",
    "frontend/js/app.js",
    "frontend/js/api.js",
    "frontend/js/websocket.js",
    "frontend/js/router.js",
    "frontend/js/store.js",
    "frontend/js/crypto.js",
    "frontend/pages/login.html",
    "frontend/pages/chat.html",
    "frontend/pages/calls.html",
    "frontend/pages/servers.html",
    "frontend/pages/status.html",
    "frontend/manifest.json",
    "frontend/service-worker.js",

    # Kubernetes
    "k8s/base/deployments/api-gateway.yaml",
    "k8s/base/deployments/auth-svc.yaml",
    "k8s/base/deployments/chat-svc.yaml",
    "k8s/base/deployments/media-svc.yaml",
    "k8s/base/deployments/call-svc.yaml",
    "k8s/base/services/api-gateway.yaml",
    "k8s/base/services/auth-svc.yaml",
    "k8s/base/services/chat-svc.yaml",
    "k8s/base/configmaps/app-config.yaml",
    "k8s/base/ingress.yaml",
    "k8s/overlays/development/kustomization.yaml",
    "k8s/overlays/production/kustomization.yaml",

    # Monitoring
    "monitoring/prometheus/prometheus.yml",
    "monitoring/prometheus/alerts.yml",
    "monitoring/grafana/dashboards/cengsta.json",
    "monitoring/grafana/provisioning/datasources.yml",
    "monitoring/jaeger/jaeger.yml",

    # Scripts & CI
    "scripts/gen-proto.sh",
    "scripts/local-dev.sh",
    "scripts/migrate.sh",
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yml"
)

foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        New-Item -ItemType File -Force -Path $file | Out-Null
    }
}

Write-Host ""
Write-Host "Tamamlandi! Tum dosyalar olusturuldu." -ForegroundColor Green
Write-Host ""
Write-Host "Frontend: plain HTML + CSS + JS (framework yok, build tool yok)" -ForegroundColor Yellow
Write-Host "Backend:  Go stdlib + sadece grpc/protobuf/pgx" -ForegroundColor Yellow
Write-Host ""
Write-Host "Simdi VSCode Explorer'i yenile." -ForegroundColor Cyan