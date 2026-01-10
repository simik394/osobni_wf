# Stage 1: Build the Go binary
FROM golang:1.24 as builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./
# Download all dependencies. Dependencies will be cached if the go.mod and go.sum files are not changed
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app
RUN CGO_ENABLED=0 GOOS=linux go build -o /jules .

# Stage 2: Create the final image
FROM gcr.io/distroless/base

WORKDIR /

# Copy the config file and the binary from the builder stage
COPY --from=builder /app/config.yaml /config.yaml
COPY --from=builder /jules /jules

EXPOSE 8080

ENTRYPOINT ["/jules"]
