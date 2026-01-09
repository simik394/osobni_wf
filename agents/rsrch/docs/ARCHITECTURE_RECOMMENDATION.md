# Gemini Architectural Recommendation: rsrch Hybrid Architecture

**Date**: 2026-01-09  
**Query**: Should browser automation stay in TypeScript/Node.js while other components move to Go?

---

## Recommendation: Hybrid Architecture

Keep browser automation in **TypeScript/Node.js** while moving core infrastructure (API, data processing, state management) to **Go**.

---

## 3 Key Reasons

### 1. First-Class Playwright Feature Parity

While Playwright has a Go port (playwright-go), the Node.js/TypeScript version is the "primary" citizen:

- **Test Runner**: Playwright's built-in test runner (sharding, retries, reporting) is optimized for Node
- **Trace Viewer & Debugging**: Sophisticated debugging tools and codegen engine are natively Node.js
- **Shadow DOM & Component Testing**: TypeScript handles complex selectors more resiliently for modern frameworks

### 2. Semantic DOM Alignment & Type Safety

Browser automation is fundamentally about interacting with the DOM, which is natively JavaScript-based:

- **JSON Native Support**: TypeScript handles JSON and unstructured web data more fluidly than Go's strict struct-based unmarshaling
- **Shared Frontend Types**: Can share type definitions via Windmill or monorepo between automation and UI
- **Evaluation Context**: When using `page.evaluate()`, TypeScript allows seamless type-checking between automation script and browser code

### 3. Windmill's Multi-Language Orchestration

Windmill is designed to handle multi-language workflows perfectly:

- **IO vs CPU Split**: Browser automation is highly IO-bound (waiting for pages). Node.js's event loop is efficient at managing "waiting" states. Go is better for CPU-intensive logic processing scrape results.
- **FalkorDB Graph Construction**: Use Go-based Windmill scripts for complex graph insertions, leveraging Go's performance for data transformation

---

## Comparison Summary

| Feature | TypeScript (Automation) | Go (Infrastructure/Core) |
|---------|------------------------|-------------------------|
| Playwright Support | Native / Feature-Complete | Community Port / Delayed Features |
| DOM Interaction | High (Native JS environment) | Low (Requires heavy abstraction) |
| Data Handling | Flexible (Dynamic/JSON) | Strict (Performance-optimized) |
| Best Use Case | Scrapers, UI Testing, Auth | API, DB Logic, Graph Traversal |

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Windmill Orchestrator                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌───────────────────┐     ┌───────────────────┐      │
│   │  TypeScript/Node  │     │        Go         │      │
│   │  ───────────────  │     │  ─────────────   │      │
│   │  • Playwright     │────▶│  • FalkorDB ops  │      │
│   │  • Browser auto   │     │  • Graph logic   │      │
│   │  • DOM extraction │     │  • Data transform│      │
│   │  • Auth flows     │     │  • API endpoints │      │
│   └───────────────────┘     └───────────────────┘      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Action Items

1. **Keep rsrch browser automation in TypeScript** - current implementation is correct approach
2. **Consider Go for new FalkorDB workers** - graph traversal, heavy data processing
3. **Windmill flows can mix both** - TypeScript scraper → Go processor → FalkorDB
