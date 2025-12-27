# Librarian Reporting & Diagrams Guide

This document explains the advanced visualization logic implemented in the `librarian report` command.

## Core Concepts

### 1. Automatic Diagram Splitting (Clustering)
To avoid generating massive, unreadable "spaghetti" diagrams, the librarian automatically splits the architecture view into multiple files based on the directory structure.
- Each unique directory in the codebase becomes a **Cluster**.
- A dedicated `.puml` file is generated for each cluster (e.g., `architecture_src_utils.puml`).

### 2. Frontier Node Detection
A split diagram that only shows internal files would be useless for understanding interactions. The librarian implements **Frontier Detection**:
- **Internal Nodes**: Files located within the current cluster.
- **Frontier Nodes**: Files or external modules that have a direct relationship (1-hop) with any internal node.
- **Visual Distinction**: Frontier nodes are rendered in a separate "External" package or with distinct styling (e.g., dashed boxes in Mermaid) to show context without clutter.

### 3. Readability Improvements
- **Left-to-Right Layout**: Package and file-dependency diagrams use `left to right direction` to minimize edge crossings.
- **Path-Based Disambiguation**: Clusters are identified by their relative path (e.g., `rsrch/browser` vs `angrav/browser`) rather than just the folder name, preventing name collisions.
- **Semantic Filtering**: Architecture diagrams are restricted to nodes labeled `:Code`, automatically excluding metadata, notes, or generated prompts from the technical view.

## Usage

To generate the full suite of reports, run:

```bash
# Build the tool
go build ./cmd/librarian

# Generate report for a specific path
./librarian report <source_path> <output_dir> --detail medium
```

### Output Files
After running the report, the following files are produced in the `<output_dir>`:
- **`index.html`**: A comprehensive dashboard with interactive Mermaid diagrams (rendered via CDN) and embedded PlantUML views.
- **`report.md`**: A markdown version suitable for native rendering in Obsidian or IDEs.
- **`architecture_*.puml`**: Individual PlantUML source files for each code cluster.
- **`packages.puml`**: High-level package dependency graph.
- **`dependencies.puml`**: Detailed file-to-file dependency graph.

## Maintenance
If you need to adjust the clustering logic:
- Clustering rules are defined in `internal/export/plantuml.go` via the `toPackage` helper.
- Meta-diagram explaining the logic is in `internal/export/mermaid.go`.
