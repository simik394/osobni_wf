# Experiment Report: Browser Rename Function Integration Tests

> **Date**: 2025-12-11  
> **Feature**: Artifact Registry - Phase 2 (Renaming Automation)  
> **Scripts**: `tests/docker-rename-test.ts`, `tests/docker-browser-test.ts`

---

## 1. Objective

Verify that the browser automation for renaming works on actual target websites:
1. Google Docs title renaming via `renameGoogleDoc()`
2. NotebookLM artifact renaming via `renameArtifact()`

---

## 2. Test Environment

| Component | Details |
|-----------|---------|
| **Docker Container** | `rsrch-chromium-1` |
| **CDP Endpoint** | `http://localhost:9223` |
| **Playwright Version** | chromium-1200 |
| **Authentication** | Google account (logged in) |

---

## 3. Tests Performed

### Test 3.1: Docker CDP Connection

**Purpose**: Verify we can connect to the Docker browser via CDP

**Steps**:
1. Connect to `http://localhost:9223` using `chromium.connectOverCDP()`
2. Access existing browser contexts
3. Navigate to target URLs

**Result**: ✅ **PASS**

**Observed Behavior**:
```
✅ Connected to Docker browser
Using existing context with 4 pages
```

**Debugging Notes**:
- CDP connection requires the browser to be running with `--remote-debugging-port=9222`
- The Docker container exposes this on port 9223 to the host
- Connection timeout set to 30000ms (30 seconds)

---

### Test 3.2: NotebookLM Authentication Check

**Purpose**: Verify Google authentication is active

**Steps**:
1. Navigate to `https://notebooklm.google.com/`
2. Check if URL contains `accounts.google.com` (redirect = not logged in)

**Result**: ✅ **PASS**

**Observed Behavior**:
```
Current URL: https://notebooklm.google.com/
Logged in: true
```

**Screenshot**: `data/experiments/notebooklm_main_1765433841920.png`

---

### Test 3.3: NotebookLM Artifact Rename

**Purpose**: Test the `renameArtifact()` function

**Steps**:
1. Navigate to NotebookLM
2. Find notebook cards/elements
3. Click into a notebook
4. Find Studio tab
5. Locate audio artifact
6. Click More menu
7. Find Rename option

**Result**: ❌ **BLOCKED** - No notebooks in test account

**Observed Behavior**:
```
Found 0 notebook elements
Found 0 clickable elements with notebook-related text
```

**Root Cause**: The Docker Google account has no notebooks created yet.

**Selectors Tested**:
- `div[role="listitem"]` - 0 matches
- `notebook-preview` - 0 matches
- `.notebook-card` - 0 matches
- `a[href*="/notebook/"]` - 0 matches

**Action Required**: Create a notebook with audio artifact to test rename functionality.

---

### Test 3.4: Google Docs Authentication Check

**Purpose**: Verify Google Docs access

**Result**: ✅ **PASS**

**Observed Behavior**:
```
Current URL: https://docs.google.com/document/u/0/
Logged in: true
```

---

### Test 3.5: Google Docs Title Rename

**Purpose**: Test the `renameGoogleDoc()` function

**Steps**:
1. Navigate to Google Docs home
2. Find recent documents
3. Open a document
4. Locate title input element
5. Edit and save title

**Result**: ❌ **BLOCKED** - No documents in test account

**Observed Behavior**:
```
Found 0 recent documents
No recent docs, trying to create a new document...
No recent docs and could not create new doc
```

**Selectors Tested**:
- `[data-type="document"]` - 0 matches
- `.docs-homescreen-list-item` - 0 matches
- `[aria-label*="Blank"]` - 0 matches

**Action Required**: Create a Google Doc to test rename functionality.

---

## 4. Summary of Findings

| Test | Status | Blocker |
|------|--------|---------|
| CDP Connection | ✅ Pass | - |
| NotebookLM Auth | ✅ Pass | - |
| NotebookLM Rename | ❌ Blocked | No notebooks exist |
| Google Docs Auth | ✅ Pass | - |
| Google Docs Rename | ❌ Blocked | No documents exist |

---

## 5. Verified Components

✅ **Working**:
- Docker browser CDP connection
- Google authentication in Docker container
- Page navigation to NotebookLM and Google Docs
- Screenshot capture for debugging
- Test harness structure

❌ **Not Yet Verified** (needs test data):
- `renameGoogleDoc()` selector: `input.docs-title-input`
- `renameArtifact()` selector: `artifact-library-item button[aria-label*="More"]`
- Rename menu item selector: `button[role="menuitem"]` with text "Rename"/"Přejmenovat"

---

## 6. Recommendations

1. **Create Test Data**: Run a full `rsrch unified "Test Query"` to create:
   - A Gemini session
   - A Google Doc export
   - A NotebookLM notebook with audio artifact

2. **Re-run Tests**: After test data exists:
   ```bash
   npx ts-node tests/docker-rename-test.ts
   ```

3. **Selector Validation**: The selectors in `renameGoogleDoc()` and `renameArtifact()` may need adjustment based on actual DOM structure observed during live testing.

---

## 7. Screenshots Captured

| File | Description |
|------|-------------|
| `notebooklm_main_*.png` | NotebookLM home (empty) |
| `notebooklm_no_notebooks_*.png` | Confirmation of no notebooks |
| `gdocs_main_*.png` | Google Docs home (empty) |

---

## 8. Next Steps

1. [ ] Create a test notebook manually or via `rsrch notebook create "Test"`
2. [ ] Generate audio in the notebook via `rsrch notebook audio`
3. [ ] Re-run rename tests
4. [ ] Update `renameArtifact()` selectors if needed
5. [ ] Document final working selectors
