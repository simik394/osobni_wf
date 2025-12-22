#!/usr/bin/env julia
# Diagnostic script to test Julia threading behavior

using Base.Threads

println("Julia version: $(VERSION)")
println("Number of threads: $(nthreads())")

# Test 1: Check if threads are actually being used
println("\n=== Test 1: Thread assignment ===")
thread_ids = Vector{Int}(undef, 100)
Threads.@threads for i in 1:100
    thread_ids[i] = threadid()
end
unique_threads = unique(thread_ids)
println("Unique thread IDs used: $unique_threads ($(length(unique_threads)) threads)")

# Test 2: Timing with actual file I/O simulation
println("\n=== Test 2: Simulated file processing ===")
files = ["/tmp/test_$i.txt" for i in 1:100]

# Create test files
for f in files
    open(f, "w") do io
        write(io, "# Test file\n" * repeat("Lorem ipsum dolor sit amet.\n", 100))
    end
end

# Sequential
t_seq = @elapsed begin
    for f in files
        content = read(f, String)
        # Simulate some parsing work
        count('\n', content)
        length(split(content))
    end
end
println("Sequential: $(round(t_seq * 1000, digits=2)) ms")

# Parallel
t_par = @elapsed begin
    results = Vector{Int}(undef, length(files))
    Threads.@threads for i in eachindex(files)
        content = read(files[i], String)
        results[i] = count('\n', content) + length(split(content))
    end
end
println("Parallel ($(nthreads()) threads): $(round(t_par * 1000, digits=2)) ms")
println("Speedup: $(round(t_seq / t_par, digits=2))x")

# Cleanup
for f in files
    rm(f, force=true)
end

# Test 3: Pure CPU work (no I/O)
println("\n=== Test 3: Pure CPU work (regex matching) ===")
test_content = repeat("# Heading\nSome text with [[wikilink]] and #tag\n", 1000)

t_seq_cpu = @elapsed begin
    for _ in 1:100
        collect(eachmatch(r"\[\[([^\]|]+)\]\]", test_content))
        collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", test_content))
    end
end
println("Sequential: $(round(t_seq_cpu * 1000, digits=2)) ms")

t_par_cpu = @elapsed begin
    Threads.@threads for _ in 1:100
        collect(eachmatch(r"\[\[([^\]|]+)\]\]", test_content))
        collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", test_content))
    end
end
println("Parallel ($(nthreads()) threads): $(round(t_par_cpu * 1000, digits=2)) ms")
println("Speedup: $(round(t_seq_cpu / t_par_cpu, digits=2))x")
