# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cengsta Paradise is a Discord/WhatsApp-style messaging platform built to learn microservices and distributed systems. Backend is Go microservices communicating over gRPC; frontend is vanilla JS/HTML/CSS with no build tools.

## Running the Stack

**Start everything (PowerShell):**
```powershell
.\start.ps1
```
This runs `docker compose up -d` (infra), then opens separate terminals for each Go service.

**Start infra only:**
```powershell
docker compose up -d
```

**Run a single service:**
```powershell
cd services/auth-svc; go run cmd/server/main.go
cd services/chat-svc; go run cmd/server/main.go
cd services/api-gateway; go run cmd/server/main.go
cd frontend; go run server.go
```

**Regenerate protobuf code** (requires `buf` CLI):
```bash
buf generate
```
Generated output goes to `gen/` from definitions in `proto/`.

**Apply database migrations** (manual — no migration runner):
```bash
psql -h localhost -U cengsta -d cengsta_paradise -f services/auth-svc/migrations/001_init.sql
psql -h localhost -U cengsta -d cengsta_paradise -f services/chat-svc/migrations/001_init.sql
```

**Test a service:**
```powershell
cd services/auth-svc; go test ./...
```

## Service Ports

| Service | Protocol | Port |
|---|---|---|
| api-gateway | HTTP + WebSocket | :8080 |
| auth-svc | gRPC | :50051 |
| chat-svc | gRPC | :50052 |
| media-svc | gRPC | :50053 |
| call-svc | gRPC | :50054 |
| notification-svc | gRPC | :50055 |
| Frontend | HTTP | :5173 |
| PostgreSQL | TCP | :5432 |
| Redis | TCP | :6379 |
| RabbitMQ | AMQP | :5672 |
| MinIO | S3 API | :9000 |
| Jaeger UI | HTTP | :16686 |
| Grafana | HTTP | :3000 |

Default credentials (local): `cengsta` / `secret` for PostgreSQL, Redis, RabbitMQ. MinIO: `cengsta` / `secret123`. Grafana: `admin` / `admin`.

## Architecture

### Request Flow

```
Browser (HTTP/WS)
  └─→ api-gateway (:8080)
        ├─→ gRPC → auth-svc (:50051)
        ├─→ gRPC → chat-svc (:50052)
        └─→ WebSocket Hub → connected clients

chat-svc
  ├─→ PostgreSQL (persistent storage)
  ├─→ Redis Pub/Sub (real-time fan-out to api-gateway)
  └─→ RabbitMQ (async notifications)

media-svc
  ├─→ PostgreSQL (file metadata)
  └─→ MinIO (blob storage)
```

The api-gateway subscribes to Redis channels published by chat-svc and broadcasts messages to connected WebSocket clients. The frontend never calls gRPC directly — all communication goes through the HTTP REST API on :8080.

### Each Service's Internal Layout

All Go services follow the same clean architecture layers:

```
services/<name>/
  cmd/server/main.go          # entrypoint: wires dependencies, starts server
  config/                     # env var loading
  internal/
    domain/
      entity/                 # pure Go structs (no framework deps)
      repository/             # repository interfaces
      usecase/                # usecase interfaces
    usecase/                  # business logic implementations
    delivery/
      grpc/                   # gRPC handlers (implement generated pb interfaces)
      http/                   # HTTP handlers (api-gateway only)
      websocket/              # WebSocket hub (api-gateway only)
    repository/
      postgres/               # pgx implementations of repository interfaces
    infrastructure/
      db/                     # connection pool setup
      redis/                  # Redis client setup
  migrations/                 # SQL files (applied manually)
```

Dependency direction: `delivery → usecase → domain ← repository`. The domain layer has zero external imports.

### Proto / Code Generation

- Source of truth: `proto/<service>/v1/<service>.proto`
- Generated Go stubs: `gen/<service>/v1/` (committed to repo)
- Config: `buf.yaml` (lint rules) + `buf.gen.yaml` (generates `go` + `grpc/go` plugins into `gen/`)
- Each service imports generated types via the module path `github.com/Apothecary1995/cengsta-paradise/gen/...`

Each service has its own `go.mod`. The `gen/` directory is a shared module imported by all services.

### Frontend

Located in `frontend/`. Pure vanilla JS — no npm, no bundler. Key files:
- `js/app.js` — SPA initialization
- `js/api.js` — HTTP client wrapping fetch calls to api-gateway
- `js/websocket.js` — WebSocket client (connects to `ws://localhost:8080/ws`)
- `js/router.js` — client-side routing
- `js/store.js` — in-memory state management
- `server.go` — tiny Go HTTP file server that serves the static files

### Database Schema

Auth tables (PostgreSQL): `users`, `devices`, `sessions` — IDs are TEXT (UUID strings).
Chat tables: `conversations`, `conversation_members`, `messages`, `message_reactions`.
No ORM — raw SQL via `pgx/v5`.

## Infrastructure (docker-compose.yml)

Spins up: PostgreSQL 16, Redis 7, RabbitMQ 3.13 (management UI on :15672), MinIO, Jaeger (OTLP gRPC on :4317), Prometheus (:9090), Grafana (:3000).

Monitoring config lives in `monitoring/` — Prometheus scrape config and Grafana provisioned datasources/dashboards.

Kubernetes manifests (not used in local dev) live in `k8s/` using Kustomize with `base/` and `overlays/dev` + `overlays/prod`.
