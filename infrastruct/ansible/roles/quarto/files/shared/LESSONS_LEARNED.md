# Lessons Learned: Quarto Side-by-Side Figure Captions

## Date: 2026-02-08

## The Issue

**Problem:** When using Quarto's `layout-ncol=2` for side-by-side figures in PDF output, the captions of adjacent images overlapped and were misaligned.

**Observed behavior:**
- Caption text from image (a) ran into caption text of image (b)
- Captions were not constrained to their respective image widths
- Long captions made the problem worse

## Root Cause Analysis

**Initial assumption (WRONG):** Quarto's `layout-ncol` attribute would generate proper LaTeX `subfigure` environments with correctly bounded captions.

**Reality:** Quarto/Pandoc generates simpler minipage-style layouts that don't properly constrain caption widths. The captions are placed as regular text after images, without proper width containment.

**What LaTeX actually needs:** The `subcaption` package with explicit `\begin{subfigure}[t]{0.48\textwidth}` environments that:
1. Top-align `[t]` so images align at top, captions flow below
2. Constrain caption width to subfigure width
3. Use `\hfill` for proper spacing between subfigures

## Failed Attempts & Why

| Attempt | Syntax | Result | Why It Failed |
|---------|--------|--------|---------------|
| 1. `layout-ncol=2` | Quarto markdown | Overlapping captions | Pandoc doesn't generate proper subfigure |
| 2. `fig-valign="bottom"` | Quarto attr | No effect | Not valid for PDF output |
| 3. `layout="[[48,-4,48]]"` | Explicit widths | Clipped captions | Fixed widths don't accommodate caption wrapping |
| 4. Adding `\usepackage{subcaption}` | LaTeX header | No effect | Package alone doesn't change Pandoc output |
| 5. Raw LaTeX in source | `{=latex}` block | **Worked** but pollutes source | User rejected - wants clean Quarto syntax |

## Final Solution

**Auto-transform in rendering pipeline:**
1. User writes clean Quarto syntax: `::: {#fig-id layout-ncol=2}`
2. Wrapper script detects `layout-ncol` divs during staging
3. Transform converts to proper LaTeX `subfigure` environment
4. Quarto renders the raw LaTeX block

```python
def transform_layout_to_subfigure(content: str, staging_dir: Path) -> str:
    # Detect ::: {#id layout-ncol=N} ... :::
    # Extract images with captions and IDs
    # Generate \begin{figure}[H] with \begin{subfigure}[t]{width}
```

## Key Insights

1. **Don't assume Quarto/Pandoc generates optimal LaTeX** - It prioritizes portability over format-specific optimization.

2. **When user says "LaTeX can handle this" they mean the rendering pipeline should handle it** - Not that they want to write raw LaTeX in their source files.

3. **`subcaption` package alone is not enough** - You must actually USE the `\subfigure` environment, not just include the package.

4. **Top-alignment `[t]` is critical** - Without it, images of different heights misalign their captions.

5. **Caption width is implicitly bounded by subfigure width** - This is the key feature that Quarto's layout lacks.

## Cross-Reference Caveat

When using raw LaTeX `\label{}`, Quarto's `@fig-...` references don't work. Must use:
- LaTeX `\ref{fig-id}` for inline references, OR
- Keep Quarto's figure syntax and use post-processing

The auto-transform approach preserves Quarto IDs by generating `\label{fig-id}` matching the original `{#fig-id}`.

## Implementation Checklist for Similar Issues

- [ ] Check if Quarto's default output actually uses the expected LaTeX constructs
- [ ] Test with minimal example before complex document
- [ ] Consider transformation in rendering pipeline vs. source modification
- [ ] Verify cross-references work with chosen solution
- [ ] Document the solution for future use
