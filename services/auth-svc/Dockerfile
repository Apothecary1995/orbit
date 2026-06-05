FROM golang:1.23-alpine AS builder
WORKDIR /workspace

# Shared proto module
COPY gen/ gen/

# Service source
COPY services/auth-svc/ services/auth-svc/

WORKDIR /workspace/services/auth-svc
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server/main.go

# ── Runtime ──────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /out/server /server
EXPOSE 50051
CMD ["/server"]
