FROM golang:latest AS builder
WORKDIR /workspace

COPY gen/ gen/
COPY services/api-gateway/ services/api-gateway/

WORKDIR /workspace/services/api-gateway
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server/main.go

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /out/server /server
EXPOSE 8080
CMD ["/server"]
