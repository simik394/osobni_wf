#!/usr/bin/env julia
#=
Vault Librarian - Julia Implementation (Library + Parallel Sync Version)
Uses:
- Parallel Regex Parsing (same as librarian.jl)
- Redis.jl with Custom Connection Pool
- Parallel DB Sync (Threads.@threads)
=#

using Redis
using Dates
using Base.Threads

# ============================================================================
# Configuration (Same as standard)
# ============================================================================

const VAULT_PATH = get(ENV, "VAULT_PATH", joinpath(homedir(), "Obsi"))
const FALKORDB_HOST = String(split(get(ENV, "FALKORDB_ADDR", "localhost:6379"), ':')[1])
const FALKORDB_PORT = parse(Int, split(get(ENV, "FALKORDB_ADDR", "localhost:6379"), ':')[2])
const FALKORDB_GRAPH = get(ENV, "FALKORDB_GRAPH", "vault")

const MD_EXT = Set([".md", ".markdown"])
const CODE_EXT = Set([".py", ".go", ".ts", ".js", ".rs", ".jl", ".rb", ".java"])
const SKIP_DIRS = Set([".git", ".obsidian", ".trash", ".idea", ".vscode", ".venv", "__pycache__"])
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
# Helpers
# ============================================================================

esc_cypher(s) = replace(replace(s, "\\" => "\\\\"), "'" => "\\'")

function parse_md(path)
    s = read(path, String)
    tags, links = String[], String[]
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
# Connection Pool & Main
# ============================================================================

struct ConnectionPool
    pool::Channel{RedisConnection}
end

function get_pool(size, host, port)
    c = Channel{RedisConnection}(size)
    for _ in 1:size
        put!(c, RedisConnection(host=host, port=port))
    end
    ConnectionPool(c)
end

function with_conn(f, pool::ConnectionPool)
    conn = take!(pool.pool)
    try
        f(conn)
    finally
        put!(pool.pool, conn)
    end
end

function main()
    println("=== JULIA LIBRARIAN (REDIS LIB) ===")
    println("Threads: $(Threads.nthreads())")
    
    t0 = time()
    files = Tuple{String, Symbol}[]
    for (root, dirs, fnames) in walkdir(VAULT_PATH)
        filter!(d -> !startswith(d, ".") && !(d in SKIP_DIRS), dirs)
        for f in fnames
            startswith(f, ".") && continue
            path = joinpath(root, f)
            ext = lowercase(splitext(f)[2])
            if ext in MD_EXT
                push!(files, (path, :md))
            elseif ext in CODE_EXT
                should_skip = false
                for term in CODE_EXCLUDE_TERMS
                    if occursin(term, path); should_skip = true; break; end
                end
                if !should_skip; push!(files, (path, :code)); end
            end
        end
    end
    println("Found $(length(files)) files in $(round(time()-t0, digits=2))s")
    
    println("Parsing...")
    t1 = time()
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
        catch
        end
    end
    
    notes = reduce(vcat, bufs_note)
    code = reduce(vcat, bufs_code)
    println("Parsed: $(length(notes)) notes, $(length(code)) code files in $(round(time()-t1, digits=2))s")
    
    if "no-db" in ARGS
         println("Skipping DB sync.")
         return
    end

    println("Syncing to FalkorDB (Parallel using Redis.jl)...")
    t2 = time()
    
    # Initialize pool
    pool = get_pool(Threads.nthreads(), FALKORDB_HOST, FALKORDB_PORT)
    
    # Check all items
    all_items = [notes; code]
    
    Threads.@threads for item in all_items
        with_conn(pool) do conn
             if item isa NoteMeta
                 n = item
                 p = esc_cypher(n.path)
                 q = "MERGE (n:Note {path: '$p'}) SET n.name='$(esc_cypher(n.name))', n.modified=$(n.modified)"
                 run_cmd(conn, q)
                 run_cmd(conn, "MATCH (n:Note {path: '$p'})-[r:TAGGED|LINKS_TO]->() DELETE r")
                 fort(conn, n, p)
                 forl(conn, n, p)
             else
                 cd = item
                 p = esc_cypher(cd.path)
                 q = "MERGE (c:Code {path: '$p'}) SET c.name='$(esc_cypher(cd.name))', c.language='$(esc_cypher(cd.language))', c.modified=$(cd.modified)"
                 run_cmd(conn, q)
                 run_cmd(conn, "MATCH (c:Code {path: '$p'})-[r:DEFINES]->() DELETE r")
                 for f in cd.functions
                     run_cmd(conn, "MATCH (c:Code {path: '$p'}) MERGE (func:Function {name: '$(esc_cypher(f[1]))', path: '$p'}) SET func.line=$(f[2]) MERGE (c)-[:DEFINES]->(func)")
                 end
                 for cl in cd.classes
                     run_cmd(conn, "MATCH (c:Code {path: '$p'}) MERGE (k:Class {name: '$(esc_cypher(cl[1]))', path: '$p'}) SET k.line=$(cl[2]) MERGE (c)-[:DEFINES]->(k)")
                 end
             end
        end
    end
    
    println("Synced in $(round(time()-t2, digits=2))s")
    println("Total time: $(round(time()-t0, digits=2))s")
end

function run_cmd(conn, query)
    Redis.execute_command(conn, ["GRAPH.QUERY", FALKORDB_GRAPH, query])
end

function fort(conn, n, p)
    for t in n.tags
       run_cmd(conn, "MATCH (n:Note {path: '$p'}) MERGE (t:Tag {name: '$(esc_cypher(t))'}) MERGE (n)-[:TAGGED]->(t)")
    end
end
function forl(conn, n, p)
    for l in n.wikilinks
       run_cmd(conn, "MATCH (n:Note {path: '$p'}) MERGE (t:Note {name: '$(esc_cypher(l))'}) MERGE (n)-[:LINKS_TO]->(t)")
    end
end

main()
