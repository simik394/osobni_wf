#!/usr/bin/env julia
# Measure actual time breakdown for the scan operation

using Base.Threads

println("Julia version: $(VERSION)")
println("Number of threads: $(nthreads())")

# Read file list from file
files = filter(!isempty, strip.(readlines("/tmp/julia_test_files.txt")))
println("Testing with $(length(files)) files")

# Pattern matching (simulating scan_file)
function process_content(content::String)
    # This simulates what scan_file does
    lines = split(content, '\n')
    h_count = 0
    for line in lines
        if startswith(strip(line), "#")
            h_count += 1
        end
    end
    
    links = collect(eachmatch(r"\[\[([^\]]+)\]\]", content))
    tags = collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", content))
    embeds = collect(eachmatch(r"!\[\[([^\]]+)\]\]", content))
    
    return h_count + length(links) + length(tags) + length(embeds)
end

println("\n=== Time Breakdown ===")

# Measure I/O time only
t_io = @elapsed begin
    contents = [read(f, String) for f in files]
end
println("I/O only: $(round(t_io * 1000, digits=2)) ms ($(round(t_io / length(files) * 1000, digits=3)) ms/file)")

# Measure CPU time only (sequential)
t_cpu_seq = @elapsed begin
    results = [process_content(c) for c in contents]
end
println("CPU only (seq): $(round(t_cpu_seq * 1000, digits=2)) ms")

# Measure CPU time only (parallel)
t_cpu_par = @elapsed begin
    results = Vector{Int}(undef, length(contents))
    Threads.@threads for i in eachindex(contents)
        results[i] = process_content(contents[i])
    end
end
println("CPU only (par): $(round(t_cpu_par * 1000, digits=2)) ms")
println("CPU speedup: $(round(t_cpu_seq / t_cpu_par, digits=2))x")

# Total time estimates
total_current = t_io + t_cpu_seq
total_optimized = t_io + t_cpu_par
println("\n=== Totals ===")
println("Sequential (I/O + seq CPU): $(round(total_current * 1000, digits=2)) ms")
println("Optimized (I/O + par CPU): $(round(total_optimized * 1000, digits=2)) ms")
println("Theoretical speedup: $(round(total_current / total_optimized, digits=2))x")
println("\nI/O is $(round(t_io / total_current * 100, digits=1))% of total time")
