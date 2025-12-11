# Experiment Report: End-to-End Artifact Registry Test

> **Date**: 2025-12-11  
> **Feature**: Artifact Registry Integration  
> **Job ID**: `oorv8qj5`

---

## 1. Objective

Run a complete unified research-to-podcast flow to test the artifact registry integration end-to-end.

---

## 2. Test Query

```
What are the cognitive benefits of learning to play a musical instrument as an adult?
```

---

## 3. Test Execution

### Step 1: Initiate Unified Flow ✅

```bash
curl -X POST http://localhost:3001/research-to-podcast \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the cognitive benefits of learning to play a musical instrument as an adult?", "dryRun": false}'
```

**Response:**
```json
{
  "success": true,
  "message": "Unified research flow started",
  "jobId": "oorv8qj5",
  "statusUrl": "/jobs/oorv8qj5"
}
```

---

### Step 2: Perplexity Research ✅

The Perplexity query completed successfully. Server logs show Czech-language response about cognitive benefits of music learning.

---

### Step 3: Gemini Deep Research ✅

Gemini deep research was triggered with the combined query. The response was extracted successfully.

Log excerpt:
```
[Gemini] Waiting for response...
[Gemini] Response extracted.
```

---

### Step 4: Export to Google Docs ❌ FAILED

**Error:**
```
[Gemini] Export button not found
[Gemini] Dumped state to /app/data/export_button_not_found_1765434712714.html
[Job oorv8qj5] Failed: Error: Failed to export Gemini research to Google Docs (Title not captured).
```

**Root Cause:**
The `exportToGoogleDocs()` function could not find the export button. This is a **selector issue** in `gemini-client.ts`, not a registry problem.

**Debug Files:**
- `/app/data/export_button_not_found_1765434712714.html`
- `/app/data/export_button_not_found_1765434712714.png`

---

## 4. Registry Integration Status

| Phase | Component | Status |
|-------|-----------|--------|
| Phase 1 | Core Registry | ✅ Tested |
| Phase 2 | Rename Functions | ⚠️ Not reached |
| Phase 3 | Workflow Integration | ❌ Blocked |
| Phase 4 | CLI Commands | ✅ Working |
| Phase 5 | Full E2E Test | ❌ Blocked |

---

## 5. What Was Verified

✅ **Working:**
- Unified flow endpoint accepts requests
- Job queue tracks the job correctly
- Perplexity query executes
- Gemini deep research executes
- Registry code is integrated into server.ts
- Registry would be called after successful export

❌ **Broken (Unrelated to Registry):**
- `exportToGoogleDocs()` selector for export button
- This failure occurs BEFORE registry code is reached

---

## 6. Separate Issue: Gemini Export Selector

The export button selector in `gemini-client.ts` needs debugging:

```typescript
// Current selector attempt
const exportBtn = page.locator('text=Export to Google Docs');
```

Possible fixes:
1. Update selector to match current Gemini UI
2. Add fallback selectors
3. Use aria-label or data attributes

---

## 7. Registry Core Verification (Separate Test)

To prove the registry works independently, the following was tested:

```bash
npx ts-node tests/verify-registry-demo.ts
```

**Result:** ✅ All entries created correctly

Registry file `data/artifact-registry.json` contains:
- Session: `FMM`
- Document: `FMM-01`
- Audio: `FMM-01-A`

---

## 8. Conclusion

| Test | Result |
|------|--------|
| Registry Core Logic | ✅ PASS |
| Registry Persistence | ✅ PASS |
| Registry CLI | ✅ PASS |
| Full E2E Flow | ❌ BLOCKED |

**Blocker:** The Gemini export button selector needs to be fixed before the full end-to-end flow can complete and exercise the registry integration.

---

## 9. Next Steps

1. [ ] Fix `exportToGoogleDocs()` selector in `gemini-client.ts`
2. [ ] Re-run unified flow test
3. [ ] Verify registry entries are created with correct IDs
4. [ ] Verify Google Doc is renamed with registry ID prefix
5. [ ] Verify NotebookLM audio is renamed with registry ID prefix
