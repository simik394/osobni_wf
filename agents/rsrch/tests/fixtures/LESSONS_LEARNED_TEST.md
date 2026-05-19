# Lessons Learned

### [[1. Playwright Submenu Mechanics (2026-05-18)]](file:///home/sim/Prods/01-pwf/agents/rsrch/src/actions/gemini/model.ts)
- **Problem**: When selecting sub-items like "Thinking Level" in the Gemini 3 UI, Playwright must trigger a double-pass.
- **Solution**: Select the base model to apply it, which instantly closes the menu. Then re-open the selector dropdown menu and select the thinking level.

### [[2. Docker Memory Limit Resets]]
- **Problem**: Docker image container builds crash on halvarm server.
- **Solution**: Set proper memory limits and clean build cache.
