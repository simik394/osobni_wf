import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Scrolls the chat history to the top to ensure all historical messages
 * and artifacts are loaded into the DOM.
 * 
 * @param ctx UniversalContext
 * @param deps Dependencies
 */
/**
 * Robust history loading with support for limits and offsets.
 * Instead of scrolling to the absolute top, it can stop when enough messages are loaded.
 */
export async function scrollToTopAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { limit?: number, untilText?: string } = {}
): Promise<void> {
    const { page, log } = ctx;
    const { limit, untilText } = options;
    
    log(`Initiating targeted history loading (limit: ${limit || 'max'}, until: ${untilText || 'none'})...`);

    const containerSelector = 'chat-window, .chat-history, [data-test-id="chat-history"], main div[style*="overflow-y: scroll"]';
    const container = page.locator(containerSelector).first();
    const messageSelector = deps.selectors.gemini.chat.response || '.model-response';
    
    let lastScrollHeight = 0;
    let stableCount = 0;
    const MAX_STABLE = 3; 
    const MAX_ITERATIONS = limit ? Math.ceil(limit / 5) + 5 : 50; 
    
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const messageCount = await page.locator(messageSelector).count();
        log(`Current message count in DOM: ${messageCount}`);

        // Check if we met the limit
        if (limit && messageCount >= limit) {
            log(`Reached requested limit of ${limit} messages.`);
            break;
        }

        // Check if we found the target text
        if (untilText) {
            const found = await page.locator(`:has-text("${untilText}")`).count() > 0;
            if (found) {
                log(`Found target text: "${untilText}". Stopping.`);
                break;
            }
        }

        const state = await container.evaluate(el => ({
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop
        })).catch(() => ({ scrollHeight: 0, scrollTop: 0 }));

        if (state.scrollHeight === lastScrollHeight && state.scrollTop === 0) {
            stableCount++;
            if (stableCount >= MAX_STABLE) break;
        } else {
            stableCount = 0;
            lastScrollHeight = state.scrollHeight;
        }

        await container.evaluate(el => el.scrollTo(0, 0));
        await page.waitForTimeout(1000); 

        // Efficient load-more detection
        const loadMoreSelectors = [
            'button:has-text("Load more")',
            'button:has-text("Načíst další")',
            'button[aria-label*="load more" i]'
        ];

        for (const sel of loadMoreSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.isVisible().catch(() => false)) {
                await btn.click();
                await page.waitForTimeout(1500);
                break; 
            }
        }
    }

    log('Finished history loading.');
}

// Helper for resolving file chips in user turns
async function resolveFileChipsForTurn(
    ctx: UniversalContext,
    turnLocator: any
): Promise<string> {
    const { page, log } = ctx;
    const chipSelector = 'button.new-file-preview-file, button.new-file-preview-container, .new-file-preview-file, [data-test-id="uploaded-file"] button, .file-preview-container button';
    const chips = turnLocator.locator(chipSelector);
    const chipCount = await chips.count().catch(() => 0);
    
    if (chipCount === 0) return '';
    
    log(`[Export] Found ${chipCount} file chips in user turn.`);
    const resolvedFiles: string[] = [];
    
    for (let i = 0; i < chipCount; i++) {
        const chip = chips.nth(i);
        
        let name = await chip.getAttribute('aria-label').catch(() => null);
        if (!name) {
            name = await chip.evaluate((el: any) => {
                return el.querySelector('.new-file-preview-title, [class*="file-name" i], [class*="title" i]')?.textContent || el.textContent;
            }).catch(() => null);
        }
        name = name ? name.trim() : `Attachment_${i + 1}`;
        
        let typeText = await chip.evaluate((el: any) => {
            const divs = Array.from(el.querySelectorAll('div, span')) as any[];
            const texts = divs.map(d => d.textContent?.trim() || '').filter(Boolean);
            return texts.length > 1 ? texts[1] : (texts[0] || 'File');
        }).catch(() => 'File');
        typeText = typeText ? typeText.trim() : 'File';
        
        log(`[Export] Resolving URL for file chip: "${name}" (${typeText})`);
        
        let fileUrl: string | null = null;
        try {
            const pagePromise = page.context().waitForEvent('page', { timeout: 2500 }).catch(() => null);
            const downloadPromise = page.waitForEvent('download', { timeout: 2500 }).catch(() => null);
            
            await chip.click({ timeout: 1500 }).catch(() => {});
            
            const result = await Promise.race([
                pagePromise.then(async (p) => {
                    if (!p) return null;
                    await page.waitForTimeout(500);
                    const url = p.url();
                    await p.close().catch(() => {});
                    return { type: 'url', url };
                }),
                downloadPromise.then(async (d) => {
                    if (!d) return null;
                    const url = d.url();
                    return { type: 'url', url };
                }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
            ]);
            
            if (result && result.url) {
                fileUrl = result.url;
            } else {
                const closeBtn = page.locator('button[aria-label*="Zavřít" i], button[aria-label*="Close" i], .close-button').first();
                if (await closeBtn.isVisible().catch(() => false)) {
                    const linkEl = page.locator('a[href*="googleusercontent"], a[href*="google.com"], a[download]').first();
                    if (await linkEl.isVisible().catch(() => false)) {
                        fileUrl = await linkEl.getAttribute('href').catch(() => null);
                    }
                    await closeBtn.click().catch(() => page.keyboard.press('Escape'));
                }
            }
        } catch (err: any) {
            log(`[Export] Error resolving chip URL: ${err.message}`, 'warn');
        }
        
        if (fileUrl) {
            resolvedFiles.push(`- [📄 ${name} (${typeText})](${fileUrl})`);
        } else {
            resolvedFiles.push(`- 📄 ${name} (${typeText})`);
        }
    }
    
    if (resolvedFiles.length > 0) {
        return `\n\n**Attachments:**\n${resolvedFiles.join('\n')}\n`;
    }
    return '';
}

// Helper for resolving canvas content in assistant turns
async function resolveCanvasForTurn(
    ctx: UniversalContext,
    deps: GeminiActionDeps & { readCanvas?: any; closeCanvas?: any },
    turnLocator: any
): Promise<string> {
    const { page, log } = ctx;
    
    const canvasChipSelectors = [
        'immersive-entry-chip',
        '.attachment-container',
        'button:has-text("Open in Canvas")',
        'button:has-text("Otevřít v prostředí Canvas")',
        'button[aria-label*="Canvas" i]'
    ];
    
    let chipLocator = null;
    for (const sel of canvasChipSelectors) {
        const loc = turnLocator.locator(sel).first();
        if (await loc.isVisible().catch(() => false)) {
            chipLocator = loc;
            break;
        }
    }
    
    if (!chipLocator) return '';
    
    let canvasTitle = await chipLocator.evaluate((el: any) => {
        return el.querySelector('h1, h2, h3, .gds-title-m, .title, strong, b')?.textContent || el.textContent;
    }).catch(() => null);
    canvasTitle = canvasTitle ? canvasTitle.trim() : 'Canvas Document';
    
    log(`[Export] Found Canvas chip: "${canvasTitle}". Opening Canvas...`);
    
    try {
        await chipLocator.click().catch(() => {});
        await page.waitForTimeout(2000);
        
        const readCanvas = deps.readCanvas || (await import('./canvas')).readCanvasAction;
        const closeCanvas = deps.closeCanvas || (await import('./canvas')).closeCanvasAction;
        
        const canvasData = await readCanvas(ctx, deps).catch(() => null);
        await closeCanvas(ctx, deps).catch(() => page.keyboard.press('Escape'));
        
        if (canvasData && canvasData.markdown) {
            log(`[Export] Extracted Canvas document: "${canvasData.title}"`);
            return `\n\n---\n#### 📝 Canvas: ${canvasData.title}\n\n${canvasData.markdown}\n\n---\n`;
        }
    } catch (err: any) {
        log(`[Export] Failed to extract Canvas document: ${err.message}`, 'warn');
    }
    
    return `\n\n---\n*📄 Document: ${canvasTitle} (Failed to inline content)*\n---\n`;
}

/**
 * Exports the full current session history as high-fidelity Markdown.
 */
export async function exportFullSessionAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps & { 
        extractResponse: typeof import('./extract-response').extractResponseAction;
        readCanvas?: any;
        closeCanvas?: any;
    }
): Promise<{ title: string; markdown: string; turns: any[] }> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Exporting full session history...');

    // 1. Ensure all history is loaded
    await scrollToTopAction(ctx, deps, { limit: 100 });

    const title = await page.title().then(t => t.replace('Gemini - ', '').trim());
    
    // 2. Identify all turns (User prompts and Model responses)
    // We use a broader set of selectors to catch the turn containers
    const turnSelector = 'user-query, model-response, .user-message, .model-response, [data-test-id="chat-turn"]';
    const turns = page.locator(turnSelector);
    const count = await turns.count();
    log(`[Export] Found ${count} turns with selector: ${turnSelector}`);
    
    const turnData: any[] = [];
    let markdown = `# ${title}\n\n`;

    for (let i = 0; i < count; i++) {
        const turn = turns.nth(i);
        const tag = await turn.evaluate(el => el.tagName.toLowerCase()).catch(() => 'unknown');
        const cls = await turn.evaluate(el => el.className).catch(() => '');
        log(`[Export] Turn ${i}: tag=${tag}, class=${cls}`);
        const isAssistant = await turn.evaluate(el => 
            el.tagName.toLowerCase() === 'model-response' || 
            el.classList.contains('model-response') ||
            !!el.querySelector('model-response')
        );

        if (isAssistant) {
            // Use high-fidelity extraction for model responses
            const data = await deps.extractResponse(ctx, { selectors, verbose: true }, turnSelector, i);
            if (data) {
                markdown += `### Gemini\n\n`;
                if (data.thoughts) {
                    markdown += `> [!NOTE]\n> **Thinking Process**\n> ${data.thoughts.replace(/\n/g, '\n> ')}\n\n`;
                }
                
                // Embed turn-level Canvas if present
                const canvasContent = await resolveCanvasForTurn(ctx, deps, turn);
                const fullMarkdown = data.markdown + canvasContent;
                
                markdown += `${fullMarkdown}\n\n`;
                turnData.push({ role: 'assistant', ...data, markdown: fullMarkdown });
            }
        } else {
            // User prompt
            const text = await turn.innerText();
            
            // Resolve file attachments if present
            const attachments = await resolveFileChipsForTurn(ctx, turn);
            const fullText = text.trim() + attachments;
            
            markdown += `### User\n\n${fullText}\n\n`;
            turnData.push({ role: 'user', text: fullText });
        }
    }

    return { title, markdown: markdown.trim(), turns: turnData };
}
