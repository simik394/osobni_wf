# Artifact Registry Specification

> **Status**: Draft  
> **Author**: AI Assistant  
> **Date**: 2025-12-11

## 1. Overview

The Artifact Registry provides **unified naming and lineage tracking** for objects created across Gemini, Google Docs, and NotebookLM. It solves the problem of identifying which audio file corresponds to which research document, and which document came from which chat session.

## 2. Problem Statement

- Audio overviews complete asynchronously and are named generically ("Audio Overview").
- Research documents exported from Gemini have AI-generated titles, not user-controlled IDs.
- There is no way to trace an audio file back to its source Gemini session without manual tracking.
- Renaming must happen *after* creation, and timing issues make it error-prone.

## 3. Goals

1. **Unique Identifiers**: Every artifact gets a short, human-readable ID.
2. **Lineage Tracking**: Audio → Document → Session chain is queryable.
3. **Preservation**: Original AI-generated titles are kept, prefixed with the new ID.
4. **Automation**: Renaming happens automatically after artifact creation.

## 4. ID Format

**Unified IDs** — No type prefixes. All artifacts sharing the same research context use the **same base ID**.

| Scope | Format | Example | Description |
|-------|--------|---------|-------------|
| Base ID | `XXX` | `A1D` | 3-char alphanumeric, assigned when session starts |
| Document variant | `XXX-NN` | `A1D-01` | Base + 2-digit sequence (multiple exports) |
| Audio variant | `XXX-NN-L` | `A1D-01-A` | Document ID + letter suffix (multiple audio) |

**Character Set**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing chars: 0/O, 1/I/L)

### Examples

| Research Query | Session | Doc Export | Audio |
|----------------|---------|------------|-------|
| "History of Espresso" | `A1D` | `A1D-01` | `A1D-01-A` |
| (second export) | `A1D` | `A1D-02` | `A1D-02-A` |
| (second audio of first doc) | `A1D` | `A1D-01` | `A1D-01-B` |

### Nice-to-Have (Future)
Similar content topics could share similar IDs (e.g., `A1D` and `A1E` for related research). This requires AI-based semantic matching and is **not in scope** for initial implementation.

## 5. Registry Storage

**File**: `data/artifact-registry.json`

```json
{
  "artifacts": {
    "A1D": {
      "type": "session",
      "geminiSessionId": "1a2b3c4d5e",
      "query": "History of Espresso",
      "createdAt": "2025-12-11T00:00:00Z"
    },
    "A1D-01": {
      "type": "document",
      "parentId": "A1D",
      "googleDocId": "abc123xyz",
      "originalTitle": "Deep Research on History of Espresso",
      "currentTitle": "A1D-01 Deep Research on History of Espresso",
      "createdAt": "2025-12-11T00:05:00Z"
    },
    "A1D-01-A": {
      "type": "audio",
      "parentId": "A1D-01",
      "notebookTitle": "Espresso Research",
      "originalTitle": "Audio Overview",
      "currentTitle": "A1D-01-A Audio Overview",
      "localPath": "/data/audio/A1D-01-A.mp3",
      "createdAt": "2025-12-11T00:15:00Z"
    }
  }
}
```

**Flat structure** enables simple `jq` queries without nested traversal.

## 6. Core Operations

### 6.1 Registration

| Operation | Trigger | Action |
|-----------|---------|--------|
| `registerSession` | Deep research starts | Generate base ID `XXX`, store |
| `registerDocument` | Export to Docs | Generate `XXX-NN`, link to parent |
| `registerAudio` | Audio completes | Generate `XXX-NN-L`, link to parent |

### 6.2 Renaming

| Target | Method |
|--------|--------|
| Google Doc | Playwright: click title → edit → auto-save |
| NotebookLM Artifact | Playwright: More menu → Rename → fill |
| Local Audio File | `fs.rename()` |

## 7. Source-to-Audio Matching

When an audio overview completes, deduce the source document:

1. **Extract source list** from NotebookLM artifact UI.
2. **Match source titles** against registered documents in registry.
3. **Assign audio ID** based on matched document.

If no match: assign standalone ID (`ORPHAN-NNN`).

## 8. CLI Commands (jq-based)

All lookups use `jq` directly on the registry file for simplicity. Future migration to Neo4j or similar will replace these.

```bash
# List all artifacts
rsrch registry list
# → jq -r 'keys[]' data/artifact-registry.json

# Show specific artifact
rsrch registry show A1D-01
# → jq '.artifacts["A1D-01"]' data/artifact-registry.json

# Get lineage (parent chain)
rsrch registry lineage A1D-01-A
# Recursively resolves parentId until root

# Find by type
rsrch registry list --type=audio
# → jq '[.artifacts | to_entries[] | select(.value.type=="audio") | .key]' data/artifact-registry.json
```

## 9. Integration Points

| Workflow Step | Integration |
|---------------|-------------|
| `gemini deep-research` | Call `registerSession` at start |
| `gemini export-to-docs` | Call `registerDocument`, trigger rename |
| `notebooklm audio` | Call `registerAudio` on completion, trigger rename |
| `notebook download-audio` | Use registry ID for local filename |

---

# Work Breakdown Structure (WBS)

## Phase 1: Core Registry ✅

- [x] Create `src/artifact-registry.ts`
  - [x] Define `ArtifactEntry` type (unified for session/doc/audio)
  - [x] Implement `load()` / `save()` for `data/artifact-registry.json`
  - [x] Implement `generateBaseId()` — 3-char random
  - [x] Implement `registerSession(geminiSessionId, query)` → returns `XXX`
  - [x] Implement `registerDocument(parentId, googleDocId, originalTitle)` → returns `XXX-NN`
  - [x] Implement `registerAudio(parentId, notebookTitle, originalTitle, localPath)` → returns `XXX-NN-L`
  - [x] Implement `getLineage(id)` → returns parent chain

## Phase 2: Renaming Automation ✅

- [x] Add `renameGoogleDoc(docId, newTitle)` to `gemini-client.ts`
  - [x] Navigate to doc, click title, edit, wait for save
- [x] Add `renameArtifact(artifactTitle, newTitle)` to `notebooklm-client.ts`
  - [x] Locate artifact, More menu → Rename → fill

## Phase 3: Workflow Integration ✅

- [x] Update `gemini deep-research` flow
  - [x] Call `registerSession` before research
  - [x] Call `registerDocument` after export, rename doc
- [x] Update `notebooklm generateAudioOverview` flow
  - [x] On completion, extract sources, match to registry
  - [x] Call `registerAudio`, rename artifact
- [x] Update `downloadAudio` to use registry ID for filename

## Phase 4: CLI (jq wrappers) ✅

- [x] Add `rsrch registry list` — wrapper for `jq 'keys[]'`
- [x] Add `rsrch registry show <ID>` — wrapper for `jq '.artifacts["<ID>"]'`
- [x] Add `rsrch registry lineage <ID>` — recursive parent lookup
- [x] Add `rsrch registry list --type=<type>` — filter by type
- [ ] Update `USER_GUIDE.md` with registry usage

## Phase 5: Testing & Verification

- [ ] Unit test: ID generation uniqueness
- [ ] Integration test: Full session → doc → audio flow
- [ ] Manual test: Verify renamed titles in all services

