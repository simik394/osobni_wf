# Experiment Report: Artifact Registry Verification

> **Date**: 2025-12-11  
> **Feature**: Artifact Registry (Phase 1-5)  
> **Script**: `tests/verify-registry-demo.ts`

---

## 1. Objective

Verify that the Artifact Registry correctly:
1. Generates unique 3-character base IDs
2. Registers sessions, documents, and audio with proper ID lineage
3. Persists data to `data/artifact-registry.json`
4. Prefixes original titles with registry IDs

---

## 2. Test Environment

- **Location**: `/home/sim/Obsi/Prods/01-pwf/agents/rsrch`
- **Command**: `npx ts-node tests/verify-registry-demo.ts`
- **Registry File**: `data/artifact-registry.json`

---

## 3. Tests Performed

### Test 3.1: Session Registration

**Input:**
```typescript
registry.registerSession(
    'demo-gemini-session-12345',
    'Benefits of Green Tea for Health'
);
```

**Expected Behavior:**
- Generate a unique 3-char ID
- Store session with `type: "session"`
- Include `geminiSessionId` and `query`

**Observed Behavior:**
- ✅ Generated ID: `FMM`
- ✅ Entry created with correct type
- ✅ Query stored: "Benefits of Green Tea for Health"

---

### Test 3.2: Document Registration

**Input:**
```typescript
registry.registerDocument(
    'FMM',  // parent session ID
    'demo-gdoc-abc123xyz',
    'Deep Dive: Green Tea Health Benefits'
);
```

**Expected Behavior:**
- Generate ID: `{sessionId}-NN` (e.g., `FMM-01`)
- Store with `type: "document"` and `parentId`
- Create `currentTitle` with ID prefix

**Observed Behavior:**
- ✅ Generated ID: `FMM-01`
- ✅ `parentId` correctly set to `FMM`
- ✅ `originalTitle`: "Deep Dive: Green Tea Health Benefits"
- ✅ `currentTitle`: "FMM-01 Deep Dive: Green Tea Health Benefits"

---

### Test 3.3: Audio Registration

**Input:**
```typescript
registry.registerAudio(
    'FMM-01',  // parent document ID
    'Green Tea Research Notebook',
    'Audio Overview'
);
```

**Expected Behavior:**
- Generate ID: `{docId}-L` (e.g., `FMM-01-A`)
- Store with `type: "audio"` and `parentId`
- Create `currentTitle` with ID prefix

**Observed Behavior:**
- ✅ Generated ID: `FMM-01-A`
- ✅ `parentId` correctly set to `FMM-01`
- ✅ `originalTitle`: "Audio Overview"
- ✅ `currentTitle`: "FMM-01-A Audio Overview"

---

### Test 3.4: Lineage Tracking

**Input:**
```typescript
registry.getLineage('FMM-01-A');
```

**Expected Behavior:**
- Return array: `[audio, document, session]`

**Observed Behavior:**
- ✅ Returned 3 entries
- ✅ Order: audio → document → session
- ✅ Each entry has correct `type`

---

### Test 3.5: Persistence

**Expected Behavior:**
- `data/artifact-registry.json` created/updated
- JSON is valid and human-readable

**Observed Behavior:**
- ✅ File exists at `data/artifact-registry.json`
- ✅ Contains valid JSON with 3 artifacts
- ✅ Pretty-printed with 2-space indentation

---

## 4. Registry File Contents (Actual Output)

```json
{
  "artifacts": {
    "FMM": {
      "type": "session",
      "geminiSessionId": "demo-gemini-session-12345",
      "query": "Benefits of Green Tea for Health",
      "createdAt": "2025-12-11T06:07:18.718Z"
    },
    "FMM-01": {
      "type": "document",
      "parentId": "FMM",
      "googleDocId": "demo-gdoc-abc123xyz",
      "originalTitle": "Deep Dive: Green Tea Health Benefits",
      "currentTitle": "FMM-01 Deep Dive: Green Tea Health Benefits",
      "createdAt": "2025-12-11T06:07:18.718Z"
    },
    "FMM-01-A": {
      "type": "audio",
      "parentId": "FMM-01",
      "notebookTitle": "Green Tea Research Notebook",
      "originalTitle": "Audio Overview",
      "currentTitle": "FMM-01-A Audio Overview",
      "createdAt": "2025-12-11T06:07:18.719Z"
    }
  }
}
```

---

## 5. CLI Verification

Tested `rsrch registry` commands against the created data:

```bash
$ rsrch registry list
"FMM"
"FMM-01"
"FMM-01-A"

$ rsrch registry list --type=session
"FMM"

$ rsrch registry show FMM-01
{
  "type": "document",
  "parentId": "FMM",
  "googleDocId": "demo-gdoc-abc123xyz",
  "originalTitle": "Deep Dive: Green Tea Health Benefits",
  "currentTitle": "FMM-01 Deep Dive: Green Tea Health Benefits",
  "createdAt": "2025-12-11T06:07:18.718Z"
}
```

---

## 6. Known Limitations

| Limitation | Description |
|------------|-------------|
| **No browser automation** | Registry entries are created, but no actual Google Docs or NotebookLM artifacts are renamed |
| **Demo data** | Session/Doc IDs are fake (`demo-gemini-session-12345`) |
| **Rename functions untested** | `renameGoogleDoc()` and `renameArtifact()` require live browser |

---

## 7. Debugging Notes

### ID Character Set
The registry uses: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- Excludes: `0` (looks like `O`), `1` (looks like `I`/`L`), `I`, `L`, `O`
- This prevents confusion in human-readable IDs

### Sequence Numbering
- Documents: 2-digit sequence (`01`, `02`, ...)
- Audio: Single letter (`A`, `B`, ..., `Z`)
- After `Z`, behavior undefined (would need extension)

### Timestamp Format
All `createdAt` fields use ISO 8601: `YYYY-MM-DDTHH:mm:ss.sssZ`

---

## 8. Conclusion

**Result: PASS**

The Artifact Registry correctly:
- ✅ Generates unique, hierarchical IDs
- ✅ Maintains parent-child relationships
- ✅ Persists to disk as JSON
- ✅ Exposes data via CLI

**Next Steps:**
- Run full `rsrch unified "Query" --wet --local` to test browser automation
- Verify `renameGoogleDoc()` and `renameArtifact()` with live services
