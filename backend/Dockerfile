# Stage 1: Build
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -o gateway ./cmd/gateway/main.go

# Stage 2: Runtime
FROM alpine:3.19

WORKDIR /app

# Install root SSL certificates for external API calls (Gemini/Supabase)
RUN apk --no-cache add ca-certificates

# Copy compiled binary
COPY --from=builder /app/gateway .

EXPOSE 8080

CMD ["./gateway"]
