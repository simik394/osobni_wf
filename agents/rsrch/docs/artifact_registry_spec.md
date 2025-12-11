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

| Type | Format | Example | Description |
|------|--------|---------|-------------|
| Session | `SES-XXX` | `SES-A1D` | 3-char alphanumeric, assigned to Gemini session |
| Document | `DOC-XXX-NN` | `DOC-A1D-01` | Session ID + 2-digit sequence |
| Audio | `AUD-XXX-NN-L` | `AUD-A1D-01-A` | Document ID + letter suffix |

**Character Set**: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes confusing chars: 0/O, 1/I/L)

## 5. Registry Storage

**File**: `data/artifact-registry.json`

```json
{
  "sessions": {
    "SES-A1D": {
      "geminiSessionId": "1a2b3c4d5e",
      "createdAt": "2025-12-11T00:00:00Z",
      "query": "History of Espresso",
      "documents": ["DOC-A1D-01"]
    }
  },
  "documents": {
    "DOC-A1D-01": {
      "sessionId": "SES-A1D",
      "googleDocId": "abc123xyz",
      "originalTitle": "Deep Research on History of Espresso",
      "currentTitle": "DOC-A1D-01 Deep Research on History of Espresso",
      "createdAt": "2025-12-11T00:05:00Z",
      "audio": ["AUD-A1D-01-A"]
    }
  },
  "audio": {
    "AUD-A1D-01-A": {
      "documentId": "DOC-A1D-01",
      "notebookTitle": "Espresso Research",
      "originalArtifactTitle": "Audio Overview",
      "currentArtifactTitle": "AUD-A1D-01-A Audio Overview",
      "localPath": "/data/audio/AUD-A1D-01-A.mp3",
      "createdAt": "2025-12-11T00:15:00Z"
    }
  }
}
```

## 6. Core Operations

### 6.1 Registration

| Operation | Trigger | Action |
|-----------|---------|--------|
| `registerSession` | Deep research starts | Assign `SES-XXX`, store geminiSessionId |
| `registerDocument` | Export to Docs completes | Assign `DOC-XXX-NN`, link to session |
| `registerAudio` | Audio generation completes | Assign `AUD-XXX-NN-L`, link to document |

### 6.2 Renaming

| Target | Method | Details |
|--------|--------|---------|
| Google Doc | Playwright | Navigate to doc URL, edit `<title>` in `<head>` or use "Rename" menu |
| NotebookLM Artifact | Playwright | Click artifact → "Rename" menu item → fill input |
| Local Audio File | Node.js `fs.rename` | Move file to new name in `data/audio/` |

### 6.3 Lookup

| Query | Returns |
|-------|---------|
| `getSession(SES-XXX)` | Full session object with linked docs/audio |
| `getDocumentByGoogleDocId(id)` | Document entry |
| `getAudioByLocalPath(path)` | Audio entry |
| `getLineage(AUD-XXX-NN-L)` | `{ audio, document, session }` chain |

## 7. Source-to-Audio Matching

When an audio overview completes, the system must deduce which document it came from:

1. **Extract source list** from the audio artifact's UI (NotebookLM shows sources used).
2. **Match source titles** against registered documents in the registry.
3. **Assign the audio ID** based on the matched document.

If no match is found, assign a standalone ID (`AUD-ORPHAN-NNN`).

## 8. CLI Commands

```bash
rsrch registry list                    # List all sessions
rsrch registry show SES-A1D            # Show session with all linked artifacts
rsrch registry rename SES-A1D "New ID" # Manually reassign session ID
rsrch registry lineage AUD-A1D-01-A    # Show full lineage chain
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

## Phase 1: Core Registry

- [ ] Create `src/artifact-registry.ts`
  - [ ] Define `RegistryEntry` types (Session, Document, Audio)
  - [ ] Implement `load()` / `save()` for `data/artifact-registry.json`
  - [ ] Implement `generateShortId(length)`
  - [ ] Implement `registerSession(geminiSessionId, query)`
  - [ ] Implement `registerDocument(sessionId, googleDocId, originalTitle)`
  - [ ] Implement `registerAudio(documentId, notebookTitle, originalTitle, localPath)`
  - [ ] Implement `getLineage(audioId)`

## Phase 2: Renaming Automation

- [ ] Add `renameGoogleDoc(docId, newTitle)` to `gemini-client.ts`
  - [ ] Navigate to `https://docs.google.com/document/d/{docId}/edit`
  - [ ] Click the document title element
  - [ ] Clear and type new title
  - [ ] Wait for auto-save
- [ ] Add `renameArtifact(artifactTitle, newTitle)` to `notebooklm-client.ts`
  - [ ] Locate artifact by current title
  - [ ] Click "More options" menu
  - [ ] Click "Rename"
  - [ ] Fill new title, confirm

## Phase 3: Workflow Integration

- [ ] Update `gemini deep-research` flow
  - [ ] Call `registerSession` before research starts
  - [ ] Call `registerDocument` after export, then rename doc
- [ ] Update `notebooklm generateAudioOverview` flow
  - [ ] On completion, extract source list from UI
  - [ ] Match sources to registry, deduce document ID
  - [ ] Call `registerAudio`, then rename artifact
- [ ] Update `downloadAudio` to use registry ID for filename

## Phase 4: CLI & Documentation

- [ ] Add `rsrch registry list` command
- [ ] Add `rsrch registry show <ID>` command
- [ ] Add `rsrch registry lineage <audioId>` command
- [ ] Update `USER_GUIDE.md` with registry usage
- [ ] Update `API.md` with new endpoints (if any)

## Phase 5: Testing & Verification

- [ ] Unit test: ID generation uniqueness
- [ ] Integration test: Full flow from session → doc → audio
- [ ] Manual test: Verify renamed titles appear correctly in all services
