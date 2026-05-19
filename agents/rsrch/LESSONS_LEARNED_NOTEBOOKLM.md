# Lessons Learned: NotebookLM Archival Stabilization

## 1. Brittle UI Selectors & Navigation
- **Issue**: Relying on specific UI clicks for home navigation (`recycleAction`) caused hangs when elements were blocked by overlays or slow to render.
- **Solution**: Prioritize `page.goto()` with a strict timeout as a fallback for navigation. This is much faster and more reliable than simulating UI clicks for internal routing.

## 2. Lazy Loading & Large Accounts
- **Issue**: Accounts with many notebooks (e.g., >150) lazy-load cards. `count()` on a locator only returns currently rendered elements.
- **Solution**: Implement an aggressive scrolling loop that continues until the element count stabilizes.

## 3. Title Normalization & Matching
- **Issue**: Notebook titles often contain emojis, newlines, and varying prepositions (e.g., "Test z řízení rizik" vs "test řízení rizik"). Playwright's `hasText` is too strict for these cases.
- **Solution**: Use manual iteration over cards with title normalization (lowercase, whitespace collapse, emoji removal) and partial match logic (`includes`).

## 4. JS Click vs Playwright Click
- **Issue**: Playwright's stability checks (`waiting for element to be visible, enabled and stable`) can time out on elements that are technically present but considered "unstable" due to underlying UI activity.
- **Solution**: Implement a fallback to JavaScript-based click (`element.click()`) via `page.evaluate()` when standard Playwright clicks fail.

## 5. Dependency Injection & Compilation
- **Issue**: Refactored modular actions can easily break if the `Client` bridge (e.g., `NotebookLMClient.deps`) is not kept in sync with the new action signatures.
- **Solution**: Always verify that `GeminiActionDeps` (or equivalent interface) is fully satisfied in the client implementation before attempting to run CLI commands.

## 6. Language-Agnostic UIs & Regular Expression Locators
- **Issue**: Designing separate selectors for multi-lingual websites (e.g., Czech and English NotebookLM) leads to code duplication, selector drift, and fragile logic when localizations change.
- **Solution**: Utilize generic semantic element filters (`page.locator('button, div, [role="button"]')`) combined with case-insensitive, language-agnostic regular expressions (e.g., `/Studijní příručka|Study guide/i`) to select buttons dynamically and resiliently across all supported locales.

## 7. Unified Action Helpers for Studio Generators
- **Issue**: Implementing seven distinct, almost identical click-and-wait functions for various visual/textual guide generators in NotebookLM violates the DRY principle and increases the maintenance overhead.
- **Solution**: Design a parameterized core action helper (`generateStudioGuideByType`) that encapsulates maximization, source selection, selector resolution, clicking, and registration delay. Export individual thin wrapper functions to preserve type safety and specific route/CLI mappings.
