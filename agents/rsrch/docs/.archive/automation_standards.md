# Automation & Scraping Standards

> **Goal:** Prevent inefficient "guess-and-check" debugging cycles by enforcing systematic verification and robust coding patterns.

---

## 1. The Golden Rule: Verify Before You Code

**Never guess a selector.** The cost of a bad selector is 15+ minutes of debugging cycles.

### Required Evidence
Before implementing any scraper usage of a new element, you must produce:
1.  **A Screenshot:** Prove the element is visible in the headless/docker environment.
2.  **A DOM Dump:** Log the element's actual attributes (`class`, `aria-label`, `innerText`, `innerHTML`).
    *   *Why?* Localized text change (e.g., `Studio` vs `Analýza`), and dynamic classes (`ng-tns-...`) change.

```typescript
// BAD: Guessing
await page.click('text=Settings');

// GOOD: Verification Script First
const btns = page.locator('button');
for(const btn of await btns.all()) {
    console.log(await btn.outerHTML()); // Verify exact structure
}
await page.screenshot({ path: 'debug_state.png' }); // Verify visibility
```

---

## 2. Robust Selector Strategy

### ❌ Anti-Patterns (Do NOT Use)
- **Localized Text:** `hasText: /Analýza|Studio/` (Fragile across languages).
- **Generic Classes:** `div[class*="source"]` (Matches containers, icons, and irrelevant wrappers).
- **Position-based:** `nth(3)` (Breaks when layout changes).

### ✅ Best Practices
- **Icon-Based:** Targets are stable. `mat-icon:has-text("more_vert")` is universal.
- **Specific Containers:** Use unique wrapper classes like `.single-source-container`.
- **Aria Roles:** `button[role="menuitem"]`.
- **Hierarchy:** Anchor to a stable parent, *then* find the child.
    ```typescript
    // Find the item container first, then the button inside it
    const container = page.locator('.artifact-item').filter({ hasText: 'My File' });
    const btn = container.locator('button[aria-label="More"]');
    ```

---

## 3. Interaction Reliability

### Handling Race Conditions
Web apps hydrate dynamically. An element being "present" in the DOM does not mean it's "ready".
- **Rule:** Always confirm availability before interacting.
- **Pattern:** `waitForSelector` (graceful) vs `locator.click()` (sometimes too fast).

```typescript
// BAD
await page.locator('.btn').click();

// GOOD
const btn = page.locator('.btn');
await btn.waitFor({ state: 'visible', timeout: 5000 });
await btn.click();
```

### Event Listeners
If an action triggers an event (like Download), ensure the listener is active **before** the action.

```typescript
// BAD (Race Condition)
await button.click();
const download = await page.waitForEvent('download'); // Event might have already fired!

// GOOD
const downloadPromise = page.waitForEvent('download');
await button.click();
const download = await downloadPromise;
```

---

## 4. Systematic Development Workflow

Follow this cycle to avoid "dumb cycles":

1.  **Exploration Script (`src/debug-xyz.ts`)**
    *   Write a standalone script that opens the page.
    *   **Dump the DOM** of the target area.
    *   **Take a screenshot**.
    *   *Do not write the final code yet.*

2.  **Analysis**
    *   Inspect results. "Oh, the button text is actually 'Audio Overview', not 'Audio'."
    *   "The button is inside a shadow DOM or iframe?" (Check screenshots).

3.  **Implementation**
    *   Write the Client method using the *verified* selector.

4.  **Verification Script (`src/verify-xyz.ts`)**
    *   Run a script that specifically calls your new method.
    *   Must output "SUCCESS" or specific failure details.

---

## 5. Troubleshooting Checklist

| Symptom | Probable Cause | Solution |
| :--- | :--- | :--- |
| **Element not found (Timeout)** | Wrong selector or inside Iframe | Check generic `div` dump. Check `page.frames()`. |
| **Click succeeds but nothing happens** | Overlay Interception | Check `z-index` or `pointer-events`. Use `force: true` only if valid. |
| **"0 items found"** | Race Condition / Loading | Add `waitForSelector` or `waitForTimeout` (short) before counting. |
| **Works in Headed, fails in Headless** | Detection / UA / Viewport | Check screenshot. Is it mobile view? Is it blocked? |

---
