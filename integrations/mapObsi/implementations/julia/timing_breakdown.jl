#!/usr/bin/env julia
# Measure startup time vs actual processing time

using Base.Threads

# Mark the time at script start (after Julia itself started)
script_start = time()

println("=== Julia Timing Breakdown ===")
println("Threads: $(nthreads())")

# Read file list
files = filter(!isempty, strip.(readlines("/tmp/julia_test_files.txt")))
println("Files: $(length(files))")

# The work function
function process_file(filepath::AbstractString)
    content = read(filepath, String)
    lines = split(content, '\n')
    h_count = count(line -> startswith(strip(line), "#"), lines)
    links = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", content)))
    tags = length(collect(eachmatch(r"#([a-zA-Z][a-zA-Z0-9_/-]*)", content)))
    return h_count + links + tags
end

# Force compilation on a single file first
_ = process_file(files[1])

# Now time the actual work
work_start = time()
tasks = [Threads.@spawn process_file(f) for f in files]
results = [fetch(t) for t in tasks]
work_end = time()

total_end = time()

# Calculate times
startup_time = script_start  # This is measured from Julia launch
work_time = work_end - work_start
overhead_time = (total_end - script_start) - work_time

println("\n=== TIMING BREAKDOWN ===")
println("Work time (pure processing): $(round(work_time * 1000, digits=2)) ms")
println("Script overhead: $(round(overhead_time * 1000, digits=2)) ms")
println("Total script time: $(round((total_end - script_start) * 1000, digits=2)) ms")
println("\nNote: Julia process startup + JIT is measured externally")

# Output as parseable format
println("\n---PARSEABLE---")
println("WORK_MS=$(round(work_time * 1000, digits=2))")
println("FILES=$(length(files))")
println("RATE=$(round(length(files) / work_time, digits=1))")
