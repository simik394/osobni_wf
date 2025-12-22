# Comparison Matrix Plan

We need to fill this grid to have a valid scientific comparison:

| Lang | Arch: Sequential | Arch: Parallel |
| :--- | :--- | :--- |
| **Go** | ✅ Existing (11.7s) | ❌ **TODO** (Goroutines) |
| **Julia** | ❌ **TODO** (Single Thread) | ✅ Existing (0.24s dump) |

## Tasks

1.  **Go Parallel Implementation**:
    *   Modify `watcher.go` to use a worker pool pattern.
    *   Parse files concurrently.
    *   Sync to DB concurrently (or via pipeline).

2.  **Julia Sequential Switch**:
    *   Add a flag `--serial` to disable `@threads` and run in a single loop.

3.  **Benchmark Suite**:
    *   Run all 4 variants.
    *   Record `Parse Time`, `Total Time`, `CPU Usage`.
