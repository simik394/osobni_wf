#!/usr/bin/env julia
# Test: Sequential I/O + Parallel Processing pattern

using Base.Threads

println("Julia version: $(VERSION)")
println("Number of threads: $(nthreads())")

# Create test files
files = ["/tmp/test_$i.txt" for i in 1:500]
for f in files
    open(f, "w") do io
        write(io, "# Test file\n" * repeat("Lorem ipsum [[wikilink]] #tag dolor sit amet.\n", 200))
    end
end

println("\n=== Strategy 1: Parallel I/O + Parallel Processing (current) ===")
t1 = @elapsed begin
    results = Vector{Int}(undef, length(files))
    Threads.@threads for i in eachindex(files)
        content = read(files[i], String)
        # Simulate parsing
        results[i] = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", content))) +
                     length(collect(eachmatch(r"#([a-zA-Z]+)", content)))
    end
end
println("Time: $(round(t1 * 1000, digits=2)) ms")

println("\n=== Strategy 2: Sequential I/O + Parallel Processing ===")
t2 = @elapsed begin
    # Phase 1: Read all files sequentially
    contents = Vector{String}(undef, length(files))
    for i in eachindex(files)
        contents[i] = read(files[i], String)
    end
    
    # Phase 2: Process in parallel
    results = Vector{Int}(undef, length(files))
    Threads.@threads for i in eachindex(contents)
        results[i] = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", contents[i]))) +
                     length(collect(eachmatch(r"#([a-zA-Z]+)", contents[i])))
    end
end
println("Time: $(round(t2 * 1000, digits=2)) ms")
println("Speedup vs Strategy 1: $(round(t1 / t2, digits=2))x")

println("\n=== Strategy 3: @async I/O with Channel (pipelining) ===")
t3 = @elapsed begin
    ch = Channel{Tuple{Int, String}}(100)
    
    # Producer: async file reads
    @async begin
        for i in eachindex(files)
            content = read(files[i], String)
            put!(ch, (i, content))
        end
        close(ch)
    end
    
    # Consumer: parallel processing
    results = Vector{Int}(undef, length(files))
    Threads.@threads for _ in 1:nthreads()
        for (i, content) in ch
            results[i] = length(collect(eachmatch(r"\[\[([^\]]+)\]\]", content))) +
                         length(collect(eachmatch(r"#([a-zA-Z]+)", content)))
        end
    end
end
println("Time: $(round(t3 * 1000, digits=2)) ms")
println("Speedup vs Strategy 1: $(round(t1 / t3, digits=2))x")

# Cleanup
for f in files
    rm(f, force=true)
end

println("\n=== Summary ===")
println("Strategy 1 (Current): $(round(t1 * 1000, digits=1)) ms")
println("Strategy 2 (Seq I/O + Par CPU): $(round(t2 * 1000, digits=1)) ms")
println("Strategy 3 (Async Pipeline): $(round(t3 * 1000, digits=1)) ms")
