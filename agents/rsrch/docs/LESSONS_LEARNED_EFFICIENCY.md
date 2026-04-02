
# Lessons Learned: Browser Efficiency & Async Architecture

## 1. CDP Discovery Protocols
- **CDP Handshake**: When discovering the `webSocketDebuggerUrl` via `/json/version`, the `fetch` API requires the `http://` protocol. If the target endpoint is provided as a `ws://` URL, it must be explicitly protocol-swapped to `http://` before discovery.
- **DNS Rebinding**: Remote debugging ports often enforce strict `Host` header checks. Connecting via the resolved IP address (e.g., Tailscale IP) is significantly more reliable than using local peer names when bypasses are not configured.

## 2. Resource Management (Lease & Release)
- **Explicit Lifecycle**: Relying on garbage collection or implicit "closing" of clients is insufficient for production-grade automation. Implementing a `release()` method that returns pages to a `TabPool` ensures zero-leak performance.
- **Standalone Integration**: Even non-browser-primary utilities (like `query.ts` for Perplexity) must be harmonized with the central `BrowserClient` to participate in the resource pool.

## 3. Navigation Efficiency
- **UI-Based Recycling**: `page.goto()` is chemically expensive. For internal navigation (e.g., returning to a dashboard), clicking a UI element (logo/home icon) preserves the browser state and avoids full DOM re-parsing, leading to significantly faster "recycle times" for worker tabs.
- **Smart Initialization**: Always check if the browser is already on the target page before initiating navigation.

## 4. Reactive Interaction
- **DOM Observers**: Using `MutationObserver` based "WaitForDone" patterns is more robust than fixed timeouts for programmatic research. This allows the backend to be truly reactive to UI changes.
