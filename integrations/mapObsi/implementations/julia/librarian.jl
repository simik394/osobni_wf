#!/usr/bin/env julia
#=
Vault Librarian - Julia Implementation (Objective Benchmark Version)
Matches Go logic:
- Walk all directories (except hidden/.git)
- Parse all Markdown files (even in node_modules)
- Parse Code files based on extensions, excluding node_modules/vendor/etc
- Sync to FalkorDB sequentially
=#

using Sockets
using Dates

# ============================================================================
# Configuration
# ============================================================================

const VAULT_PATH = get(ENV, "VAULT_PATH", joinpath(homedir(), "Obsi"))
const FALKORDB_HOST = String(split(get(ENV, "FALKORDB_ADDR", "localhost:6379"), ':')[1])
const FALKORDB_PORT = parse(Int, split(get(ENV, "FALKORDB_ADDR", "localhost:6379"), ':')[2])
const FALKORDB_GRAPH = get(ENV, "FALKORDB_GRAPH", "vault")

const MD_EXT = Set([".md", ".markdown"])
const CODE_EXT = Set([".py", ".go", ".ts", ".js", ".rs", ".jl", ".rb", ".java"])

# Directories to skip entirely (Hidden + specific tech folders if desired)
# To match Go "GlobalExclude", we only skip hidden folders and explicit trash/git
const SKIP_DIRS = Set([".git", ".obsidian", ".trash", ".idea", ".vscode", ".venv", "__pycache__"])

# File paths to exclude for CODE parsing (but allow for Markdown)
const CODE_EXCLUDE_TERMS = ["node_modules", "vendor", "dist", "build", ".venv", "__pycache__"]

# ============================================================================
# Types
# ============================================================================

struct NoteMeta
    path::String
    name::String
    modified::Int
    tags::Vector{String}
    wikilinks::Vector{String}
end

struct CodeMeta
    path::String
    name::String
    language::String
    modified::Int
    functions::Vector{Tuple{String, Int}}
    classes::Vector{Tuple{String, Int}}
end

# ============================================================================
# Regex
# ============================================================================

const RE_TAG = r"(?:^|\s)#([a-zA-Z][a-zA-Z0-9_/-]*)"
const RE_LINK = r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]"
const RE_FM = r"^---\n(.*?)\n---"s

const RE_PY_FUNC = r"^\s*def\s+(\w+)\s*\("m
const RE_PY_CLASS = r"^\s*class\s+(\w+)"m
const RE_GO_FUNC = r"^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\("m
const RE_GO_TYPE = r"^type\s+(\w+)\s+struct"m
const RE_TS_FUNC = r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)"m
const RE_TS_CLASS = r"^(?:export\s+)?class\s+(\w+)"m
const RE_TS_ARROW = r"^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>"m
const RE_RS_FUNC = r"^(?:pub\s+)?fn\s+(\w+)"m
const RE_RS_STRUCT = r"^(?:pub\s+)?struct\s+(\w+)"m

# ============================================================================
# DB Client (Raw TCP/RESP)
# ============================================================================

mutable struct Client; sock::TCPSocket; end

function connect_db(host, port)
    Client(connect(host, port))
end

function send_cmd(c::Client, args)
    buf = IOBuffer()
    write(buf, "*$(length(args))\r\n")
    for a in args
        s = string(a)
        write(buf, "\$$(sizeof(s))\r\n$s\r\n")
    end
    write(c.sock, take!(buf))
    read_resp(c.sock)
end

function read_resp(io)
    line = readline(io)
    isempty(line) && return nothing
    t, d = line[1], line[2:end]
    if t == ':' return parse(Int, d)
    elseif t == '$'
        len = parse(Int, d)
        len == -1 && return nothing
        s = String(read(io, len)); read(io, 2); s
    elseif t == '*'
        len = parse(Int, d)
        len == -1 && return nothing
        [read_resp(io) for _ in 1:len]
    elseif t == '+' return d
    elseif t == '-' return nothing # Error
    else return nothing end
end

esc_cypher(s) = replace(replace(s, "\\" => "\\\\"), "'" => "\\'")

# ============================================================================
# Parser
# ============================================================================

function parse_md(path)
    s = read(path, String)
    tags, links = String[], String[]
    
    # Frontmatter tags
    m = match(RE_FM, s)
    if m !== nothing
        for line in split(m.captures[1], '\n')
            if startswith(strip(line), "tags:")
                for tm in eachmatch(r"[\w-]+", line)
                    push!(tags, tm.match)
                end
            end
        end
    end
    
    for m in eachmatch(RE_TAG, s); push!(tags, m.captures[1]); end
    for m in eachmatch(RE_LINK, s); push!(links, m.captures[1]); end
    
    NoteMeta(path, splitext(basename(path))[1], round(Int, stat(path).mtime), unique(tags), unique(links))
end

function parse_code(path, lang)
    s = read(path, String)
    funcs, classes = Tuple{String, Int}[], Tuple{String, Int}[]
    
    if lang == "python"
        for m in eachmatch(RE_PY_FUNC, s); push!(funcs, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
        for m in eachmatch(RE_PY_CLASS, s); push!(classes, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
    elseif lang == "go"
        for m in eachmatch(RE_GO_FUNC, s); push!(funcs, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
        for m in eachmatch(RE_GO_TYPE, s); push!(classes, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
    elseif lang in ["typescript", "javascript"]
        for m in eachmatch(RE_TS_FUNC, s); push!(funcs, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
        for m in eachmatch(RE_TS_ARROW, s); push!(funcs, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
        for m in eachmatch(RE_TS_CLASS, s); push!(classes, (m.captures[1], count(==('\n'), s[1:m.offset])+1)); end
    end
    
    CodeMeta(path, basename(path), lang, round(Int, stat(path).mtime), funcs, classes)
end

# ============================================================================
# Main
# ============================================================================

function main()
    println("=== JULIA LIBRARIAN SCAN ===")
    println("Threads: $(Threads.nthreads())")
    
    # 1. Collect Files
    t0 = time()
    files = Tuple{String, Symbol}[]
    for (root, dirs, fnames) in walkdir(VAULT_PATH)
        # Skip hidden/system dirs
        filter!(d -> !startswith(d, ".") && !(d in SKIP_DIRS), dirs)
        
        for f in fnames
            startswith(f, ".") && continue
            path = joinpath(root, f)
            ext = lowercase(splitext(f)[2])
            
            if ext in MD_EXT
                push!(files, (path, :md))
            elseif ext in CODE_EXT
                # Check excludes for code
                should_skip = false
                for term in CODE_EXCLUDE_TERMS
                    if occursin(term, path)
                        should_skip = true
                        break
                    end
                end
                if !should_skip
                    push!(files, (path, :code))
                end
            end
        end
    end
    println("Found $(length(files)) files in $(round(time()-t0, digits=2))s")
    
    # 2. Parse (Parallel)
    println("Parsing...")
    t1 = time()
    
    # Pre-allocate thread buffers
    bufs_note = [NoteMeta[] for _ in 1:Threads.nthreads()]
    bufs_code = [CodeMeta[] for _ in 1:Threads.nthreads()]
    
    Threads.@threads for (path, type) in files
        tid = Threads.threadid()
        try
            if type == :md
                push!(bufs_note[tid], parse_md(path))
            else
                lang = Dict(".py"=>"python", ".go"=>"go", ".ts"=>"typescript", ".js"=>"javascript", ".rs"=>"rust", ".jl"=>"julia")[lowercase(splitext(path)[2])]
                push!(bufs_code[tid], parse_code(path, lang))
            end
        catch e
            # Ignore read errors
        end
    end
    
    notes = reduce(vcat, bufs_note)
    code = reduce(vcat, bufs_code)
    println("Parsed: $(length(notes)) notes, $(length(code)) code files in $(round(time()-t1, digits=2))s")
    
    # 3. Output Phase
    if "dump" in ARGS
        println("Dumping Cypher to dump.cypher...")
        open("dump.cypher", "w") do io
            for n in notes
                p = esc_cypher(n.path)
                println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MERGE (n:Note {path: '$p'}) SET n.name='$(esc_cypher(n.name))', n.modified=$(n.modified)\"")
                println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MATCH (n:Note {path: '$p'})-[r:TAGGED|LINKS_TO]->() DELETE r\"")
                for t in n.tags
                     println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MATCH (n:Note {path: '$p'}) MERGE (t:Tag {name: '$(esc_cypher(t))'}) MERGE (n)-[:TAGGED]->(t)\"")
                end
                for l in n.wikilinks
                     println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MATCH (n:Note {path: '$p'}) MERGE (t:Note {name: '$(esc_cypher(l))'}) MERGE (n)-[:LINKS_TO]->(t)\"")
                end
            end
            for cd in code
                p = esc_cypher(cd.path)
                println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MERGE (c:Code {path: '$p'}) SET c.name='$(esc_cypher(cd.name))', c.language='$(esc_cypher(cd.language))', c.modified=$(cd.modified)\"")
                println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MATCH (c:Code {path: '$p'})-[r:DEFINES]->() DELETE r\"")
                for (f, l) in cd.functions
                    println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MATCH (c:Code {path: '$p'}) MERGE (func:Function {name: '$(esc_cypher(f))', path: '$p'}) SET func.line=$l MERGE (c)-[:DEFINES]->(func)\"")
                end
                for (cl, l) in cd.classes
                    println(io, "GRAPH.QUERY $FALKORDB_GRAPH \"MATCH (c:Code {path: '$p'}) MERGE (k:Class {name: '$(esc_cypher(cl))', path: '$p'}) SET k.line=$l MERGE (c)-[:DEFINES]->(k)\"")
                end
            end
        end
        println("Dump complete in $(round(time()-t1, digits=2))s (Use: cat dump.cypher | redis-cli --pipe)")
        return
    end

    if "no-db" in ARGS
        println("Skipping DB sync.")
        return
    end
    
    println("Syncing to FalkorDB ($FALKORDB_HOST:$FALKORDB_PORT)...")
    t2 = time()
    c = connect_db(FALKORDB_HOST, FALKORDB_PORT)
    
    done = 0
    total = length(notes) + length(code)
    
    for n in notes
        p = esc_cypher(n.path)
        q = "MERGE (n:Note {path: '$p'}) SET n.name='$(esc_cypher(n.name))', n.modified=$(n.modified)"
        send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, q])
        # Clear rels
        send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, "MATCH (n:Note {path: '$p'})-[r:TAGGED|LINKS_TO]->() DELETE r"])
        # Tags
        for t in n.tags
            send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, "MATCH (n:Note {path: '$p'}) MERGE (t:Tag {name: '$(esc_cypher(t))'}) MERGE (n)-[:TAGGED]->(t)"])
        end
        # Links
        for l in n.wikilinks
            send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, "MATCH (n:Note {path: '$p'}) MERGE (t:Note {name: '$(esc_cypher(l))'}) MERGE (n)-[:LINKS_TO]->(t)"])
        end
        done += 1
        (done % 1000 == 0) && print("\rSynced $done/$total...")
    end
    
    for cd in code
        p = esc_cypher(cd.path)
        q = "MERGE (c:Code {path: '$p'}) SET c.name='$(esc_cypher(cd.name))', c.language='$(esc_cypher(cd.language))', c.modified=$(cd.modified)"
        send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, q])
        send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, "MATCH (c:Code {path: '$p'})-[r:DEFINES]->() DELETE r"])
        for (f, l) in cd.functions
            send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, "MATCH (c:Code {path: '$p'}) MERGE (f:Function {name: '$(esc_cypher(f))', path: '$p'}) SET f.line=$l MERGE (c)-[:DEFINES]->(f)"])
        end
        for (cl, l) in cd.classes
            send_cmd(c, ["GRAPH.QUERY", FALKORDB_GRAPH, "MATCH (c:Code {path: '$p'}) MERGE (k:Class {name: '$(esc_cypher(cl))', path: '$p'}) SET k.line=$l MERGE (c)-[:DEFINES]->(k)"])
        end
        done += 1
        (done % 1000 == 0) && print("\rSynced $done/$total...")
    end
    print("\n")
    
    println("Synced in $(round(time()-t2, digits=2))s")
    println("Total time: $(round(time()-t0, digits=2))s")
end

main()
