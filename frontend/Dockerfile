FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY frontend/server.go .
RUN go mod init orbit-frontend && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server server.go

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
# Static dosyalar
COPY frontend/ .
# Go binary
COPY --from=builder /out/server /app/server
EXPOSE 5173
CMD ["/app/server"]
