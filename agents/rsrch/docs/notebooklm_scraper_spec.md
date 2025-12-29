# NotebookLM Scraper Specification

> **Status**: Draft  
> **Date**: 2025-12-13

## 1. Overview

Scrape notebook content, sources, and audio artifacts from NotebookLM and store in FalkorDB for indexing, search, and correlation with other research artifacts.

## 2. Problem Statement

- NotebookLM content is siloed in Google's platform with no unified view
- No way to search across notebooks, sources, or audio transcripts
- Audio overviews lack transcripts (only audio files)
- Cannot correlate notebooks with Gemini research sessions that created them
- Source metadata (URLs, docs) scattered and not queryable

## 3. Goals

1. List all notebooks with metadata (title, creation date, source count)
2. For each notebook, extract:
   - **Sources**: URLs, Google Docs, PDFs with titles and types
   - **Audio Overviews**: Title, duration, creation date, download link
   - **Chat History**: User prompts and AI responses in notebook chat
   - **Notes**: User-created notes/highlights
3. Store in FalkorDB with proper relationships
4. Correlate with existing Gemini sessions/docs (via artifact registry)
5. Provide CLI commands for sync and query

## 4. Scrapable Data

### 4.1 Notebooks
| Data Point | Description | Priority |
|------------|-------------|----------|
| `title` | Notebook name | P0 |
| `id` | Platform ID (from URL) | P0 |
| `createdAt` | Creation timestamp | P1 |
| `updatedAt` | Last modified | P1 |
| `sourceCount` | Number of sources | P0 |

### 4.2 Sources (per notebook)
| Data Point | Description | Priority |
|------------|-------------|----------|
| `title` | Source title/filename | P0 |
| `type` | "url", "gdoc", "pdf", "text" | P0 |
| `url` | Original URL/Drive link | P0 |
| `addedAt` | When added to notebook | P2 |
| `contentPreview` | First ~500 chars | P2 |

### 4.3 Audio Overviews (per notebook)
| Data Point | Description | Priority |
|------------|-------------|----------|
| `title` | Audio artifact name | P0 |
| `duration` | Length in seconds | P1 |
| `createdAt` | Generation timestamp | P1 |
| `customPrompt` | Prompt used (if available) | P2 |
| `sourceRefs` | List of sources used for generation | P1 |
| `transcript` | Full transcript (if extractable) | P1 |
| `downloadUrl` | Direct download link | P0 |

### 4.4 Research & Sources (New)
| Data Point | Description | Priority |
|------------|-------------|----------|
| `searchMode` | "Fast" or "Deep" (Rychlý/Hloubkový) | P1 |
| `searchQuery` | Web search query used | P1 |
| `sourceType` | Web, Drive, PDF, Copied Text | P0 |
| `contentHash` | For deduplication | P1 |

### 4.4 Chat History (per notebook)
| Data Point | Description | Priority |
|------------|-------------|----------|
| `role` | "user" or "assistant" | P0 |
| `content` | Message text | P0 |
| `timestamp` | When sent | P2 |
| `citations` | Source references in response | P1 |

### 4.5 Notes (per notebook)
| Data Point | Description | Priority |
|------------|-------------|----------|
| `content` | Note text | P1 |
| `sourceRef` | Which source it references | P1 |
| `createdAt` | Creation time | P2 |

## 5. Data Model

```
(Agent {id: "notebooklm"})
  -[:OWNS]-> (Notebook {
    id,
    platformId,
    title,
    createdAt,
    capturedAt
  })
    -[:HAS_SOURCE]-> (Source {id, type, title, url, contentPreview, contentHash})
    -[:HAS_AUDIO]-> (AudioOverview {id, title, duration, transcript, localPath})
        -[:GENERATED_FROM]-> (Source)
    -[:HAS_CHAT]-> (ChatTurn {role, content, timestamp})
    -[:HAS_NOTE]-> (Note {content, sourceRef})
    
// Cross-platform correlation
(Document {googleDocId})-[:IMPORTED_TO]->(Notebook)
(GeminiSession)-[:EXPORTED_TO]->(Document)-[:IMPORTED_TO]->(Notebook)
```

## 6. Extraction Strategy

### 6.1 List Notebooks
1. Navigate to `notebooklm.google.com`
2. Find notebook cards in grid/list view
3. Extract title, source count, preview info
4. Click each to get platformId from URL

### 6.2 Scrape Notebook Contents
1. Open notebook
2. **Sources Panel**: List all sources with type/title/URL
3. **Studio Panel**: Find audio artifacts with titles
4. **Chat Area**: Scroll and extract conversation turns
5. **Notes Section**: Extract user notes if visible

### 6.3 Audio Transcript Extraction
- Check if transcript is available in UI (some audio has it)
- Alternatively: Download audio → Whisper transcription

## 7. CLI Commands

```bash
# Sync all notebooks
rsrch notebook sync --local --headed

# Sync specific notebook
rsrch notebook sync --title "Research Topic" --local

# List synced notebooks
rsrch graph notebooks

# View notebook details
rsrch graph notebook <id> --sources --audio --chat
```

## 8. Implementation Phases

### Phase 1: Notebook Listing
- [ ] `listNotebooks()` method
- [ ] Extract title, sourceCount, platformId
- [ ] Store basic Notebook nodes

### Phase 2: Source Extraction  
- [ ] `extractSources()` for open notebook
- [ ] Handle URL, Google Docs, PDF types
- [ ] Create Source nodes with relationships

### Phase 3: Audio Extraction
- [ ] `extractAudioOverviews()` from Studio panel
- [ ] Get title, duration, download capability
- [ ] Create AudioOverview nodes

### Phase 4: Chat History
- [ ] `extractChatHistory()` from notebook chat
- [ ] Handle citations/source references
- [ ] Create ChatTurn nodes

### Phase 5: Cross-Platform Correlation
- [ ] Match Google Doc sources to existing Documents in FalkorDB
- [ ] Link Notebook → Document → GeminiSession

## 9. Decisions Made

| Question | Decision |
|----------|----------|
| Transcript extraction | UI only by default; `-a` flag downloads audio (no auto-transcription) |
| Source content | Metadata only (title, type, URL) |
| Correlation matching | By title (fuzzy match) - Doc ID not accessible in notebook |
| Sync trigger | On-demand via CLI |

## 10. Existing Code to Reuse

From `notebooklm-client.ts`:
- `openNotebook(title)` - Navigate to specific notebook
- `downloadAudio()` / `downloadAllAudio()` - Audio download
- `addSourceUrl()` / `addSourceFromDrive()` - Source structure understanding
- `dumpState()` - Debug screenshots/HTML

From `graph-store.ts`:
- `syncConversation()` pattern for upsert logic
- Turn/ResearchDoc storage patterns
