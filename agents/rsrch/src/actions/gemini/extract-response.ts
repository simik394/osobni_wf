import { Page } from 'playwright';
import { UniversalContext } from '../types';

export interface GeminiResponseData {
    text: string;
    markdown: string;
    sources: Array<{ index: number, url: string, title: string }>;
    thoughts?: string;
}

/**
 * Extracts high-fidelity response data from a Gemini chat message.
 * Handles Markdown conversion, citation mapping, and LaTeX/Table parsing.
 */
export async function extractResponseAction(
    ctx: UniversalContext,
    deps: {
        selectors: any;
        verbose: boolean;
    },
    messageSelector?: string,
    index?: number
): Promise<GeminiResponseData | null> {
    const { page } = ctx;
    const { selectors, verbose } = deps;

    try {
        const responseElements = page.locator(messageSelector || selectors.gemini.chat.response);
        const count = await responseElements.count();
        if (count === 0) return null;

        const targetIndex = index !== undefined 
            ? (index < 0 ? count + index : index) 
            : count - 1;
        
        if (targetIndex < 0 || targetIndex >= count) return null;

        const responseElement = responseElements.nth(targetIndex);

        // 1. Extract Thoughts if possible
        let thoughts: string | undefined;
        const thoughtToggleSelector = selectors.gemini.chat.thoughtToggle;
        const thoughtContainerSelector = selectors.gemini.chat.thoughtContainer;

        if (thoughtToggleSelector && thoughtContainerSelector) {
            try {
                const thoughtToggle = responseElement.locator(thoughtToggleSelector).first();
                if (await thoughtToggle.isVisible({ timeout: 100 }).catch(() => false)) {
                    // Check if already expanded or needs click
                    const container = responseElement.locator(thoughtContainerSelector).first();
                    if (!(await container.isVisible().catch(() => false))) {
                        await thoughtToggle.click().catch(() => {});
                        await page.waitForTimeout(200);
                    }
                    thoughts = await container.innerText().catch(() => undefined);
                }
            } catch (e) {
                // Ignore thought extraction errors
            }
        }

        // 2. Enhanced extraction via page.evaluate
        const data = await responseElement.evaluate((container) => {
            const clone = container.cloneNode(true) as HTMLElement;
            const sourcesArray: { index: number; url: string; title: string }[] = [];

            // LaTeX/Math Support (Broad Match)
            const mathElements = clone.querySelectorAll('mjx-container, .math, .katex, [class*="math"]');
            mathElements.forEach((el: any) => {
                const tex = el.getAttribute('tex') || el.getAttribute('data-tex') || el.innerText || '';
                if (tex) {
                    const isDisplay = (el.tagName === 'MJX-CONTAINER' && el.getAttribute('display') === 'true') || 
                                      el.classList.contains('display-math');
                    el.outerHTML = isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
                }
            });

            // Code Block Preservation
            const preBlocks = clone.querySelectorAll('pre');
            preBlocks.forEach((pre: any) => {
                const code = pre.querySelector('code');
                const lang = pre.getAttribute('data-language') || '';
                const content = code ? code.innerText : pre.innerText;
                pre.outerHTML = `\n\`\`\`${lang}\n${content.trim()}\n\`\`\`\n`;
            });

            // List Preservation (Explicitly add bullets)
            const listItems = clone.querySelectorAll('li');
            listItems.forEach((li: any) => {
                const bullet = li.parentElement && li.parentElement.tagName === 'OL' ? '1. ' : '* ';
                const bulletNode = document.createTextNode(bullet);
                li.insertBefore(bulletNode, li.firstChild);
            });

            // Link & Citation Discovery
            const links = clone.querySelectorAll('a');
            links.forEach((a: any) => {
                const url = a.getAttribute('data-attribution-url') || a.getAttribute('href');
                const text = a.innerText.trim();
                
                if (url && url.startsWith('http')) {
                    const isSearchLink = url.includes('google.com/search');
                    const attrUrl = a.getAttribute('data-attribution-url');
                    const looksLikeCitation = (text.length < 6 && /^[0-9\[\]]+$/.test(text)) || isSearchLink || attrUrl;

                    if (looksLikeCitation) {
                        const finalUrl = attrUrl || url;
                        let sourceIndex = sourcesArray.findIndex(s => s.url === finalUrl);
                        if (sourceIndex === -1) {
                            sourceIndex = sourcesArray.length;
                            const cleanTitle = text.replace(/\[\d+\]/g, '').trim() || 'Source';
                            sourcesArray.push({ index: sourceIndex + 1, url: finalUrl, title: cleanTitle });
                        }
                        a.innerText = `[^${sourceIndex + 1}]`;
                    } else if (text) {
                        a.outerHTML = `[${text}](${url})`;
                    }
                }
            });

            // Diagram Support (SVG)
            const SVGs = clone.querySelectorAll('svg');
            SVGs.forEach((svg: any, i: number) => {
                const label = svg.getAttribute('aria-label') || `Diagram ${i + 1}`;
                svg.outerHTML = `\n> [!NOTE]\n> [${label}] (Visual Diagram)\n`;
            });

            // Image Support (Raster)
            const imgs = clone.querySelectorAll('img');
            imgs.forEach((img: any) => {
                const alt = img.getAttribute('alt') || 'image';
                const src = img.getAttribute('src') || '';
                if (src && !src.startsWith('data:')) {
                    img.outerHTML = `![${alt}](${src})`;
                }
            });

            // Table Support (HTML to GFM)
            const tables = clone.querySelectorAll('table');
            tables.forEach((table: any) => {
                let mdTable = '\n';
                const rows = Array.from(table.querySelectorAll('tr'));
                if (rows.length === 0) return;

                rows.forEach((row: any, i: number) => {
                    const cells = Array.from(row.querySelectorAll('th, td'));
                    const cellText = cells.map((c: any) => c.innerText.replace(/\n/g, ' ').trim());
                    mdTable += `| ${cellText.join(' | ')} |\n`;
                    if (i === 0) {
                        mdTable += `| ${cells.map(() => '---').join(' | ')} |\n`;
                    }
                });
                table.outerHTML = mdTable + '\n';
            });

            return {
                text: clone.innerText,
                sources: sourcesArray
            };
        });

        let markdown = data.text;
        if (data.sources.length > 0) {
            markdown += '\n\n### Sources\n';
            data.sources.forEach(s => {
                markdown += `[^${s.index}]: [${s.title}](${s.url})\n`;
            });
        }

        return {
            text: data.text,
            markdown: markdown.trim(),
            sources: data.sources,
            thoughts
        };
    } catch (e) {
        if (verbose) console.error('[Gemini] Failed to extract response data:', e);
        return null;
    }
}

/**
 * Extracts all responses from the current chat.
 */
export async function extractAllResponsesAction(
    ctx: UniversalContext,
    deps: {
        selectors: any;
        verbose: boolean;
    },
    messageSelector?: string
): Promise<GeminiResponseData[]> {
    const { page } = ctx;
    const { selectors } = deps;

    const responseElements = page.locator(messageSelector || selectors.gemini.chat.response);
    const count = await responseElements.count();
    const results: GeminiResponseData[] = [];

    for (let i = 0; i < count; i++) {
        const data = await extractResponseAction(ctx, deps, messageSelector, i);
        if (data) results.push(data);
    }

    return results;
}

