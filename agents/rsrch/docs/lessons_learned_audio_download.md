# Lessons Learned: Remote Audio Downloads (NotebookLM)

## Context
Automating the retrieval of audio overviews from NotebookLM in a remote, containerized environment (`halvarm` via Nomad).

## The Problems Faced
1. **Remote CDP Boundary**: Standard Playwright `download.saveAs()` fails because it attempts a filesystem-local `copyfile` from `/tmp/` to the target. In a remote session, the source `/tmp` is on the server, but the target path is on the client.
2. **CORS Restrictions**: Direct `fetch()` from the `notebooklm.google.com` origin to `drum.usercontent.google.com` is blocked by browser security (CORS), even in the same session.
3. **Session Stability**: Simple URL capturing isn't enough because Google's signed download URLs are short-lived and often require active session cookies.
4. **UI Interception**: Angular CDK backdrops and overlays intercept clicks if attempts are made via standard `page.click()`.

## The Solutions (The "Golden Path")
1. **RequestContext Bypass**: Using `context.request.get(url)` is the superior method for remote downloads. It uses the browser's cookies and session metadata but returns the binary payload directly to the local script's memory, bypassing filesystem and CORS issues.
2. **Raw JS Sequential Interactors**: Using `page.evaluate()` with raw Javascript strings (to escape `tsx` helper injection like `__name`) is the only 100% reliable way to trigger hidden/overlay-protected menu items.
3. **Impersonation**: When even `saveAs` fails, a system-level `curl` with extracted cookies (`context.cookies()`) and User-Agent is the ultimate fallback, provided it happens immediately after URL capture.

## Key Takeaways
- **RTFM (CDP Specifics)**: `connectOverCDP` behaves differently than local chromium for file operations.
- **Don't Fight the Overlay**: If a click is intercepted, don't try complex CSS workarounds; use a raw JS click on the element handle.
- **Data over Filesystem**: In distributed agentic systems, transfer data as binary buffers over the network session, don't rely on shared temporary paths.
