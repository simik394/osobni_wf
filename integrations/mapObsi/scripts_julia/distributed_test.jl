#!/usr/bin/env julia
# Test Distributed.jl (true multiprocessing like Python)

using Distributed

# Add worker processes
n_workers = 8
if nworkers() < n_workers
    addprocs(n_workers - nworkers() + 1)
end
println("Workers: $(nworkers())")

# Define the work function on all workers
@everywhere function process_file(filepath::AbstractString)
    content = read(filepath, String)
    lines = split(content, '\n')
    h_count = count(line -> startswith(strip(line), "#"), lines)
    links = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", content)))
    tags = length(collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", content)))
    return h_count + links + tags
end

# Read file list
files = filter(!isempty, strip.(readlines("/tmp/julia_test_files.txt")))
println("Testing with $(length(files)) files")

#=== Strategy 1: Sequential baseline ===#
println("\n--- Sequential ---")
t1 = @elapsed begin
    results1 = [process_file(f) for f in files]
end
println("Time: $(round(t1 * 1000, digits=2)) ms")

#=== Strategy 2: pmap (distributed parallel map) ===#
println("\n--- pmap ($(nworkers()) workers) ---")
t2 = @elapsed begin
    results2 = pmap(process_file, files)
end
println("Time: $(round(t2 * 1000, digits=2)) ms | Speedup: $(round(t1/t2, digits=2))x")

#=== Strategy 3: pmap with batch_size ===#
println("\n--- pmap with batch_size=50 ---")
t3 = @elapsed begin
    results3 = pmap(process_file, files; batch_size=50)
end
println("Time: $(round(t3 * 1000, digits=2)) ms | Speedup: $(round(t1/t3, digits=2))x")

#=== Strategy 4: @distributed for ===#
println("\n--- @distributed reducer ---")
t4 = @elapsed begin
    total = @distributed (+) for f in files
        process_file(f)
    end
end
println("Time: $(round(t4 * 1000, digits=2)) ms | Speedup: $(round(t1/t4, digits=2))x")

#=== Summary ===#
println("\n=== SUMMARY (Distributed.jl) ===")
times = [("Sequential", t1), ("pmap", t2), ("pmap batch=50", t3), ("@distributed", t4)]
sort!(times, by=x->x[2])
for (name, t) in times
    println("$(rpad(name, 20)) $(lpad(round(t*1000, digits=1), 8)) ms  $(round(t1/t, digits=2))x")
end
