# Vault Librarian: Performance Matrix

Objective comparison of Go and Julia implementations across different architectures.

## 1. System Specifications
*   **Workload**: ~4,000 files
*   **Environment**: Local FalkorDB (Redis)
*   **Methodology**:
    *   **Go**: `Worker Pool` -> `go-redis` -> `FalkorDB`.
    *   **Julia**: `Threads.@threads` -> `Regex`.
        *   *Native*: Raw TCP implementation.
        *   *Library*: `Redis.jl` implementation.

## 2. The Full Matrix

| Architecture | Go Implementation | Julia Implementation | Winner |
| :--- | :--- | :--- | :--- |
| **Parsing + Bulk Dump**<br/>*(CPU Bound)* | **0.42s** | **0.35s** | **Tie** (Julia +17%) |
| **Parsing + Direct Sync**<br/>*(Network/IO Bound)* | **2.97s** | ~14s (Native: Serial)<br/>**Timed Out** (Library: Driver Issue) | **Go** (Robust) |

### Key Findings

#### 1. Bulk Dump (The "Speed Limit")
When network is removed, both languages fly.
*   **Go**: 0.42s.
*   **Julia**: 0.35s.
*   *Observation*: Go's compiled binary and Julia's JIT-compiled regex are evenly matched for raw text processing.

#### 2. Direct Sync (The "Ecosystem Gap")
*   **Go**: The `go-redis` library is battle-hardened. It handled highly concurrent pipelining (30k queries) effortlessly, saturating the DB link (3s).
*   **Julia**:
    *   **Native**: Writing a robust connection pool from scratch is hard. The serial version works but is slow (14s).
    *   **Library (`Redis.jl`)**: The standard library struggled with the high-concurrency FalkorDB protocol interaction, leading to hangs. This highlights a **maturity gap** in the ecosystem for specialized database operations.

## 3. When to use what?

### Use Go (The "Librarian")
**Scenario**: Production Daemon, Service, Tooling.
*   ✅ **Robustness**: Static binary, no dependencies to install on target.
*   ✅ **Integration**: Better drivers for DBs, file watching (`fsnotify` works perfectly).
*   ✅ **Concurrency**: Goroutines + Channels are easier to model correctly than Julia's Tasks + Channels for IO.

### Use Julia (The "Analyst")
**Scenario**: Data Science, Complex Analysis, Prototyping.
*   ✅ **Ad-hoc Glue**: "Parse these 4000 files and plot the distribution of tag recurrence" -> 5 lines of code.
*   ✅ **Math**: If you need to compute PageRank or eigenvectors of the graph *before* inserting.
*   ✅ **Repl**: Interactive exploration of the data structures.

## 4. Final Verdict

**Architecture**: Use **Go** with **Bulk Dump**.
**Reason**: It gives the best of both worlds—sub-second performance (0.42s) and rock-solid reliability.
