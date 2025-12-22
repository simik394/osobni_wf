# mapObsi Scanner Performance Report

**Date:** 2025-12-22
**Vault:** `/home/sim/Obsi/Prods` (1,674 markdown files)
**System:** Intel Core Ultra 7 155H (21 cores)

## Executive Summary

| Metric | Python (Regex) | Julia (@spawn) | Winner |
|--------|---------------|----------------|--------|
| **Total CLI time** | 0.25s | 1.06s | Python (4.2x faster) |
| **Pure processing time** | 0.25s | 0.065s | Julia (3.8x faster) |
| **Startup overhead** | ~0.01s | ~0.93s | Python (93x faster) |
| **Files/sec (total)** | ~6,700 | ~1,580 | Python |
| **Files/sec (processing only)** | ~6,700 | ~25,500 | Julia |

## Key Insight

**Julia is 3.8x faster at the actual work**, but its 0.93s startup time makes it **4.2x slower overall** for CLI usage.

---

## Detailed Timing Breakdown

### Python (8 workers, Regex mode)
```
Total time:       0.249s
├─ Startup:       ~0.010s (Python interpreter)
├─ Processing:    ~0.239s (multiprocessing pool)
└─ Rate:          6,700 files/sec
```

### Julia (8 threads, @spawn)
```
Total time:       1.06s (measured via benchmark.sh)
├─ Startup + JIT: ~0.93s (Julia process + compilation)
├─ Script overhead: 0.091s (loading packages, etc)
├─ Processing:    0.065s (actual file scanning)
└─ Rate:          25,568 files/sec (processing only)
```

---

## Parallelization Strategy Comparison (Julia)

| Strategy | Speedup | Notes |
|----------|---------|-------|
| **@spawn** | **1.84x** | ✅ Best - lightweight tasks |
| Chunked @threads | 1.13x | Reduces overhead |
| @threads | 1.0x | No benefit |
| asyncmap | 0.54x | Worse than sequential |
| FLoops.jl | 0.27x | Work-stealing overhead |
| Distributed.jl | 0.09x | IPC kills performance |

---

## What "Warmed Up" Means

Julia uses **Just-In-Time (JIT)** compilation:
- First run: Compiles all code (~0.9s overhead)
- **This happens EVERY time you run `julia script.jl`**
- Warmup only persists within a SINGLE Julia process

### Solutions for Production Julia
1. **DaemonMode.jl** - Keep Julia running as a service
2. **PackageCompiler.jl** - Pre-compile to a system image
3. **Julia REPL** - Interactive sessions stay warm

---

## Recommendation

| Use Case | Recommendation |
|----------|----------------|
| CLI tool (ad-hoc runs) | **Python** - instant startup |
| Large vault (10k+ files) | **Python** - still faster overall |
| Long-running service | **Julia** - if you use DaemonMode |
| Compute-heavy parsing | **Julia** - 3.8x faster processing |

For **mapObsi**, Python is the practical choice.

---

## Raw Benchmark Data

### Full CLI Benchmark (1,674 files, 21 workers/threads)

| Implementation | Time (s) | Files/sec | Parser |
|---------------|----------|-----------|--------|
| Python (Tree-sitter) | 0.23 | 7,271 | AST |
| Python (Regex) | 0.22 | 7,721 | Regex |
| Julia (@spawn) | 1.06 | 1,576 | Regex |

### Python Scaling
| Workers | Tree-sitter (f/s) | Regex (f/s) |
|---------|-------------------|-------------|
| 1 | 2,174 | 2,221 |
| 2 | 3,609 | 3,741 |
| 4 | 4,860 | 5,338 |
| 21 | 7,271 | 7,721 |

### Julia Processing Only (excluding startup)
| Threads | Files/sec |
|---------|-----------|
| 8 | 25,568 |
