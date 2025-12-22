# Vault Librarian: Implementations

This directory contains three different implementations of the "Vault Librarian" system, designed to parse and index the Obsidian vault into FalkorDB.

**[[BENCHMARKS|See Full Benchmark Report]]**

## Directory Structure

*   **`implementations/go/`**: The primary, production-grade daemon.
    *   **Features**: `fsnotify` file watching, robust configuration, standardized CLI.
    *   **Status**: **RECOMMENDED**. Production Ready.
    *   **Performance**:
        *   **Dump Mode**: ~4,000 files in **0.42s** (Parallel).
        *   **Direct Sync**: ~3.0s (Parallel with Connection Pool).

*   **`implementations/julia/`**: A high-performance experimental implementation.
    *   **Features**: Parallel regex parsing, raw TCP/RESP DB sync.
    *   **Status**: Benchmark / Analysis Tool.
    *   **Performance**:
        *   **Dump Mode**: ~4,000 files in **0.35s** (Parallel).
        *   **Direct Sync**: ~14s (Sequential Socket).
    *   *Note*: An attempt to use `Redis.jl` for parallel sync failed due to driver issues (see `librarian_lib.jl`).

*   **`implementations/python/`**: The original prototype scripts.
    *   **Features**: Tree-sitter parsing (more accurate but slower).
    *   **Status**: Legacy / Reference.

## Usage

### Recommended: Bulk Load (Go)
This is the fastest way to index the vault (sub-second).
```bash
cd implementations/go
go build -o librarian ./cmd/librarian
./librarian scan --dump
cat dump.cypher | redis-cli --pipe
```

### Go Daemon (Live Watch)
```bash
./librarian watch
```

### Julia (Benchmark)
```bash
cd implementations/julia
export JULIA_NUM_THREADS=8
julia --project=. librarian.jl dump
```
