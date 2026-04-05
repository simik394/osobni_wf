import { UniversalContext, AIModeActionDeps } from '../types';

/**
 * Represents a single AI Mode conversation entry from history.
 */
export interface AIModeHistoryEntry {
    /** The user's original query */
    query: string;
    /** URL to revisit the conversation (contains mstk token) */
    url: string;
    /** Extracted conversation ID / mstk token */
    id: string | null;
    /** Timestamp string from My Activity (if available) */
    timestamp?: string;
}

/**
 * Represents a fully extracted AI Mode conversation.
 */
export interface AIModeConversation {
    query: string;
    url: string;
    id: string;
    turns: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: number }>;
    sources: Array<{ url: string; title: string; domain: string }>;
    capturedAt: number;
}

/**
 * Lists AI Mode history entries from the sidebar.
 * Requires the page to already be at google.com/?udm=50.
 */
export async function listAIModeHistoryAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    options: { limit?: number } = {}
): Promise<AIModeHistoryEntry[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 20 } = options;

    log('Listing AI Mode history from sidebar...');

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

    // Handle possible consent dialogs
    try {
        const acceptBtn = page.locator(selectors.aiMode.auth?.acceptAll || selectors.gemini.auth.acceptAll).first();
        if (await acceptBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await acceptBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch (e) { /* no consent dialog */ }

    // Open sidebar
    const sidebarTrigger = page.locator(selectors.aiMode.sidebar.trigger).first();
    if (await sidebarTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
        log('Opening AI Mode history sidebar...');
        await sidebarTrigger.click();
        await page.waitForTimeout(1500);
    } else {
        log('AI Mode sidebar trigger not found. Page may not be in AI Mode.', 'warn');
    }

    // Collect history items
    const entries: AIModeHistoryEntry[] = [];
    const items = page.locator(selectors.aiMode.sidebar.historyItem);
    let count = await items.count();

    // Try to load more if needed
    let retries = 0;
    while (count < limit && retries < 3) {
        const showMore = page.locator(selectors.aiMode.sidebar.showMore).first();
        if (await showMore.isVisible().catch(() => false)) {
            await showMore.click();
            await page.waitForTimeout(1500);
            const newCount = await items.count();
            if (newCount === count) retries++;
            count = newCount;
        } else {
            break;
        }
    }

    const end = Math.min(count, limit);
    for (let i = 0; i < end; i++) {
        const item = items.nth(i);
        const text = await item.innerText().catch(() => '');
        const query = text.split('\n')[0].trim();

        if (query) {
            entries.push({
                query,
                url: '', // Populated when clicked
                id: null,
            });
        }
    }

    log(`Found ${entries.length} AI Mode history entries`);
    return entries;
}

/**
 * Lists AI Mode history from My Activity page (product=83).
 * More comprehensive than sidebar - gives actual URLs.
 */
export async function listAIModeMyActivityAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    options: { limit?: number } = {}
): Promise<AIModeHistoryEntry[]> {
    const { page, log } = ctx;
    const { selectors } = deps;
    const { limit = 20 } = options;

    log('Navigating to My Activity (AI Mode)...');
    await page.goto(
        selectors.aiMode.myActivityUrl || 'https://myactivity.google.com/myactivity?product=83',
        { waitUntil: 'domcontentloaded', timeout: 20000 }
    );
    await page.waitForTimeout(3000);

    // Handle possible consent
    try {
        const acceptBtn = page.locator(selectors.aiMode.auth?.acceptAll || selectors.gemini.auth.acceptAll).first();
        if (await acceptBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await acceptBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch (e) { /* ignore */ }

    const entries: AIModeHistoryEntry[] = [];
    const activityItems = page.locator(selectors.aiMode.myActivity.activityItem);

    // Scroll to load more items if needed
    let count = await activityItems.count();
    let retries = 0;
    while (count < limit && retries < 5) {
        const lastItem = activityItems.last();
        if (await lastItem.isVisible().catch(() => false)) {
            await lastItem.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(2000);
        }
        const newCount = await activityItems.count();
        if (newCount === count) retries++;
        else retries = 0;
        count = newCount;
    }

    const end = Math.min(count, limit);
    log(`Found ${count} activity items, processing ${end}...`);

    for (let i = 0; i < end; i++) {
        const item = activityItems.nth(i);
        const href = await item.getAttribute('href').catch(() => null);
        const text = await item.innerText().catch(() => '');
        const query = text.replace(/^Vyhledali jste:\s*/i, '').replace(/^You searched for:\s*/i, '').trim();

        // Extract mstk token as conversation ID
        let id: string | null = null;
        if (href) {
            const mstkMatch = href.match(/mstk=([^&]+)/);
            if (mstkMatch) id = mstkMatch[1];
            // Fallback: use query hash
            if (!id) {
                const qMatch = href.match(/[?&]q=([^&]+)/);
                if (qMatch) id = `q_${decodeURIComponent(qMatch[1]).replace(/\s+/g, '_').substring(0, 40)}`;
            }
        }

        if (query) {
            entries.push({
                query,
                url: href || '',
                id,
            });
        }
    }

    log(`Extracted ${entries.length} AI Mode history entries from My Activity`);
    return entries;
}

/**
 * Extracts the content of a specific AI Mode conversation by navigating to its URL.
 */
export async function extractAIModeConversationAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    entry: AIModeHistoryEntry
): Promise<AIModeConversation | null> {
    const { page, log } = ctx;
    const { selectors } = deps;

    if (!entry.url) {
        log(`No URL for entry: "${entry.query}", skipping extraction`, 'warn');
        return null;
    }

    log(`Extracting conversation: "${entry.query.substring(0, 50)}..."`);

    try {
        await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(3000);

        const turns: AIModeConversation['turns'] = [];
        const sources: AIModeConversation['sources'] = [];

        // Extract user query (first turn)
        turns.push({ role: 'user', content: entry.query });

        // Extract AI response
        const responseSelectors = (selectors.aiMode.conversation?.aiResponse || '.V696v, .g, .kp-blk, .IZ6rdc').split(',').map((s: string) => s.trim());
        let responseText = '';

        for (const sel of responseSelectors) {
            const responseEl = page.locator(sel).first();
            if (await responseEl.isVisible({ timeout: 2000 }).catch(() => false)) {
                // Use innerHTML -> markdown conversion for richer content
                const html = await responseEl.innerHTML().catch(() => '');
                responseText = htmlToMarkdown(html);
                if (responseText.length > 50) break; // Good enough
            }
        }

        if (!responseText) {
            // Fallback: grab all visible text from the main content area
            responseText = await page.locator('main, #main, #center_col, .hlcw0c').first()
                .innerText()
                .catch(() => '');
        }

        if (responseText) {
            turns.push({ role: 'assistant', content: responseText.trim() });
        }

        // Extract source links
        const sourceLinks = page.locator(selectors.aiMode.conversation?.sourceChip || 'a[data-ved]');
        const sourceCount = await sourceLinks.count();
        const seen = new Set<string>();
        for (let i = 0; i < Math.min(sourceCount, 30); i++) {
            const href = await sourceLinks.nth(i).getAttribute('href').catch(() => null);
            const title = await sourceLinks.nth(i).innerText().catch(() => '');
            if (href && !seen.has(href) && !href.includes('google.com/search')) {
                seen.add(href);
                let domain = '';
                try { domain = new URL(href).hostname; } catch { }
                sources.push({ url: href, title: title.trim(), domain });
            }
        }

        return {
            query: entry.query,
            url: entry.url,
            id: entry.id || `aimode_${Date.now()}`,
            turns,
            sources,
            capturedAt: Date.now(),
        };
    } catch (e: any) {
        log(`Failed to extract conversation "${entry.query}": ${e.message}`, 'error');
        return null;
    }
}

/**
 * Syncs AI Mode history to GraphStore.
 * Combines listing (from My Activity) with per-conversation extraction.
 */
export async function syncAIModeHistoryAction(
    ctx: UniversalContext,
    deps: AIModeActionDeps,
    options: { limit?: number; extractContent?: boolean } = {}
): Promise<{ synced: number; skipped: number; errors: number }> {
    const { log } = ctx;
    const { limit = 20, extractContent = true } = options;
    const stats = { synced: 0, skipped: 0, errors: 0 };

    // 1. Get entries from My Activity (has URLs)
    const entries = await listAIModeMyActivityAction(ctx, deps, { limit });

    if (entries.length === 0) {
        log('No AI Mode history entries found');
        return stats;
    }

    // 2. Get GraphStore
    const graphStore = deps.getGraphStore?.();
    if (!graphStore) {
        log('GraphStore not available, will only list entries', 'warn');
        for (const e of entries) {
            console.log(`  [AI Mode] ${e.query} (${e.id || 'no-id'})`);
        }
        stats.synced = entries.length;
        return stats;
    }

    // 3. For each entry, check if already synced, then extract & store
    for (const entry of entries) {
        if (!entry.id) {
            log(`Skipping entry without ID: "${entry.query}"`, 'warn');
            stats.skipped++;
            continue;
        }

        // Check if already in DB
        try {
            const state = await graphStore.getConversationState(entry.id, 'aimode');
            if (state.exists) {
                log(`Already synced: "${entry.query}" (${entry.id})`);
                stats.skipped++;
                continue;
            }
        } catch (e) {
            // getConversationState might not support 'aimode' yet, proceed anyway
        }

        if (extractContent) {
            const conversation = await extractAIModeConversationAction(ctx, deps, entry);
            if (conversation) {
                try {
                    await graphStore.syncConversation({
                        platform: 'aimode',
                        platformId: conversation.id,
                        title: conversation.query,
                        type: 'regular',
                        turns: conversation.turns,
                    });
                    stats.synced++;
                    log(`Synced: "${entry.query}"`);
                } catch (e: any) {
                    log(`Failed to store "${entry.query}": ${e.message}`, 'error');
                    stats.errors++;
                }
            } else {
                stats.errors++;
            }
        } else {
            // Just store metadata without content extraction
            try {
                await graphStore.syncConversation({
                    platform: 'aimode',
                    platformId: entry.id,
                    title: entry.query,
                    type: 'regular',
                    turns: [{ role: 'user', content: entry.query }],
                });
                stats.synced++;
            } catch (e: any) {
                log(`Failed to store "${entry.query}": ${e.message}`, 'error');
                stats.errors++;
            }
        }

        // Rate limiting
        if (deps.humanDelay) {
            await deps.humanDelay(800, 400);
        } else {
            await ctx.page.waitForTimeout(800);
        }
    }

    log(`Sync complete: ${stats.synced} synced, ${stats.skipped} skipped, ${stats.errors} errors`);
    return stats;
}

// --- Utility ---

/**
 * Simple HTML to markdown converter for AI Mode responses.
 */
function htmlToMarkdown(html: string): string {
    if (!html) return '';

    return html
        // Headings
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
        // Bold/Italic
        .replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '**$2**')
        .replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '*$2*')
        // Code blocks
        .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n')
        .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
        // Lists
        .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
        .replace(/<\/?[uo]l[^>]*>/gi, '\n')
        // Links
        .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
        // Paragraphs / line breaks
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        // Strip remaining tags
        .replace(/<[^>]+>/g, '')
        // Fix whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
