# FalkorDB Schema Documentation

> **Graph Name**: `vault` (configurable via `database.graph` in config)

This document describes the graph schema used by Vault Librarian to index your vault.

---

## Node Types

### :Note

Represents a markdown file in your vault.

| Property | Type | Description |
|----------|------|-------------|
| `path` | string | Absolute file path (indexed) |
| `name` | string | File name without extension (indexed) |
| `modified` | integer | Unix timestamp of last modification |

**Example:**
```cypher
(:Note {
  path: "/home/user/Obsi/projects/README.md",
  name: "README",
  modified: 1703956800
})
```

---

### :Code

Represents a source code file.

| Property | Type | Description |
|----------|------|-------------|
| `path` | string | Absolute file path (indexed) |
| `name` | string | File name with extension |
| `language` | string | Programming language (indexed) |
| `modified` | integer | Unix timestamp |

**Supported languages:** `python`, `go`, `typescript`, `javascript`, `rust`, `julia`

**Example:**
```cypher
(:Code {
  path: "/home/user/project/src/main.go",
  name: "main.go",
  language: "go",
  modified: 1703956800
})
```

---

### :Tag

Represents a tag (from frontmatter or inline `#tag`).

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Tag name without `#` (indexed) |

**Example:**
```cypher
(:Tag {name: "project"})
(:Tag {name: "important"})
(:Tag {name: "nested/subtag"})
```

---

### :Function

Represents a function or method definition in code.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Function name (indexed) |
| `path` | string | Source file path |
| `line` | integer | Line number of definition |
| `signature` | string | Full function signature |

**Example:**
```cypher
(:Function {
  name: "handleClick",
  path: "/src/app.ts",
  line: 42,
  signature: "export function handleClick(event: Event)"
})
```

---

### :Class

Represents a class, struct, or type definition.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Class/struct name (indexed) |
| `path` | string | Source file path |
| `line` | integer | Line number of definition |

**Example:**
```cypher
(:Class {
  name: "Config",
  path: "/src/config.go",
  line: 15
})
```

---

### :Module

Represents an imported module or package.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Module name or path |

**Example:**
```cypher
(:Module {name: "fmt"})
(:Module {name: "react"})
(:Module {name: "@/utils"})
```

---

### :Project

Represents a project root directory.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Project name (indexed) |

**Example:**
```cypher
(:Project {name: "01-pwf"})
(:Project {name: "my-app"})
```

---

### :Task

Represents a TODO/FIXME/NOTE comment in code or notes.

| Property | Type | Description |
|----------|------|-------------|
| `text` | string | Task description |
| `line` | integer | Line number |
| `status` | string | Task type: TODO, FIXME, NOTE, XXX, HACK (indexed) |
| `priority` | string | Optional priority (indexed) |

**Example:**
```cypher
(:Task {
  text: "Implement error handling",
  line: 55,
  status: "TODO",
  priority: ""
})
```

---

## Relationships

### Note Relationships

| Relationship | Direction | Target | Description |
|--------------|-----------|--------|-------------|
| `LINKS_TO` | Note → Note | Links via `[[wikilink]]` |
| `EMBEDS` | Note → Note | Embeds via `![[embed]]` |
| `TAGGED` | Note → Tag | Has tag |
| `HAS_TASK` | Note → Task | Contains TODO/FIXME |

### Code Relationships

| Relationship | Direction | Target | Description |
|--------------|-----------|--------|-------------|
| `DEFINES` | Code → Function | Defines function |
| `DEFINES` | Code → Class | Defines class/struct |
| `IMPORTS` | Code → Module | Imports module |
| `HAS_TASK` | Code → Task | Contains TODO/FIXME |

### Project Relationships

| Relationship | Direction | Target | Description |
|--------------|-----------|--------|-------------|
| `CONTAINS` | Project → Note | Note belongs to project |
| `CONTAINS` | Project → Code | Code file belongs to project |

---

## Example Queries

### Find Orphan Notes
Notes with no incoming links:
```cypher
MATCH (n:Note)
WHERE NOT ()-[:LINKS_TO]->(n)
RETURN n.path, n.name
```

### Find Backlinks
Notes that link to a specific note:
```cypher
MATCH (source:Note)-[:LINKS_TO]->(target:Note {name: 'README'})
RETURN source.path
```

### Find Notes by Tag
```cypher
MATCH (n:Note)-[:TAGGED]->(t:Tag {name: 'project'})
RETURN n.path, n.name
```

### Find Related Notes (via shared tags)
```cypher
MATCH (a:Note)-[:TAGGED]->(t:Tag)<-[:TAGGED]-(b:Note)
WHERE a.path = '/path/to/note.md' AND a <> b
RETURN DISTINCT b.path, t.name
```

### Find Shortest Path Between Notes
```cypher
MATCH p = shortestPath((a:Note {name: 'Start'})-[:LINKS_TO*]-(b:Note {name: 'End'}))
RETURN p
```

### Find All Functions Named X
```cypher
MATCH (c:Code)-[:DEFINES]->(f:Function {name: 'handleClick'})
RETURN c.path, f.line, f.signature
```

### Find All Classes in a Project
```cypher
MATCH (p:Project {name: 'my-project'})-[:CONTAINS]->(c:Code)-[:DEFINES]->(cl:Class)
RETURN c.path, cl.name, cl.line
```

### Find All TODO Items
```cypher
MATCH (file)-[:HAS_TASK]->(t:Task {status: 'TODO'})
RETURN file.path, t.line, t.text
ORDER BY file.path, t.line
```

### Find Dependencies of a File
```cypher
MATCH (c:Code {path: '/src/main.go'})-[:IMPORTS]->(m:Module)
RETURN m.name
```

### Find Files That Import a Module
```cypher
MATCH (c:Code)-[:IMPORTS]->(m:Module {name: 'react'})
RETURN c.path
```

### Count by Language
```cypher
MATCH (c:Code)
RETURN c.language, count(c) as count
ORDER BY count DESC
```

### Find Hub Notes (most linked)
```cypher
MATCH (n:Note)<-[:LINKS_TO]-(source:Note)
RETURN n.name, n.path, count(source) as inbound_links
ORDER BY inbound_links DESC
LIMIT 10
```

---

## Indexes

The following indexes are created by `InitSchema()`:

```cypher
CREATE INDEX ON :Note(path)
CREATE INDEX ON :Note(name)
CREATE INDEX ON :Tag(name)
CREATE INDEX ON :Code(path)
CREATE INDEX ON :Code(language)
CREATE INDEX ON :Function(name)
CREATE INDEX ON :Class(name)
CREATE INDEX ON :Project(name)
CREATE INDEX ON :Task(status)
CREATE INDEX ON :Task(priority)
```

---

## Direct Database Access

Connect to FalkorDB directly using redis-cli:

```bash
# Connect
redis-cli -p 6379

# Run a query
GRAPH.QUERY vault "MATCH (n:Note) RETURN count(n)"

# List all graphs
GRAPH.LIST
```

Or use FalkorDB's web interface if running FalkorDB Lab.
