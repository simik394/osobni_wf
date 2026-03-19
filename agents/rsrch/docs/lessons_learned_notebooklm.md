# NotebookLM Interfacing Lessons Learned

## Modal UI Instability
- **Root Cause**: NotebookLM (and many Angular/SPA apps) maintains multiple `<add-sources-dialog>` elements or `<mat-dialog-container>` in the DOM from previous UI states. 
- **Effect**: Blind Playwright locators (e.g., `.first()`) may lock onto an older, invisible dialog instance that is hidden by the current active backdrop (`cdk-overlay-backdrop`). Calling `click()` on elements within that stale wrapper freezes Playwright because the overlay indefinitely blocks pointer events.
- **Solution**: Avoid generic click fallbacks with `{ force: true }` because forcing the click disables the browser's native 'trusted event', which is required to invoke the `filechooser`. To combat DOM pollution, isolate the entire browser context sequence (run uploads one-by-one with isolated Node sessions) rather than keeping an SPAs state alive indefinitely across loops.

## Batch Upload Isolation
- **Problem**: When passing 9 PDFs through `waitForEvent('filechooser')` inside a large `for` loop, the script frequently hung. NotebookLM's uploader state occasionally stalls out or changes intermediate selectors.
- **Solution**: A sequential Bash script `for f in ...; do rsrch notebook add-local-source "$f"; done` provides a much higher rate of success. Each file upload utilizes a fresh connection to the remote CDP browser, which clears any lingering dialog overlays and UI bugs between runs. It completely mitigates memory leaks and SPA component desync.

## NotebookLM Specifics
- Text matches for buttons should accommodate localization differences (e.g. `/(Vyberte|Upload|Přidat)/i`).
- Forcing a click on the upload zone strictly breaks the native file-picker trigger constraint over CDP. Never use `force: true` when expecting a filechooser event.
