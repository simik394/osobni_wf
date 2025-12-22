#!/usr/bin/env julia
"""
scan.jl - Parse markdown files and extract metadata
Usage: cat files.txt | julia scan.jl --output notes.json

Julia implementation for performance comparison with Python.
"""

using JSON3
using Dates
using Base.Threads

# Data structure for note metadata
struct NoteMetadata
    path::String
    name::String
    extension::String
    size_bytes::Int64
    created::String
    modified::String
    char_count::Int
    word_count::Int
    line_count::Int
    h1::Int
    h2::Int
    h3::Int
    h4::Int
    h5::Int
    h6::Int
    code_block_count::Int
    code_languages::Vector{String}
    list_item_count::Int
    link_count::Int
    image_count::Int
    blockquote_count::Int
    table_count::Int
    has_frontmatter::Bool
    tags::Vector{String}
    wikilinks::Vector{String}
    embeds::Vector{String}
    external_links::Vector{String}
end

# Convert struct to dict for JSON serialization
function to_dict(note::NoteMetadata)
    Dict(
        "path" => note.path,
        "name" => note.name,
        "extension" => note.extension,
        "size_bytes" => note.size_bytes,
        "created" => note.created,
        "modified" => note.modified,
        "char_count" => note.char_count,
        "word_count" => note.word_count,
        "line_count" => note.line_count,
        "h1" => note.h1,
        "h2" => note.h2,
        "h3" => note.h3,
        "h4" => note.h4,
        "h5" => note.h5,
        "h6" => note.h6,
        "code_block_count" => note.code_block_count,
        "code_languages" => note.code_languages,
        "list_item_count" => note.list_item_count,
        "link_count" => note.link_count,
        "image_count" => note.image_count,
        "blockquote_count" => note.blockquote_count,
        "table_count" => note.table_count,
        "has_frontmatter" => note.has_frontmatter,
        "tags" => note.tags,
        "wikilinks" => note.wikilinks,
        "embeds" => note.embeds,
        "external_links" => note.external_links
    )
end

# Parse markdown content and extract structure
function parse_markdown(content::String)
    h_counts = [0, 0, 0, 0, 0, 0]
    code_block_count = 0
    code_languages = String[]
    list_item_count = 0
    link_count = 0
    image_count = 0
    blockquote_count = 0
    table_count = 0
    external_links = String[]
    
    lines = split(content, '\n')
    in_code_block = false
    
    for line in lines
        stripped = strip(line)
        
        # Track code blocks
        if startswith(stripped, "```")
            if !in_code_block
                code_block_count += 1
                # Extract language
                lang = replace(stripped, r"^```" => "") |> strip
                if !isempty(lang) && !(lang in code_languages)
                    push!(code_languages, lang)
                end
            end
            in_code_block = !in_code_block
            continue
        end
        
        if in_code_block
            continue
        end
        
        # Headings
        if startswith(stripped, "#")
            m = match(r"^(#{1,6})\s", stripped)
            if m !== nothing
                level = length(m.captures[1])
                h_counts[level] += 1
            end
        # Lists
        elseif occursin(r"^[-*+]\s", stripped) || occursin(r"^\d+\.\s", stripped)
            list_item_count += 1
        # Blockquotes
        elseif startswith(stripped, ">")
            blockquote_count += 1
        # Tables
        elseif startswith(stripped, "|") && endswith(stripped, "|")
            table_count += 1
        end
    end
    
    # Links: [text](url)
    for m in eachmatch(r"\[([^\]]+)\]\(([^)]+)\)", content)
        link_count += 1
        url = m.captures[2]
        if startswith(url, "http")
            push!(external_links, url)
        end
    end
    
    # Images: ![alt](src)
    image_count = length(collect(eachmatch(r"!\[([^\]]*)\]\(([^)]+)\)", content)))
    
    # Normalize table count (rows to tables, rough estimate)
    table_count = div(table_count, 3)
    
    return (
        h1=h_counts[1], h2=h_counts[2], h3=h_counts[3],
        h4=h_counts[4], h5=h_counts[5], h6=h_counts[6],
        code_block_count=code_block_count,
        code_languages=code_languages,
        list_item_count=list_item_count,
        link_count=link_count,
        image_count=image_count,
        blockquote_count=blockquote_count,
        table_count=table_count,
        external_links=external_links
    )
end

# Extract wikilinks [[link]]
function extract_wikilinks(content::String)
    links = String[]
    for m in eachmatch(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", content)
        link = m.captures[1]
        if !(link in links)
            push!(links, link)
        end
    end
    return links
end

# Extract embeds ![[embed]]
function extract_embeds(content::String)
    embeds = String[]
    for m in eachmatch(r"!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", content)
        embed = m.captures[1]
        if !(embed in embeds)
            push!(embeds, embed)
        end
    end
    return embeds
end

# Extract #tags
function extract_tags(content::String)
    tags = String[]
    for m in eachmatch(r"(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)", content)
        tag = m.captures[1]
        if !(tag in tags)
            push!(tags, tag)
        end
    end
    return tags
end

# Check for frontmatter
function has_frontmatter(content::String)
    return startswith(content, "---")
end

# Scan a single file
function scan_file(filepath::AbstractString)::Union{NoteMetadata, Nothing}
    filepath = strip(filepath)
    
    if !isfile(filepath)
        return nothing
    end
    
    try
        content = read(filepath, String)
        stat_info = stat(filepath)
        
        structure = parse_markdown(content)
        
        return NoteMetadata(
            filepath,
            splitext(basename(filepath))[1],
            splitext(filepath)[2],
            stat_info.size,
            string(Dates.unix2datetime(stat_info.ctime)),
            string(Dates.unix2datetime(stat_info.mtime)),
            length(content),
            length(split(content)),
            count('\n', content) + 1,
            structure.h1,
            structure.h2,
            structure.h3,
            structure.h4,
            structure.h5,
            structure.h6,
            structure.code_block_count,
            structure.code_languages,
            structure.list_item_count,
            structure.link_count,
            structure.image_count,
            structure.blockquote_count,
            structure.table_count,
            has_frontmatter(content),
            extract_tags(content),
            extract_wikilinks(content),
            extract_embeds(content),
            structure.external_links
        )
    catch e
        @warn "Error scanning $filepath: $e"
        return nothing
    end
end

function main()
    # Parse arguments
    output_file = nothing
    full_rescan = false
    
    i = 1
    while i <= length(ARGS)
        if ARGS[i] == "--output" || ARGS[i] == "-o"
            output_file = ARGS[i+1]
            i += 2
        elseif ARGS[i] == "--full"
            full_rescan = true
            i += 1
        else
            i += 1
        end
    end
    
    if output_file === nothing
        println(stderr, "Error: --output required")
        exit(1)
    end
    
    # Read file list from stdin
    files = filter(!isempty, strip.(readlines(stdin)))
    
    if isempty(files)
        println(stderr, "No files to scan")
        exit(0)
    end
    
    num_threads = Threads.nthreads()
    println(stderr, "Scanning $(length(files)) files with $num_threads threads (using @spawn)")
    
    # Scan files in parallel using @spawn tasks (best performance)
    tasks = [Threads.@spawn scan_file(f) for f in files]
    results = [fetch(t) for t in tasks]
    
    # Filter and convert results
    valid_results = filter(!isnothing, results)
    result_dicts = [to_dict(r) for r in valid_results]
    
    println(stderr, "Successfully scanned $(length(valid_results)) files")
    
    # Load existing data if incremental
    existing = Dict{String, Any}()
    if isfile(output_file) && !full_rescan
        try
            existing_data = JSON3.read(read(output_file, String))
            for note in existing_data
                existing[note["path"]] = note
            end
        catch
        end
    end
    
    # Merge results
    for note in result_dicts
        existing[note["path"]] = note
    end
    
    # Write output
    mkpath(dirname(output_file))
    open(output_file, "w") do f
        JSON3.write(f, collect(values(existing)))
    end
    
    println(stderr, "Total $(length(existing)) notes in database")
end

main()
