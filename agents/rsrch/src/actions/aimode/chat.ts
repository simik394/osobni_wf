import * as path from 'path';
import * as fs from 'fs';
import { UniversalContext, AIModeActionDeps } from '../types';
import { AIModeConversation } from './history';
import { createGDocAction, writeToGDocAction, addGDocTabAction, switchGDocTabAction } from '../gdocs';
import { createKeepNoteAction } from '../keep';

export type Turn = AIModeConversation['turns'][number];

/**
 * Exports the active AI Mode conversation to a Google Doc.
 */
export async function exportAIModeToGDocAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    options: { 
        title?: string; 
        docUrl?: string; 
        tabName?: string;
        append?: boolean;
    } = {}
): Promise<string | null> {
    const { page, log } = ctx;
    
    // 1. Scrape the active conversation
    const scrapeResult = await saveActiveAIModeChatAction(ctx, deps);
    if (scrapeResult.turnCount === 0) {
        log('No conversation turns found to export.', 'warn');
        return null;
    }
    
    const sessionData = JSON.parse(fs.readFileSync(scrapeResult.filePath, 'utf-8')) as AIModeConversation;
    const content = sessionData.turns.map(t => {
        const roleName = t.role === 'user' ? 'User' : 'AI';
        return `## ${roleName}\n\n${t.content}\n\n---\n`;
    }).join('\n');

    const title = options.title || sessionData.query || `AI Mode Export ${new Date().toLocaleString()}`;

    // 2. Target document
    let targetUrl: string | undefined | null = options.docUrl;
    if (targetUrl) {
        await page.goto(targetUrl);
    } else {
        targetUrl = await createGDocAction(ctx, title);
    }

    if (!targetUrl) return null;

    // 3. Target tab management
    if (options.tabName) {
        const tabExists = await switchGDocTabAction(ctx, { ...deps, selectors: ctx.config.selectors }, options.tabName);
        if (!tabExists) {
            log(`Creating new tab: ${options.tabName}`);
            await addGDocTabAction(ctx, { ...deps, selectors: ctx.config.selectors }, options.tabName);
        }
    }

    // 4. Write content
    const success = await writeToGDocAction(ctx, content, { append: options.append });
    if (success) {
        log(`Successfully exported AI Mode session to GDoc: ${targetUrl}`);
        return targetUrl;
    }

    return null;
}

/**
 * Exports the active AI Mode conversation to Google Keep.
 */
export async function exportAIModeToKeepAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    options: { title?: string; labels?: string[] } = {}
): Promise<boolean> {
    const { log } = ctx;
    
    const scrapeResult = await saveActiveAIModeChatAction(ctx, deps);
    if (scrapeResult.turnCount === 0) return false;
    
    const sessionData = JSON.parse(fs.readFileSync(scrapeResult.filePath, 'utf-8')) as AIModeConversation;
    const content = sessionData.turns.map(t => {
        const roleName = t.role === 'user' ? 'User' : 'AI';
        return `${roleName}: ${t.content}\n`;
    }).join('\n');

    const title = options.title || sessionData.query || `AI Mode Export ${new Date().toLocaleString()}`;

    const keepDeps = {
        ...deps,
        selectors: ctx.config.selectors,
        humanDelay: deps.humanDelay || (async (ms: number) => new Promise(resolve => setTimeout(resolve, ms)))
    } as any;

    const success = await createKeepNoteAction(ctx, keepDeps, title, content);

    if (success && options.labels && options.labels.length > 0) {
        const { manageKeepLabelsAction } = await import('../keep');
        for (const label of options.labels) {
            try {
                await manageKeepLabelsAction(ctx, keepDeps, { title }, label, 'add');
            } catch (e: any) {
                log(`Failed to add label "${label}" to Keep note: ${e.message}`, 'warn');
            }
        }
    }

    if (success) {
        log('Successfully exported AI Mode session to Google Keep.');
    }

    return success;
}


/**
 * Switch model in AI Mode between Auto (Flash) and Pro.
 */
export async function setAIModeModelAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    model: 'auto' | 'pro'
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log(`Setting AI Mode model to ${model}...`);

    // Navigate to AI Mode if not already there
    const url = page.url();
    if (!url.includes('udm=50')) {
        log('Navigating to AI Mode...');
        await page.goto(selectors.aiMode.entryUrl || 'https://www.google.com/search?udm=50', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        await page.waitForTimeout(2000);
    }

    // Click the model trigger to open the models menu (either top-bar label or plus-menu)
    const trigger = page.locator(selectors.aiMode.model.trigger).first();
    if (await trigger.isVisible({ timeout: 2000 }).catch(() => false)) {
        log('Clicking top bar model trigger...');
        await trigger.click();
        await page.waitForTimeout(1000);
    } else {
        // Fallback to plus button if top-bar switcher isn't visible/rendered yet
        log('Top bar model trigger not visible, clicking plus button left of input...');
        const plusBtn = page.locator(selectors.aiMode.upload.plusButton).first();
        if (await plusBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await plusBtn.click();
            await page.waitForTimeout(1000);
        } else {
            throw new Error('Could not find model selection trigger or plus button next to input field.');
        }
    }

    // Select the appropriate model option
    const optionSel = model === 'pro' ? selectors.aiMode.model.proOption : selectors.aiMode.model.autoOption;
    const option = page.locator(optionSel).first();
    if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        log(`Clicking ${model} option...`);
        await option.click();
        await page.waitForTimeout(2000);
        log(`Successfully switched AI Mode model to: ${model}`);
        return true;
    } else {
        throw new Error(`Model option ${model} not visible in the menu.`);
    }
}

/**
 * Handle conditional file/image upload based on the selected/active model.
 */
export async function uploadAIModeFileAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    filePath: string,
    options: { model?: 'auto' | 'pro' } = {}
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`File does not exist: ${absolutePath}`);
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);

    // Auto-detect active model if not explicitly specified
    let activeModel = options.model;
    if (!activeModel) {
        log('Detecting active model from page...');
        const triggerText = await page.locator(selectors.aiMode.model.trigger).first().innerText().catch(() => '');
        activeModel = triggerText.toLowerCase().includes('pro') ? 'pro' : 'auto';
        log(`Detected model: ${activeModel}`);
    }

    if (activeModel === 'pro' && !isImage) {
        throw new Error(`Model 'pro' only supports uploading image files. Unsupported file extension: ${ext}`);
    }

    log(`Uploading file ${absolutePath} in ${activeModel} mode...`);

    // Click the plus button next to the input area to reveal upload options
    const plusBtn = page.locator(selectors.aiMode.upload.plusButton).first();
    if (!await plusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        throw new Error('Plus button for uploads not found on the page.');
    }
    await plusBtn.click();
    await page.waitForTimeout(1000);

    // Pick the appropriate option selector
    const optionSel = isImage ? selectors.aiMode.upload.imageOption : selectors.aiMode.upload.fileOption;
    const option = page.locator(optionSel).first();
    if (!await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        throw new Error(`Upload option for ${isImage ? 'images' : 'files'} is not visible or disabled.`);
    }

    // Set up file chooser listener and click option
    const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        option.click()
    ]);

    await fileChooser.setFiles(absolutePath);
    await page.waitForTimeout(2000);
    log(`File successfully uploaded: ${absolutePath}`);
    return true;
}

/**
 * Merges stored turns with active turns using sequence overlap alignment.
 */
export function mergeTurns(stored: Turn[], active: Turn[]): Turn[] {
    if (!stored || stored.length === 0) return active;
    if (!active || active.length === 0) return stored;

    let bestOverlap = 0;
    const maxMatchLen = Math.min(stored.length, active.length);

    for (let len = 1; len <= maxMatchLen; len++) {
        let isMatch = true;
        for (let i = 0; i < len; i++) {
            const storedIdx = stored.length - len + i;
            const activeIdx = i;
            if (
                stored[storedIdx].role !== active[activeIdx].role ||
                stored[storedIdx].content.trim() !== active[activeIdx].content.trim()
            ) {
                isMatch = false;
                break;
            }
        }
        if (isMatch) {
            bestOverlap = len;
        }
    }

    return [...stored, ...active.slice(bestOverlap)];
}

/**
 * Scrapes and saves the active AI Mode conversation turns, consolidating them with any existing backup.
 */
export async function saveActiveAIModeChatAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    options: { outputFile?: string } = {}
): Promise<{ filePath: string; turnCount: number; merged: boolean }> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const conv = selectors.aiMode.conversation;

    log('Scraping conversation turns from active AI Mode tab...');

    // Extract current URL & mstk conversation ID
    const currentUrl = page.url();
    const mstkMatch = currentUrl.match(/mstk=([^&]+)/);
    const conversationId = mstkMatch ? mstkMatch[1] : `session_${Date.now()}`;

    // Scrape user prompts and assistant responses using an in-browser traversal
    const activeTurns = await page.evaluate((selectorsConf) => {
        const turnsList: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        // Helper to extract styled/formatted Markdown text from element
        const extractMarkdown = (container: HTMLElement): string => {
            const clone = container.cloneNode(true) as HTMLElement;

            // Convert code blocks
            clone.querySelectorAll('pre').forEach(pre => {
                const code = pre.querySelector('code');
                const lang = pre.querySelector('div, span')?.textContent?.trim().toLowerCase() || '';
                const codeText = (code || pre).textContent || '';
                const langTag = lang && !lang.includes(' ') ? lang : '';
                const replacement = document.createElement('div');
                replacement.textContent = `\n\`\`\`${langTag}\n${codeText}\n\`\`\`\n`;
                pre.replaceWith(replacement);
            });

            // Convert inline code
            clone.querySelectorAll('code').forEach(c => {
                const text = c.textContent || '';
                c.textContent = `\`${text}\``;
            });

            // Convert links
            clone.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href') || '';
                const text = a.textContent || '';
                if (href.startsWith('http') && text) {
                    a.textContent = `[${text}](${href})`;
                }
            });

            // Convert bold
            clone.querySelectorAll('b, strong').forEach(b => {
                b.textContent = `**${b.textContent}**`;
            });

            // Convert lists
            clone.querySelectorAll('li').forEach(li => {
                li.textContent = `- ${li.textContent}\n`;
            });

            return clone.innerText || '';
        };

        // Query all turn containers and response containers
        const userContainers = Array.from(document.querySelectorAll(selectorsConf.turnRoot || 'div[jsname="H7tCnf"]'));
        const assistantContainers = Array.from(document.querySelectorAll(selectorsConf.aiResponse || 'div[data-xid="aim-mars-turn-root"]'));

        // Tag them and sort them chronologically by document order
        const allNodes = [
            ...userContainers.map(node => ({ node, role: 'user' as const })),
            ...assistantContainers.map(node => ({ node, role: 'assistant' as const }))
        ];

        // Sort by position in DOM
        allNodes.sort((a, b) => {
            const position = a.node.compareDocumentPosition(b.node);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                return -1; // a is before b
            } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                return 1;  // a is after b
            }
            return 0;
        });

        for (const entry of allNodes) {
            let content = '';
            if (entry.role === 'assistant') {
                content = extractMarkdown(entry.node as HTMLElement);
            } else {
                content = (entry.node as HTMLElement).innerText || '';
            }

            if (content.trim()) {
                turnsList.push({ role: entry.role, content: content.trim() });
            }
        }

        return turnsList;
    }, {
        turnRoot: conv.turnRoot,
        aiResponse: conv.aiResponse
    });

    log(`Scraped ${activeTurns.length} turns from the DOM.`);

    // Determine target output path
    const targetFile = options.outputFile 
        ? path.resolve(options.outputFile)
        : path.join(process.cwd(), `aimode_session_${conversationId}.json`);

    let finalTurns = activeTurns;
    let merged = false;

    // If file already exists, merge the turns to consolidate
    if (fs.existsSync(targetFile)) {
        log(`Existing session file found at ${targetFile}. Consolidating turns...`);
        try {
            const fileContent = fs.readFileSync(targetFile, 'utf-8');
            const data = JSON.parse(fileContent) as AIModeConversation;
            if (data && Array.isArray(data.turns)) {
                const beforeCount = data.turns.length;
                finalTurns = mergeTurns(data.turns, activeTurns);
                log(`Merged turns: storedCount=${beforeCount}, activeCount=${activeTurns.length} => finalCount=${finalTurns.length}`);
                merged = true;
            }
        } catch (err: any) {
            log(`Failed to read/merge existing session file: ${err.message}. Overwriting instead.`, 'warn');
        }
    }

    const conversationData: AIModeConversation = {
        query: finalTurns[0]?.content || 'Active AI Mode Session',
        url: currentUrl,
        id: conversationId,
        turns: finalTurns,
        sources: [], // Scraped separately if needed, or left empty for direct history sync
        capturedAt: Date.now()
    };

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(conversationData, null, 2), 'utf-8');
    log(`Saved active session turns to: ${targetFile}`);

    return {
        filePath: targetFile,
        turnCount: finalTurns.length,
        merged
    };
}
