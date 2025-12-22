# Lessons Learned: Vault Librarian Benchmark

## 1. Architecture > Language
The most significant performance gains came from architectural decisions, not language choice.
*   **Go Sequential**: ~12s (1 thread, 1 connection).
*   **Go Parallel**: ~3s (8 workers, connection pool).
*   **Go Dump**: ~0.4s (8 workers, streaming).
*   **Julia Dump**: ~0.35s (8 threads, regex).

Converting Go from sequential to parallel (4x speedup) was far more impactful than switching languages.

## 2. The Power of Intermediate Formats ("Dump Mode")
Both languages hit a "Speed Limit" of ~0.4s when decoupling CPU-bound parsing from IO-bound database syncing.
By dumping to a file (`dump.cypher`) and using `redis-cli --pipe`, we bypassed the network latency entirely.
**Lesson**: For bulk ingestion, always prefer generating a compatible "load file" over making thousands of RPC calls.

## 3. Ecosystem Maturity Matters
We attempted to implement a "Library" version in Julia using `Redis.jl` to match Go's `go-redis`.
*   **Go**: `go-redis` handled massive concurrency out of the box.
*   **Julia**: `Redis.jl` struggled with thread-safety and protocol state management under high load, causing hangs.
**Lesson**: For infrastructure components where reliability is key, the maturity of the ecosystem (drivers, libraries) outweighs raw theoretical performance.

## 4. Concurrency Strategies
*   **Go (Goroutines + Channels)**: Easier to model "Worker Pools" for IO-bound work. Correctness comes naturally.
*   **Julia (Task + Channels)**: Powerful, but heavier for simple IO multiplexing. Best suited for CPU-heavy tasks.
