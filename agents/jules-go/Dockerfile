# Dockerfile for jules-go

# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum to download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the Go binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/jules ./cmd/jules

# Final stage
FROM gcr.io/distroless/base

WORKDIR /

# Copy the config file and the binary from the builder stage
COPY --from=builder /app/config.yaml /config.yaml
COPY --from=builder /app/jules /jules

EXPOSE 8080

ENTRYPOINT ["/jules"]
