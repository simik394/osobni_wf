# go-rod vs Playwright: Browser Automation Comparison

## Overview

| Library | Language | Protocol | Primary Use |
|---------|----------|----------|-------------|
| **go-rod** | Go | CDP (Chrome DevTools Protocol) | Lightweight automation |
| **Playwright** | JS/TS/Python/Java | CDP with abstraction | Feature-rich testing/scraping |

---

## Feature Comparison

| Feature | go-rod | Playwright |
|---------|--------|------------|
| **Browser Support** | Chromium only | Chromium, Firefox, WebKit |
| **Auto-wait** | Manual | Built-in (locators) |
| **Selectors** | CSS, XPath | CSS, XPath, text, role, test-id |
| **Network Intercept** | ✅ | ✅ (better API) |
| **Tracing/Debug** | Basic | Excellent (Trace Viewer) |
| **Screenshots/Video** | ✅ | ✅ (built-in) |
| **Stealth/Anti-detection** | Manual | Plugins available |
| **Multi-tab/context** | ✅ | ✅ (better API) |
| **CDP Connection** | ✅ Native | ✅ `connectOverCDP()` |
| **Concurrent Pages** | Goroutines | async/await |

---

## Resource Demands

| Metric | go-rod | Playwright |
|--------|--------|------------|
| **Binary Size** | ~12-18 MB (compiled) | ~300+ MB (node_modules) |
| **RAM (idle)** | ~5-10 MB | ~50-100 MB (Node runtime) |
| **Startup Time** | ~50ms | ~200-500ms |
| **CPU Overhead** | Lower | Higher (V8 engine) |
| **Cold Start** | Faster | Slower |

---

## When to Use

### go-rod
- ✅ Lightweight automation tasks
- ✅ Compiled binaries (no runtime)
- ✅ Low resource environments
- ✅ Simple scraping
- ❌ Complex testing scenarios
- ❌ Cross-browser testing

### Playwright
- ✅ Complex E2E testing
- ✅ Cross-browser support needed
- ✅ Rich debugging (Trace Viewer)
- ✅ Auto-waiting, better DX
- ❌ Resource-constrained environments
- ❌ When binary size matters

---

## CDP Compatibility

Both can connect to the same browser instance via CDP:

```go
// go-rod
rod.New().ControlURL("ws://localhost:9222").MustConnect()
```

```typescript
// Playwright
chromium.connectOverCDP("http://localhost:9222")
```

This allows **unified browser pool** architecture where both libraries share a single browser process.

---

## Related Issues

- [TOOLS-138: Unified Browser Pool](https://napoveda.youtrack.cloud/issue/TOOLS-138)
- [TOOLS-137: Non-blocking Browser Publishing](https://napoveda.youtrack.cloud/issue/TOOLS-137)
