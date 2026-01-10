# Makefile for jules-go

.PHONY: all build-server build-cli test test-coverage lint clean install docker help

all: build-server build-cli

# Build the Go server binary
build-server:
	@echo "Building jules-go server..."
	@go build -o bin/jules-server ./cmd/jules-server

# Build the Go CLI binary
build-cli:
	@echo "Building jules-go CLI..."
	@go build -o bin/jules ./cmd/jules

# Run tests
test:
	@echo "Running tests..."
	@go test -v ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	@go test -coverprofile=coverage.out ./...

# Lint the code
lint:
	@echo "Linting code..."
	@golangci-lint run

# Clean up build artifacts
clean:
	@echo "Cleaning up..."
	@rm -rf bin/ coverage.out

# Install the binary
install: build
	@echo "Installing jules-go..."
	@cp bin/jules $(GOPATH)/bin/jules

# Build the Docker image
docker:
	@echo "Building Docker image..."
	@docker build -t jules-go .

# Display help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all              Build the binary (default)"
	@echo "  build            Build the Go binary"
	@echo "  test             Run tests"
	@echo "  test-coverage    Run tests with coverage"
	@echo "  lint             Lint the code"
	@echo "  clean            Clean up build artifacts"
	@echo "  install          Install the binary to GOPATH/bin"
	@echo "  docker           Build the Docker image"
