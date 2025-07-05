# Stage 1: Build
FROM golang:1.24 AS builder

WORKDIR /app

COPY go.mod ./
RUN go mod tidy

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Stage 2: Minimal runtime
FROM alpine:latest

WORKDIR /app

# Install minimal libs if needed
RUN apk --no-cache add ca-certificates

# Copy built binary from builder stage
COPY --from=builder /app/main .

EXPOSE 8080

CMD ["./main"]