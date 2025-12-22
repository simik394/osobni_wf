#!/usr/bin/env julia
# Test FLoops.jl with work-stealing scheduler

using FLoops
using Base.Threads

println("=== FLoops.jl Parallelization Test ===")
println("Threads: $(nthreads())")

# Read file list
files = filter(!isempty, strip.(readlines("/tmp/julia_test_files.txt")))
println("Testing with $(length(files)) files\n")

# The work function
function process_file(filepath::AbstractString)
    content = read(filepath, String)
    lines = split(content, '\n')
    h_count = count(line -> startswith(strip(line), "#"), lines)
    links = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", content)))
    tags = length(collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", content)))
    return h_count + links + tags
end

#=== Sequential baseline ===#
println("--- Sequential ---")
t_seq = @elapsed begin
    results_seq = [process_file(f) for f in files]
end
println("Time: $(round(t_seq * 1000, digits=2)) ms")

#=== FLoops with ThreadedEx (work-stealing) ===#
println("\n--- FLoops + ThreadedEx ---")
t_floops = @elapsed begin
    @floop ThreadedEx() for f in files
        r = process_file(f)
        @reduce(total = 0 + r)
    end
end
println("Time: $(round(t_floops * 1000, digits=2)) ms | Speedup: $(round(t_seq/t_floops, digits=2))x")

#=== FLoops with basesize tuning ===#
println("\n--- FLoops + ThreadedEx(basesize=100) ---")
t_floops2 = @elapsed begin
    @floop ThreadedEx(basesize=100) for f in files
        r = process_file(f)
        @reduce(total2 = 0 + r)
    end
end
println("Time: $(round(t_floops2 * 1000, digits=2)) ms | Speedup: $(round(t_seq/t_floops2, digits=2))x")

#=== FLoops collect results ===#
println("\n--- FLoops collecting results ---")
t_floops3 = @elapsed begin
    results_floops = Vector{Int}(undef, length(files))
    @floop ThreadedEx() for i in eachindex(files)
        results_floops[i] = process_file(files[i])
    end
end
println("Time: $(round(t_floops3 * 1000, digits=2)) ms | Speedup: $(round(t_seq/t_floops3, digits=2))x")

#=== Original @threads for comparison ===#
println("\n--- @threads (baseline parallel) ---")
t_threads = @elapsed begin
    results_threads = Vector{Int}(undef, length(files))
    @threads for i in eachindex(files)
        results_threads[i] = process_file(files[i])
    end
end
println("Time: $(round(t_threads * 1000, digits=2)) ms | Speedup: $(round(t_seq/t_threads, digits=2))x")

#=== Summary ===#
println("\n=== SUMMARY ===")
times = [
    ("Sequential", t_seq),
    ("@threads", t_threads),
    ("FLoops default", t_floops),
    ("FLoops basesize=100", t_floops2),
    ("FLoops collect", t_floops3),
]
sort!(times, by=x->x[2])
for (name, t) in times
    println("$(rpad(name, 20)) $(lpad(round(t*1000, digits=1), 8)) ms  $(round(t_seq/t, digits=2))x")
end
