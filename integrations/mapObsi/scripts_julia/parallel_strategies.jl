#!/usr/bin/env julia
# Test alternative Julia parallelization strategies

println("=== Julia Parallelization Strategy Comparison ===\n")

# Read file list
files = filter(!isempty, strip.(readlines("/tmp/julia_test_files.txt")))
println("Testing with $(length(files)) files")

# The work function
function process_file(filepath::AbstractString)
    content = read(filepath, String)
    lines = split(content, '\n')
    h_count = count(line -> startswith(strip(line), "#"), lines)
    links = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", content)))
    tags = length(collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", content)))
    return h_count + links + tags
end

#=== Strategy 1: Sequential baseline ===#
println("\n--- Strategy 1: Sequential ---")
t1 = @elapsed begin
    results1 = [process_file(f) for f in files]
end
println("Time: $(round(t1 * 1000, digits=2)) ms")

#=== Strategy 2: @threads (current) ===#
using Base.Threads
println("\n--- Strategy 2: @threads ($(nthreads()) threads) ---")
t2 = @elapsed begin
    results2 = Vector{Int}(undef, length(files))
    @threads for i in eachindex(files)
        results2[i] = process_file(files[i])
    end
end
println("Time: $(round(t2 * 1000, digits=2)) ms | Speedup: $(round(t1/t2, digits=2))x")

#=== Strategy 3: @spawn with fetch (task-based) ===#
println("\n--- Strategy 3: @spawn tasks ---")
t3 = @elapsed begin
    tasks = [Threads.@spawn process_file(f) for f in files]
    results3 = [fetch(t) for t in tasks]
end
println("Time: $(round(t3 * 1000, digits=2)) ms | Speedup: $(round(t1/t3, digits=2))x")

#=== Strategy 4: Chunked @threads (reduce overhead) ===#
println("\n--- Strategy 4: Chunked @threads ---")
function process_chunk(chunk::Vector{<:AbstractString})
    return [process_file(f) for f in chunk]
end

# Split into chunks equal to thread count
n_chunks = nthreads()
chunk_size = ceil(Int, length(files) / n_chunks)
chunks = [files[i:min(i+chunk_size-1, end)] for i in 1:chunk_size:length(files)]

t4 = @elapsed begin
    chunk_results = Vector{Vector{Int}}(undef, length(chunks))
    @threads for i in eachindex(chunks)
        chunk_results[i] = process_chunk(chunks[i])
    end
    results4 = vcat(chunk_results...)
end
println("Time: $(round(t4 * 1000, digits=2)) ms | Speedup: $(round(t1/t4, digits=2))x")
println("($(length(chunks)) chunks of ~$(chunk_size) files each)")

#=== Strategy 5: asyncmap (async I/O) ===#
println("\n--- Strategy 5: asyncmap (async I/O) ---")
t5 = @elapsed begin
    results5 = asyncmap(process_file, files; ntasks=nthreads())
end
println("Time: $(round(t5 * 1000, digits=2)) ms | Speedup: $(round(t1/t5, digits=2))x")

#=== Summary ===#
println("\n=== SUMMARY ===")
times = [("Sequential", t1), ("@threads", t2), ("@spawn", t3), ("Chunked @threads", t4), ("asyncmap", t5)]
sort!(times, by=x->x[2])
for (name, t) in times
    println("$(rpad(name, 20)) $(lpad(round(t*1000, digits=1), 8)) ms  $(round(t1/t, digits=2))x")
end
