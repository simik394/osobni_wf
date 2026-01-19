
import { Page, Locator } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { getRegistry } from './artifact-registry';
import { getRsrchTelemetry } from '@agents/shared';
import { selectors } from './selectors';

// Get telemetry instance
const telemetry = getRsrchTelemetry();

export interface DeepResearchResult {
    query: string;
    googleDocId?: string;
    googleDocUrl?: string;
    googleDocTitle?: string;
    status: 'completed' | 'failed' | 'cancelled';
    error?: string;
    // Artifact Registry IDs
    registrySessionId?: string;  // e.g., "A1D"
    registryDocId?: string;      // e.g., "A1D-01"
}

export interface ResearchInfo {
    title: string | null;        // Session title (short name)
    firstHeading: string | null; // First heading in the document
    sessionId: string | null;
}

// === Parsed Research Types ===
export interface Citation {
    id: number;
    text: string;
    url: string;
    domain: string;
    usedInSections: string[];
}

export interface ReasoningStep {
    phase: string;
    action: string;
    timestamp?: string;
}

export interface FlowNode {
    id: string;
    type: 'query' | 'source' | 'thought' | 'conclusion';
    label: string;
    links: string[]; // IDs of connected nodes
}

export interface ParsedResearch {
    title: string;
    query: string;
    content: string;           // Plain text
    contentHtml: string;       // HTML with structure
    contentMarkdown: string;   // Converted to markdown
    headings: string[];
    citations: Citation[];
    reasoningSteps: ReasoningStep[];
    researchFlow: FlowNode[];
    createdAt: string;
}

// === Scraped Conversation Types ===

export interface ScrapedTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
}

export interface ScrapedResearchDoc {
    title: string;
    content: string;  // With footnotes for citations
    sources: Array<{ id: number; text: string; url: string; domain: string }>;
    reasoningSteps: Array<{ phase: string; action: string }>;
}

export interface ScrapedConversation {
    platformId: string;
    title: string;
    type: 'regular' | 'deep-research';
    turns: ScrapedTurn[];
    researchDocs?: ScrapedResearchDoc[];
    capturedAt: number;
}

// === Gem Configuration Types ===
export interface GemConfig {
    name: string;
    instructions: string;  // System prompt
    files?: string[];      // Paths to files to upload
    greeting?: string;     // Optional greeting message
}

export interface GemInfo {
    name: string;
    id: string | null;     // URL ID if extractable
    description?: string;
    isCustom?: boolean;
}

export class GeminiClient extends EventEmitter {
    private verbose: boolean = false;
    private deepResearchEnabled = false;

    constructor(private page: Page, options: { verbose?: boolean } = {}) {
        super();
        this.verbose = options.verbose || false;
    }

    private log(message: string) {
        if (this.verbose) {
            console.log(`[Gemini] ${message}`);
        }
    }

    // Emit progress events for SSE streaming (always emits, unlike log which respects verbose)
    public progress(message: string, phase?: string) {
        const logMsg = `[Gemini] ${message}`;
        console.log(logMsg);
        this.emit('progress', { type: 'log', message: logMsg, phase, timestamp: Date.now() });
    }

    async init(sessionId?: string) {
        this.progress('Initializing...', 'init');

        const targetUrl = sessionId
            ? `https://gemini.google.com/app/${sessionId}`
            : 'https://gemini.google.com/app';
        this.progress(`Navigating to: ${targetUrl}`, 'init');
        await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

        await this.page.waitForTimeout(1500);

        // Handle Google cookie consent dialog ("Before you continue to Google")
        const acceptAllButtons = this.page.locator(selectors.gemini.auth.acceptAll);
        if (await acceptAllButtons.count() > 0) {
            this.progress('Cookie consent detected, clicking Accept all...', 'init');
            await acceptAllButtons.first().click().catch(() => { });
            await this.page.waitForTimeout(2000);
        }

        // Handle "Stay in the loop" / "Try Gemini Advanced" / "Ne, díky" popups

        const dismissButtons = this.page.locator(selectors.gemini.auth.dismiss);
        if (await dismissButtons.count() > 0) {
            this.progress('Advertising/promo popup detected, clicking dismiss...', 'init');
            // Iterate and click visible ones
            const count = await dismissButtons.count();
            for (let i = 0; i < count; i++) {
                if (await dismissButtons.nth(i).isVisible()) {
                    await dismissButtons.nth(i).click().catch(() => { });
                    await this.page.waitForTimeout(500);
                }
            }
            await this.page.waitForTimeout(1000);
        }

        const signInButton = this.page.locator(selectors.gemini.auth.signIn);
        if (await signInButton.count() > 0) {
            console.warn('[Gemini] Sign in required.');
            await this.dumpState('gemini_auth_required');
            throw new Error('Gemini requires authentication. Please run rsrch auth first.');
        }

        const closeButtons = this.page.locator(selectors.gemini.auth.welcome);
        if (await closeButtons.count() > 0) {
            await closeButtons.first().click().catch(() => { });
            await this.page.waitForTimeout(500);
        }

        try {
            // Broader selector to handle Gemini UI variations
            await this.page.waitForSelector(selectors.gemini.chat.app, { timeout: 15000 });
        } catch (e) {
            // Check if we're on a valid Gemini page anyway (sidebar visible)
            const sidebarVisible = await this.page.locator(selectors.gemini.chat.history).count() > 0;
            if (sidebarVisible) {
                this.progress('Sidebar visible, proceeding despite input element not found.', 'init');
            } else {
                console.warn('[Gemini] Timeout waiting for chat interface.');
                await this.dumpState('gemini_init_fail');
                throw e;
            }
        }

        this.progress('Ready.', 'init');
    }

    /**
     * Check authentication status and handle basic popups
     */
    async checkAuth(): Promise<void> {
        // If sign in button is visible, we are definitely not logged in
        if (await this.page.locator(selectors.gemini.auth.signIn).count() > 0) {
            throw new Error('Gemini requires authentication.');
        }

        // Handle occasional popups that might appear during session
        const dismissButtons = this.page.locator(selectors.gemini.auth.dismiss);
        if (await dismissButtons.count() > 0) {
            await dismissButtons.first().click().catch(() => { });
            await this.page.waitForTimeout(500);
        }
    }

    /**
     * Resets the current session to a new chat.
     * Use this before starting a new request to ensure a clean state
     * (e.g. to disable Deep Research mode from previous session).
     */
    async resetToNewChat(): Promise<void> {
        console.log('[Gemini] Resetting to new chat...');

        // 1. Check if we are already on the new chat page (URL ends with /app)
        const url = this.page.url();
        if (url === 'https://gemini.google.com/app' || url === 'https://gemini.google.com/app/') {
            // Even if URL is correct, we might have text in input or old state.
            // Best to still click "New Chat" if visible to be sure.
        }

        // 2. Try clicking "New Chat" button
        let clicked = false;
        const newChatBtn = this.page.locator(selectors.gemini.chat.newChat).first();
        if (await newChatBtn.isVisible().catch(() => false)) {
            console.log(`[Gemini] Clicking New Chat...`);
            await newChatBtn.click();
            clicked = true;
        }

        if (!clicked) {
            console.log('[Gemini] New Chat button not found, forcing navigation to /app');
            await this.page.goto('https://gemini.google.com/app');
        }

        // 3. Wait for standard greeting or empty state
        try {
            // Wait for URL to stabilize
            await this.page.waitForURL('https://gemini.google.com/app', { timeout: 5000 }).catch(() => { });

            // Wait for empty input
            const input = this.page.locator('div[contenteditable="true"], textarea').first();
            await input.waitFor({ state: 'visible', timeout: 5000 });

            // Optional: Check if Deep Research toggle is off? 
            // Hard to detect "off" state reliably, but new chat should default to off.
            this.deepResearchEnabled = false;

        } catch (e) {
            console.warn('[Gemini] Wait for new chat state timed out, but proceeding.');
        }

        console.log('[Gemini] Reset complete.');
    }

    getCurrentSessionId(): string | null {
        const url = this.page.url();
        const match = url.match(/\/app\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    async openSession(sessionId: string): Promise<void> {
        const url = `https://gemini.google.com/app/${sessionId}`;
        console.log(`[Gemini] Navigating to: ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.page.waitForTimeout(2000);
    }

    async listSessions(limit: number = 20, offset: number = 0): Promise<{ name: string; id: string | null }[]> {
        const sessions: { name: string; id: string | null }[] = [];
        try {
            // Ensure sidebar is visible - sometimes hidden
            const menuButton = this.page.locator(selectors.gemini.sidebar.menu).first();
            if (await menuButton.count() > 0) {
                // Assuming visible for now
            }

            // Wait for history loading spinner
            try {
                await this.page.waitForSelector(selectors.gemini.chat.history, { timeout: 5000 }).catch(() => { });
                const spinner = this.page.locator('.loading-history-spinner-container');
                if (await spinner.count() > 0) {
                    console.log('[Gemini] Waiting for history spinner to disappear...');
                    await spinner.last().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => console.log('[Gemini] Spinner wait timed out'));
                }
            } catch (e) {
                // Ignore
            }

            const targetCount = offset + limit;
            console.log(`[Gemini] listing sessions (limit: ${limit}, offset: ${offset}, target: ${targetCount})...`);

            let sessionItems = this.page.locator(selectors.gemini.sidebar.conversations);
            if (await sessionItems.count() > 0) {
                console.log(`[Gemini] Found sessions using selector: ${await sessionItems.first().evaluate(el => el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').join('.') : ''))} `);
                await this.dumpState('debug_session_list');
            }

            // DEBUG: Dump sidebar HTML to debug missing sessions
            const sidebarContainer = this.page.locator(selectors.gemini.chat.history).first();
            if (await sidebarContainer.isVisible()) {
                console.log('[Gemini] DEBUG: Sidebar Container HTML:');
                console.log(await sidebarContainer.innerHTML().catch(() => 'Could not read sidebar HTML'));
            } else {
                console.log('[Gemini] DEBUG: Sidebar container not found using .chat-history-list or nav label.');
                const nav = this.page.locator('nav').first();
                if (await nav.isVisible()) {
                    console.log('[Gemini] DEBUG: Generic nav HTML:');
                    console.log(await nav.innerHTML().catch(() => 'Could not read nav HTML'));
                }
            }
            console.log('[Gemini] DEBUG: DOM Dump for Sidebar:');
            // Try to locate the sidebar container and dump its HTML
            const sidebar = this.page.locator('nav, [role="navigation"]').first();
            if (await sidebar.isVisible()) {
                console.log(await sidebar.innerHTML().catch(() => 'Sidebar found but could not read HTML'));
            } else {
                console.log('No navigation/sidebar found visible.');
            }


            let count = await sessionItems.count();

            // Scroll to load more if needed
            let retries = 0;
            while (count < targetCount && retries < 5) {
                const preCount = count;
                const lastItem = sessionItems.last();
                if (await lastItem.isVisible()) {
                    await lastItem.scrollIntoViewIfNeeded();
                    await this.page.waitForTimeout(1000); // Give time for infinite scroll
                }

                // Check if "show more" button exists (for deep history)
                const showMore = this.page.locator(selectors.gemini.sidebar.showMore).first();
                if (await showMore.isVisible()) {
                    console.log('[Gemini] Clicking "Show more"...');
                    await showMore.click();
                    await this.page.waitForTimeout(1000);
                }

                // Refresh selector count
                sessionItems = this.page.locator(selectors.gemini.sidebar.conversations);

                count = await sessionItems.count();
                console.log(`[Gemini] Loaded ${count} sessions (Goal: ${targetCount})...`);

                if (count === preCount) {
                    retries++;
                } else {
                    retries = 0;
                }
            }

            await this.dumpState('debug_session_list_final');

            // Define range to extract
            const start = Math.min(offset, count);
            const end = Math.min(offset + limit, count);

            if (start >= count) {
                console.log('[Gemini] Offset beyond available sessions.');
                return [];
            }

            for (let i = start; i < end; i++) {
                const item = sessionItems.nth(i);
                // Get name - often includes time or "Pinned", might need cleaning
                let name = await item.innerText().catch(() => '');
                name = name.split('\n')[0]; // Take first line usually

                // ID is hard to get without clicking. We might try to parse it if we can find a link
                // But for now, we just list the names.
                // If we really need IDs, we'd have to crawl.
                // Let's see if there's an anchor tag nearby?
                // Subagent found no anchors. So ID is null unless we are currently ON that page.

                let id: string | null = null;

                // Try to extract ID from jslog attribute
                // Format: ... ["c_ID", ...]
                const jslog = await item.getAttribute('jslog').catch(() => null);
                if (jslog) {
                    const match = jslog.match(/\["c_([a-zA-Z0-9]+)"/);
                    if (match) {
                        id = match[1];
                    }
                }

                // Fallback: Check if active/selected
                if (!id) {
                    const isActive = await item.getAttribute('class').then(c => c?.includes('selected')).catch(() => false);
                    if (isActive) {
                        id = this.getCurrentSessionId();
                    }
                }

                if (name.trim()) {
                    sessions.push({ name: name.trim(), id });
                }
            }
        } catch (e) {
            console.warn('[Gemini] Error listing sessions:', e);
        }

        console.log(`[Gemini] Found ${sessions.length} sessions(Request: ${offset} - ${offset + limit})`);
        return sessions;
    }

    /**
     * Crawls the "My Content" section to find Deep Research documents.
     * Deep Research docs are in library-item-card elements, not conversation elements.
     */
    async listDeepResearchDocuments(limit: number = 10): Promise<ResearchInfo[]> {
        const docs: ResearchInfo[] = [];
        console.log(`[Gemini] Looking for Deep Research documents (limit: ${limit})...`);

        try {
            // Ensure we are on the main app page or a session page
            if (!this.page.url().includes('gemini.google.com/app')) {
                console.log('[Gemini] Navigating to main app for research docs...');
                await this.page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
            }

            // Wait for page to fully load
            await this.page.waitForTimeout(2000);

            // First, try to expand the sidebar if needed by clicking the menu button
            const menuButton = this.page.locator('button[aria-label*="nabídka"], button[aria-label*="menu"], button[aria-label*="Menu"]').first();
            if (await menuButton.count() > 0) {
                try {
                    await menuButton.click({ timeout: 2000 });
                    await this.page.waitForTimeout(1000);
                    console.log('[Gemini] Clicked menu button to expand sidebar');
                } catch (e) {
                    // Sidebar might already be expanded
                }
            }

            // Try to expand "My Stuff" / "Můj obsah" section (note: English label is "My Stuff", not "My Content")
            const myContentSection = this.page.locator('text=/Můj obsah|My Stuff|My stuff/i').first();
            if (await myContentSection.count() > 0) {
                try {
                    await myContentSection.click({ timeout: 2000 });
                    await this.page.waitForTimeout(1000);
                    console.log('[Gemini] Clicked "My Stuff" section');
                } catch (e) {
                    // Section might already be expanded
                }
            }

            // Wait for library items to render with proper dimensions
            await this.page.waitForTimeout(1500);

            // Deep Research documents are in library-item-card elements
            // Use JavaScript to find visible items (width > 0) since collapsed items have width=0
            const visibleCount = await this.page.evaluate(() => {
                const items = document.querySelectorAll('div.library-item-card');
                return Array.from(items).filter(el => (el as HTMLElement).offsetWidth > 0).length;
            });
            console.log(`[Gemini] Found ${visibleCount} visible library-item-card elements`);

            if (visibleCount === 0) {
                await this.dumpState('list_docs_zero');
            }

            // Get all library items but only process visible ones
            const libraryItems = this.page.locator('div.library-item-card');
            let count = visibleCount;

            if (count > limit) count = limit;

            for (let i = 0; i < count; i++) {
                try {
                    const item = libraryItems.nth(i);

                    // Get title from .title element
                    const titleEl = item.locator('.title');
                    const title = await titleEl.innerText().catch(() => '');

                    // Try to extract session ID from jslog attribute
                    const jslog = await item.getAttribute('jslog') || '';
                    let sessionId: string | null = null;

                    // Parse session ID from jslog: look for pattern like "c_3305a180c04ec1da"
                    const match = jslog.match(/"(c_[a-f0-9]+)"/);
                    if (match) {
                        sessionId = match[1];
                    }

                    // If no session ID in jslog, try clicking and getting from URL
                    if (!sessionId && title) {
                        try {
                            await item.click({ force: true });
                            await this.page.waitForTimeout(2000);
                            const url = this.page.url();
                            // Deep Research URLs are like /gem/95da53cfcb0b/0b72911dae760a7b
                            // First segment is shared across all docs, second segment is unique
                            const urlMatch = url.match(/\/gem\/([a-f0-9]+)\/([a-f0-9]+)/);
                            if (urlMatch) {
                                // Use full path as sessionId for uniqueness
                                sessionId = `${urlMatch[1]}-${urlMatch[2]}`;
                                console.log(`[Gemini] Extracted sessionId from URL: ${sessionId}`);
                            }
                        } catch (clickErr) {
                            console.warn(`[Gemini] Could not click item ${i}: ${clickErr}`);
                        }
                    }

                    if (title) {
                        console.log(`[Gemini] Found Deep Research: ${title} (${sessionId || 'no-id'})`);
                        docs.push({
                            title: title,
                            firstHeading: null,
                            sessionId: sessionId
                        });
                    }
                } catch (err) {
                    console.warn(`[Gemini] Failed to process library item ${i}:`, err);
                }
            }

            // Also check for conversation items that might be Deep Research
            if (docs.length === 0) {
                console.log('[Gemini] No library items found, checking conversation items...');
                const convItems = this.page.locator('div.conversation[role="button"]');
                let convCount = await convItems.count();
                if (convCount > limit) convCount = limit;

                for (let i = 0; i < convCount; i++) {
                    const item = convItems.nth(i);
                    const name = await item.innerText().catch(() => '');

                    try {
                        await item.click({ force: true });
                        await this.page.waitForTimeout(2000);

                        // Check for Deep Research Panel
                        const deepResearchPanel = this.page.locator('deep-research-immersive-panel');
                        if (await deepResearchPanel.count() > 0) {
                            console.log(`[Gemini] Found Deep Research in conversation: ${name}`);
                            const info = await this.getResearchInfo();
                            if (info.title || info.firstHeading) {
                                docs.push(info);
                            }
                        }
                    } catch (err) {
                        console.warn(`[Gemini] Failed to process conversation ${i}:`, err);
                    }
                }
            }
        } catch (e) {
            console.error('[Gemini] Error listing deep research documents:', e);
        }

        console.log(`[Gemini] Total Deep Research documents found: ${docs.length}`);
        return docs;
    }

    /**
     * Scrape conversations from Gemini sidebar with pagination.
     * 
     * @param limit Maximum number of sessions to scrape
     * @param offset Starting offset in session list
     * @returns Array of scraped conversations with turns and metadata
     */
    async scrapeConversations(
        limit: number = 10,
        offset: number = 0,
        onProgress?: (data: { current: number, total: number, title: string, status: string }) => void
    ): Promise<ScrapedConversation[]> {
        const conversations: ScrapedConversation[] = [];
        console.log(`[Gemini] Scraping conversations (limit: ${limit}, offset: ${offset})...`);

        try {
            // Ensure we're on Gemini
            const url = this.page.url();
            if (!url.includes('gemini.google.com')) {
                await this.page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle' });
                await this.page.waitForTimeout(2000);
            }

            // Load sessions using existing method
            const sessions = await this.listSessions(limit, offset);
            console.log(`[Gemini] Found ${sessions.length} sessions to scrape`);

            for (let i = 0; i < sessions.length; i++) {
                const session = sessions[i];
                console.log(`[Gemini] Scraping ${i + 1}/${sessions.length}: "${session.name}"...`);

                if (onProgress) {
                    onProgress({
                        current: i + 1,
                        total: sessions.length,
                        title: session.name,
                        status: 'scraping'
                    });
                }

                try {
                    // Click to open session
                    const sessionItems = this.page.locator('div.conversation[role="button"]');
                    const targetIndex = offset + i;

                    if (await sessionItems.count() > targetIndex) {
                        await sessionItems.nth(targetIndex).click({ force: true });
                        await this.page.waitForTimeout(2000);
                    } else {
                        console.warn(`[Gemini] Session ${targetIndex} no longer available`);
                        continue;
                    }

                    // Detect session type
                    const deepResearchPanel = this.page.locator('deep-research-immersive-panel');
                    const isDeepResearch = await deepResearchPanel.count() > 0;

                    // Extract turns
                    const turns = await this.extractConversationTurns();

                    const conversation: ScrapedConversation = {
                        platformId: session.id || `gemini_${Date.now()}_${i}`,
                        title: session.name,
                        type: isDeepResearch ? 'deep-research' : 'regular',
                        turns,
                        capturedAt: Date.now()
                    };

                    // For deep research, also extract research docs
                    if (isDeepResearch) {
                        conversation.researchDocs = await this.extractResearchDocsWithSources();
                    }

                    conversations.push(conversation);
                    console.log(`[Gemini] Scraped: ${conversation.type} session with ${turns.length} turns`);

                    // Rate limiting
                    await this.page.waitForTimeout(500);

                } catch (e: any) {
                    console.error(`[Gemini] Failed to scrape session "${session.name}":`, e.message);
                }
            }

        } catch (e: any) {
            console.error('[Gemini] Error scraping conversations:', e);
        }

        console.log(`[Gemini] Scraped ${conversations.length} conversations total`);
        return conversations;
    }

    /**
     * Convert HTML content to markdown (simple version for turn extraction)
     */
    private htmlToMarkdownSimple(html: string): string {
        let md = html;

        // Handle code blocks: <pre><code class="language-xxx">...</code></pre>
        md = md.replace(/<pre[^>]*><code(?:\s+class="language-(\w+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
            (_, lang, code) => {
                const language = lang || '';
                const decoded = code
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/&quot;/g, '"')
                    .replace(/<[^>]+>/g, ''); // Strip any inner HTML tags
                return `\n\`\`\`${language}\n${decoded.trim()}\n\`\`\`\n`;
            });

        // Handle inline code: <code>...</code>
        md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
            const decoded = code
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&');
            return `\`${decoded}\``;
        });

        // Handle headings
        md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
        md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
        md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
        md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

        // Handle bold and italic
        md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
        md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
        md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
        md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

        // Handle lists
        md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
        md = md.replace(/<\/?[ou]l[^>]*>/gi, '\n');

        // Handle paragraphs and line breaks
        md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
        md = md.replace(/<br\s*\/?>/gi, '\n');
        md = md.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1\n');

        // Handle links
        md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

        // Strip remaining HTML tags
        md = md.replace(/<[^>]+>/g, '');

        // Decode HTML entities
        md = md.replace(/&nbsp;/g, ' ');
        md = md.replace(/&lt;/g, '<');
        md = md.replace(/&gt;/g, '>');
        md = md.replace(/&amp;/g, '&');
        md = md.replace(/&quot;/g, '"');
        md = md.replace(/&#39;/g, "'");

        // Clean up extra whitespace
        md = md.replace(/\n{3,}/g, '\n\n');

        return md.trim();
    }

    /**
     * Expand collapsed reasoning/thinking sections
     */
    private async expandReasoningSections(): Promise<void> {
        // Language-agnostic patterns for reasoning toggle buttons
        const reasoningPatterns = [
            'Zobrazit uvažování',  // Czech
            'Show reasoning',      // English
            'Show thinking',       // English variant
            'Zeige Überlegungen',  // German
            'Afficher le raisonnement', // French
        ];

        try {
            // Find and click any collapsed reasoning sections
            for (const pattern of reasoningPatterns) {
                const buttons = this.page.locator(`button:has-text("${pattern}"), [role="button"]:has-text("${pattern}")`);
                const count = await buttons.count();

                if (count > 0) {
                    console.log(`[Gemini] Found ${count} collapsed reasoning sections (${pattern})`);
                    for (let i = 0; i < count; i++) {
                        try {
                            await buttons.nth(i).click();
                            await this.page.waitForTimeout(300);
                        } catch (e) {
                            // Button may already be expanded or not clickable
                        }
                    }
                }
            }

            // Also try generic expand buttons near "reasoning" text
            const expandButtons = this.page.locator('[aria-expanded="false"]');
            const expandCount = await expandButtons.count();
            for (let i = 0; i < Math.min(expandCount, 10); i++) {
                const btn = expandButtons.nth(i);
                const nearby = await btn.evaluate((el) => el.closest('[class*="reason"], [class*="think"]'));
                if (nearby) {
                    await btn.click().catch(() => { });
                    await this.page.waitForTimeout(200);
                }
            }
        } catch (e: any) {
            console.warn('[Gemini] Could not expand reasoning sections:', e.message);
        }
    }

    /**
     * Extract all turns from the current conversation view
     */
    private async extractConversationTurns(): Promise<ScrapedTurn[]> {
        const turns: ScrapedTurn[] = [];

        try {
            // Wait for content to load
            await this.page.waitForTimeout(2000);

            // Expand any collapsed reasoning sections BEFORE extraction
            await this.expandReasoningSections();
            await this.page.waitForTimeout(500);

            // Scroll to load all messages
            const chatHistory = this.page.locator('infinite-scroller.chat-history, .chat-history, main');
            if (await chatHistory.count() > 0) {
                await chatHistory.first().evaluate((el: HTMLElement) => {
                    el.scrollTop = 0;
                });
                await this.page.waitForTimeout(500);
                await chatHistory.first().evaluate((el: HTMLElement) => {
                    el.scrollTop = el.scrollHeight;
                });
                await this.page.waitForTimeout(1000);
            }

            // Strategy 1: Look for user-query and model-response elements
            const userQueries = this.page.locator('user-query');
            const modelResponses = this.page.locator('model-response');

            const userCount = await userQueries.count();
            const modelCount = await modelResponses.count();

            console.log(`[Gemini] Strategy 1: Found ${userCount} user-query, ${modelCount} model-response`);

            if (userCount > 0 || modelCount > 0) {
                const maxTurns = Math.max(userCount, modelCount);
                for (let i = 0; i < maxTurns; i++) {
                    // Extract user turn (text is fine for user queries)
                    if (i < userCount) {
                        const text = await userQueries.nth(i).innerText().catch(() => '');
                        if (text.trim()) {
                            turns.push({ role: 'user', content: text.trim() });
                        }
                    }

                    // Extract assistant turn (use HTML for proper formatting)
                    if (i < modelCount) {
                        try {
                            const html = await modelResponses.nth(i).innerHTML();
                            const markdown = this.htmlToMarkdownSimple(html);
                            if (markdown.trim()) {
                                // Filter out button-only content
                                const cleaned = markdown
                                    .replace(/Zobrazit uvažování.*?(?=\n|$)/gi, '')
                                    .replace(/Show reasoning.*?(?=\n|$)/gi, '')
                                    .replace(/Show thinking.*?(?=\n|$)/gi, '')
                                    .trim();
                                if (cleaned.length > 10) {
                                    turns.push({ role: 'assistant', content: cleaned });
                                }
                            }
                        } catch (e) {
                            // Fallback to innerText
                            const text = await modelResponses.nth(i).innerText().catch(() => '');
                            if (text.trim()) {
                                turns.push({ role: 'assistant', content: text.trim() });
                            }
                        }
                    }
                }
                return turns;
            }

            // Strategy 2: Look for conversation-turn elements
            const conversationTurns = this.page.locator('conversation-turn, [class*="turn"], [class*="message"]');
            const turnCount = await conversationTurns.count();
            console.log(`[Gemini] Strategy 2: Found ${turnCount} conversation-turn elements`);

            if (turnCount > 0) {
                for (let i = 0; i < turnCount; i++) {
                    const el = conversationTurns.nth(i);
                    const html = await el.innerHTML().catch(() => '');
                    const className = await el.getAttribute('class') || '';
                    const isUser = className.includes('user') || className.includes('query') || html.includes('user-query');

                    const markdown = this.htmlToMarkdownSimple(html);
                    if (markdown.trim().length > 10) {
                        turns.push({
                            role: isUser ? 'user' : 'assistant',
                            content: markdown.trim()
                        });
                    }
                }
                return turns;
            }

            // Strategy 3: Fallback to raw text
            const chatContent = await chatHistory.first().innerText().catch(() => '');
            if (chatContent && chatContent.length > 50) {
                console.log(`[Gemini] Strategy 3: Parsing chat-history text (${chatContent.length} chars)`);
                turns.push({ role: 'assistant', content: chatContent.trim() });
            }

        } catch (e: any) {
            console.error('[Gemini] Error extracting turns:', e.message);
        }

        return turns;
    }

    /**
     * Extract research documents from deep research panel with sources and citations
     */
    private async extractResearchDocsWithSources(): Promise<ScrapedResearchDoc[]> {
        const docs: ScrapedResearchDoc[] = [];

        try {
            // Get content, citations, and reasoning separately
            const contentResult = await this.extractContent();
            const citations = await this.extractCitations();
            const reasoningSteps = await this.extractReasoningSteps();

            // Get title from first heading or page title
            const title = contentResult.headings[0] || await this.page.title().catch(() => '') || 'Research Document';

            // Convert inline citation markers [1] to Obsidian footnotes [^1]
            let contentWithFootnotes = contentResult.content;
            for (const citation of citations) {
                // Replace [1], [2], etc. with [^1], [^2]
                const marker = new RegExp(`\\[${citation.id}\\]`, 'g');
                contentWithFootnotes = contentWithFootnotes.replace(marker, `[^${citation.id}]`);
            }

            // Add footnote definitions at the end
            if (citations.length > 0) {
                contentWithFootnotes += '\n\n---\n\n';
                for (const c of citations) {
                    contentWithFootnotes += `[^${c.id}]: [${c.text}](${c.url}) - ${c.domain}\n`;
                }
            }

            docs.push({
                title,
                content: contentWithFootnotes,
                sources: citations.map(c => ({
                    id: c.id,
                    text: c.text,
                    url: c.url,
                    domain: c.domain
                })),
                reasoningSteps: reasoningSteps.map(s => ({
                    phase: s.phase,
                    action: s.action
                }))
            });

        } catch (e: any) {
            console.error('[Gemini] Error extracting research docs:', e.message);
        }

        return docs;
    }

    async exportCurrentToGoogleDocs(): Promise<{ docId: string | null; docUrl: string | null; docTitle: string | null }> {
        return this.exportToGoogleDocs();
    }

    /**
     * Get extracted info from the current Deep Research session (latest document)
     */
    async getResearchInfo(): Promise<ResearchInfo> {
        const docs = await this.getAllResearchDocsInSession();
        return docs.length > 0 ? docs[docs.length - 1] : { title: null, firstHeading: null, sessionId: this.getCurrentSessionId() };
    }

    /**
     * Get all deep research documents in the current session
     */
    async getAllResearchDocsInSession(): Promise<ResearchInfo[]> {
        console.log('[Gemini] Extracting all research docs from session...');
        const sessionId = this.getCurrentSessionId();
        const docs: ResearchInfo[] = [];

        try {
            // Wait for content (either standard or deep research)
            await this.page.waitForTimeout(1000);

            // Deep Research panels
            const panels = this.page.locator('deep-research-immersive-panel');
            const count = await panels.count();

            if (count > 0) {
                console.log(`[Gemini] Found ${count} Deep Research panels.`);
                for (let i = 0; i < count; i++) {
                    const panel = panels.nth(i);

                    // Title in toolbar
                    const titleEl = panel.locator('h2.title-text').first();
                    let title = await titleEl.innerText().catch(() => null);

                    if (!title) {
                        // Fallback title extraction
                        title = await this.page.title().then(t => t.replace('Gemini - ', '').trim()).catch(() => null);
                    }

                    // First heading in content
                    const firstH1 = panel.locator('message-content h1').first();
                    let firstHeading = await firstH1.innerText().catch(() => null);

                    if (firstHeading) {
                        firstHeading = firstHeading.split('\n')[0].trim();
                    }

                    docs.push({
                        title,
                        firstHeading,
                        sessionId
                    });
                }
            } else {
                // Fallback: Extract from last model response if available
                const responses = this.page.locator(selectors.gemini.chat.response);
                if (await responses.count() > 0) {
                    const last = responses.last();
                    const fullText = await last.innerText().catch(() => '');

                    if (fullText.length > 50) {
                        let title: string | null = null;
                        let firstHeading: string | null = null;

                        const pageTitle = await this.page.title();
                        if (pageTitle) {
                            title = pageTitle.replace('Gemini - ', '').replace(' - Google', '').trim();
                        }

                        // Try to find first H1 in content
                        const h1 = last.locator('h1').first();
                        if (await h1.count() > 0) {
                            firstHeading = await h1.innerText().catch(() => null);
                        } else {
                            // Heuristic: First long line
                            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 20);
                            if (lines.length > 0) firstHeading = lines[0];
                        }

                        if (firstHeading) firstHeading = firstHeading.split('\n')[0].trim();

                        docs.push({
                            title,
                            firstHeading,
                            sessionId
                        });
                    }
                }
            }

        } catch (e) {
            console.warn('[Gemini] Error extracting research docs:', e);
        }

        return docs;
    }

    /**
     * Upload a file to the current Gemini chat session.
     * 
     * Supports: PDFs, images, text files, and other document types.
     * Uses the attachment button (+ icon) near the input area.
     * 
     * @param filePath - Absolute path to the file to upload
     * @returns true if upload succeeded, false otherwise
     */
    async setModel(modelName: string): Promise<boolean> {
        console.log(`[Gemini] Switching model to: ${modelName}`);
        try {
            // 1. Click model dropdown trigger
            const trigger = this.page.locator(selectors.gemini.model.trigger).first();
            if (!await trigger.isVisible()) {
                console.warn('[Gemini] Primary model trigger selector failed, trying getByRole fallback...');
                const fallbackTrigger = this.page.getByRole('button', { name: /Změnit model|Otevřít výběr|Change model|Open mode/i });

                // Also try clicking the wrapper div if button fails
                const wrapperDiv = this.page.locator('div[aria-label*="Otevřít výběr režimu" i], div[aria-label*="Změnit model" i]').first();

                if (await fallbackTrigger.isVisible()) {
                    await fallbackTrigger.click();
                } else if (await wrapperDiv.isVisible()) {
                    console.log('[Gemini] Clicking model wrapper div...');
                    await wrapperDiv.click();
                } else {
                    console.warn('[Gemini] Model selector user trigger not found (primary and fallback)');
                    await this.dumpState('model_trigger_missing');
                    return false;
                }
            } else {
                await trigger.click();
            }
            await this.page.waitForTimeout(1000);

            // 2. Select model based on name
            let targetSelector = '';
            const name = modelName.toLowerCase();

            if (name.includes('flash') || name.includes('rych')) {
                targetSelector = selectors.gemini.model.flash;
            } else if (name.includes('think') || name.includes('mysl')) {
                targetSelector = selectors.gemini.model.thinking;
            } else if (name.includes('pro')) {
                targetSelector = selectors.gemini.model.pro;
            } else {
                console.warn(`[Gemini] Unknown model nickname: ${modelName}, trying direct text match`);
                targetSelector = `text="${modelName}"`;
            }

            const modelOption = this.page.locator(targetSelector).first();
            // Wait for option to appear
            try { await modelOption.waitFor({ state: 'visible', timeout: 5000 }); } catch (e) { }

            if (await modelOption.count() > 0) {
                await modelOption.click();
                console.log(`[Gemini] Selected model: ${modelName}`);
                await this.page.waitForTimeout(1000); // Wait for switch
                return true;
            } else {
                // Try JS Click as last resort
                const jsClickSuccess = await this.page.evaluate((modelKey) => {
                    // Try looking for data-test-id based on model name keywords
                    if (modelKey.includes('flash') || modelKey.includes('rych')) {
                        const el = document.querySelector('[data-test-id*="bard-mode-option-rychl"]') as HTMLElement;
                        if (el) { el.click(); return true; }
                    }
                    if (modelKey.includes('think') || modelKey.includes('mysl')) {
                        const el = document.querySelector('[data-test-id*="bard-mode-option-s"]') as HTMLElement;
                        if (el) { el.click(); return true; }
                    }
                    if (modelKey.includes('pro')) {
                        const el = document.querySelector('[data-test-id*="bard-mode-option-pro"]') as HTMLElement;
                        if (el) { el.click(); return true; }
                    }
                    return false;
                }, name);

                if (jsClickSuccess) {
                    console.log(`[Gemini] Selected model via JS: ${modelName}`);
                    await this.page.waitForTimeout(1000);
                    return true;
                }

                console.error(`[Gemini] Model option not found for: ${modelName}`);
                await this.dumpState('model_option_missing');
                // Close menu if open
                await this.page.keyboard.press('Escape');
                return false;
            }
        } catch (e: any) {
            console.error(`[Gemini] Error setting model: ${e.message}`);
            return false;
        }
    }

    /**
     * Upload files to the current Gemini chat session.
     */
    async uploadFiles(filePaths: string[]): Promise<boolean> {
        try {
            console.log(`[Gemini] Uploading ${filePaths.length} files...`);

            // 1. Open "+" menu
            const plusBtn = this.page.locator(selectors.gemini.upload.button).first();
            try {
                // Try primary selector
                await plusBtn.waitFor({ state: 'visible', timeout: 3000 });
                await plusBtn.click();
            } catch (e) {
                console.warn('[Gemini] Primary upload selector failed, trying getByRole fallback...');
                // Fallback to robust role-based location
                const fallbackBtn = this.page.getByRole('button', { name: /nahrávání|Upload|Přidat|Attach|Add/i }).first();
                if (await fallbackBtn.isVisible()) {
                    await fallbackBtn.click();
                } else {
                    console.error('[Gemini] Upload (+) button not visible (primary and fallback)');
                    await this.dumpState('upload_btn_missing');
                    return false;
                }
            }
            await this.page.waitForTimeout(1000);

            // 2. Choose "Upload files" / "Nahrát soubory"
            // Note: The input[type="file"] might be hidden but accessible. 
            // Often clicking the menu item triggers the system dialog, which we must intercept with setInputFiles.
            // BETTER: Directly attach to the input[type="file"] if present in DOM, 
            // but usually it's better to use the specific menu flow if the input is created dynamically.

            // Checking if file input is available directly or after clicking "Upload files"
            let fileInput = this.page.locator(selectors.gemini.upload.fileInput).first();

            // First try hidden file input with data-test-id (most reliable)
            const hiddenFileInput = this.page.locator('[data-test-id="hidden-local-file-upload-button"] input[type="file"], [data-test-id*="file-upload"] input[type="file"], input[type="file"]').first();
            if (await hiddenFileInput.count() > 0) {
                console.log('[Gemini] Found hidden file input via data-test-id, setting files directly...');
                await hiddenFileInput.setInputFiles(filePaths);
            } else if (await fileInput.count() > 0) {
                console.log('[Gemini] Found file input, setting files directly...');
                await fileInput.setInputFiles(filePaths);
            } else {
                // Click "Upload files" menu item to spawn input or trigger dialog
                const uploadItem = this.page.locator(selectors.gemini.upload.uploadFile).first();
                // Wait for menu item
                try { await uploadItem.waitFor({ state: 'visible', timeout: 3000 }); } catch (e) { }

                if (await uploadItem.isVisible()) {
                    // Start waiting for file chooser before clicking
                    const fileChooserPromise = this.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null);
                    await uploadItem.click();

                    const fileChooser = await fileChooserPromise;
                    if (fileChooser) {
                        await fileChooser.setFiles(filePaths);
                    } else {
                        // Fallback: try setting input directly again if it appeared
                        const lateInput = this.page.locator(selectors.gemini.upload.fileInput).first();
                        if (await lateInput.count() > 0) {
                            await lateInput.setInputFiles(filePaths);
                        } else {
                            console.error('[Gemini] File chooser did not appear and input not found');
                            return false;
                        }
                    }
                } else {
                    console.error('[Gemini] "Upload files" menu item not found');
                    await this.dumpState('upload_option_missing');
                    // Close menu
                    await this.page.keyboard.press('Escape');
                    return false;
                }
            }

            // 3. Wait for upload to complete
            // Look for progress indicators or specific upload chips
            console.log('[Gemini] Waiting for files to process...');
            await this.page.waitForTimeout(2000 * filePaths.length); // Basic wait, can be improved by checking for spinners

            return true;
        } catch (e: any) {
            console.error(`[Gemini] Upload files failed: ${e.message}`);
            await this.dumpState('upload_files_fail');
            return false;
        }
    }

    /**
     * Get sources from the current context.
     * (Placeholder implementation)
     */
    async getContextSources(): Promise<{ title: string, url: string }[]> {
        // TODO: Implement source extraction for Gemini
        return [];
    }

    /**
     * Send a message to the current chat session.
     */



    // ==================== GEMS SUPPORT ====================

    /**
     * Navigate to the Gems page
     */
    async navigateToGems(): Promise<void> {
        console.log('[Gemini] Navigating to Gems...');

        // Ensure we are on app
        if (!this.page.url().includes('gemini.google.com/app')) {
            await this.page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);
        }

        // Expand sidebar if needed
        const menuButton = this.page.locator(selectors.gemini.sidebar.menu).first();
        if (await menuButton.count() > 0) {
            // Only click if sidebar is likely closed? Or just click to ensure?
            // Actually Gemini menu toggles. Checking for "Roboti Gem" visibility first is better.
            const gemsBtn = this.page.locator(selectors.gemini.sidebar.gems).first();
            if (!(await gemsBtn.isVisible())) {
                await menuButton.click().catch(() => { });
                await this.page.waitForTimeout(1000);
            }
        }

        // Click Gems
        const gemsBtn = this.page.locator(selectors.gemini.sidebar.gems).first();
        if (await gemsBtn.count() > 0 && await gemsBtn.isVisible()) {
            await gemsBtn.click();
            await this.page.waitForTimeout(3000);
        } else {
            console.warn('[Gemini] Gems button not found in sidebar. Trying direct URL...');
            await this.page.goto('https://gemini.google.com/app/gems').catch(() => { });
            await this.page.waitForTimeout(2000);
        }

        // Dismiss any popups
        const dismissButtons = this.page.locator(
            'button:has-text("Ne, díky"), button:has-text("No thanks"), button:has-text("Got it"), button:has-text("Close")'
        );
        if (await dismissButtons.count() > 0) {
            await dismissButtons.first().click().catch(() => { });
            await this.page.waitForTimeout(500);
        }
    }

    /**
     * List available Gems
     */
    async listGems(): Promise<GemInfo[]> {
        console.log('[Gemini] Listing Gems...');
        const gems: GemInfo[] = [];

        try {
            await this.navigateToGems();

            // Look for gem cards/items
            let gemItems = this.page.locator(selectors.gemini.gems.card);

            if (!gemItems) {
                // Fallback: look for any clickable items in main content
                gemItems = this.page.locator('main [role="button"], main a[href*="gem"]');
            }

            const count = await gemItems.count();
            console.log(`[Gemini] Found ${count} gems`);

            if (count === 0) {
                await this.dumpState('list_gems_zero');
            }

            for (let i = 0; i < count; i++) {
                const item = gemItems.nth(i);

                // Try to find specific name element
                let name = '';
                const nameSelector = selectors.gemini.gems.name || '.title';
                const nameEl = item.locator(nameSelector).first();
                if (await nameEl.count() > 0) {
                    name = await nameEl.innerText().catch(() => '');
                }

                if (!name) {
                    const fullText = await item.innerText().catch(() => '');
                    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);
                    // Heuristic: if first line is very short (avatar letter), take second
                    if (lines.length > 1 && lines[0].length <= 2) {
                        name = lines[1];
                    } else {
                        name = lines[0] || '';
                    }
                }
                const href = await item.getAttribute('href').catch(() => null);

                let id = null;
                if (href) {
                    const match = href.match(/\/gem\/([^\/\?]+)/);
                    if (match) id = match[1];
                }

                // Description extraction
                let description = '';
                const textContent = await item.innerText().catch(() => '');
                const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);
                const nameIdx = lines.indexOf(name);
                if (nameIdx >= 0 && nameIdx + 1 < lines.length) {
                    description = lines[nameIdx + 1];
                }

                // Determine if custom
                const hasEdit = await item.locator('button[aria-label*="Edit"], button[aria-label*="Upravit"]').count() > 0;
                const isCustom = hasEdit;

                if (name.trim()) {
                    gems.push({
                        name: name.trim(),
                        id,
                        description,
                        isCustom
                    });
                }
            }
        } catch (e: any) {
            console.error('[Gemini] Error listing gems:', e.message);
            await this.dumpState('list_gems_fail');
        }

        return gems;
    }

    /**
     * Select a Gem for the session (wrapper around openGem)
     */
    async selectGem(gemId: string): Promise<void> {
        const success = await this.openGem(gemId);
        if (!success) {
            throw new Error(`Failed to select gem: ${gemId}`);
        }
    }

    /**
     * Open a specific Gem by name or ID
     */
    async openGem(nameOrId: string): Promise<boolean> {
        console.log(`[Gemini] Opening gem: ${nameOrId}`);

        try {
            // If it looks like an ID (alphanumeric), try direct navigation
            if (/^ [a - zA - Z0 -9_ -] + $ /.test(nameOrId) && !nameOrId.includes(' ')) {
                await this.page.goto(`https://gemini.google.com/gem/${nameOrId}`, { waitUntil: 'domcontentloaded' });
                await this.page.waitForTimeout(2000);

                // Check if we're in a valid gem session
                const inputVisible = await this.page.locator('div[contenteditable="true"], textarea').count() > 0;
                if (inputVisible) {
                    console.log(`[Gemini] ✅ Opened gem: ${nameOrId}`);
                    return true;
                }
            }

            // Otherwise, search in gem list
            await this.navigateToGems();

            const gemItems = this.page.locator(`text="${nameOrId}"`);
            if (await gemItems.count() > 0) {
                await gemItems.first().click();
                await this.page.waitForTimeout(2000);
                console.log(`[Gemini] ✅ Opened gem by name: ${nameOrId}`);
                return true;
            }

            console.warn(`[Gemini] Gem not found: ${nameOrId}`);
            return false;

        } catch (e: any) {
            console.error(`[Gemini] Error opening gem: ${e.message}`);
            await this.dumpState('open_gem_fail');
            return false;
        }
    }

    /**
     * Create a new Gem with configuration
     * 
     * @param config - Gem configuration (name, instructions, files)
     * @returns Created gem ID or null if failed
     */
    async createGem(config: GemConfig): Promise<string | null> {
        console.log(`[Gemini] Creating gem: ${config.name}`);

        try {
            await this.navigateToGems();

            // Find "Create" or "New Gem" button
            let createButton = this.page.locator(selectors.gemini.gems.create).first();

            if (!createButton) {
                await this.dumpState('create_gem_button_not_found');
                throw new Error('Create Gem button not found');
            }

            await createButton.click();
            await this.page.waitForTimeout(2000);

            // Fill in gem name
            const nameInput = this.page.locator(selectors.gemini.gems.nameInput).first();
            if (await nameInput.count() > 0) {
                await nameInput.fill(config.name);
                await this.page.waitForTimeout(500);
            }

            // Fill in instructions (system prompt)
            const instructionsInput = this.page.locator(selectors.gemini.gems.instructionInput).first();
            if (await instructionsInput.count() > 0) {
                await instructionsInput.first().fill(config.instructions);
                await this.page.waitForTimeout(500);
            }

            // Upload files if specified
            if (config.files && config.files.length > 0) {
                await this.uploadFiles(config.files);
            }

            // Save/Create the gem
            let saveButton = this.page.locator(selectors.gemini.gems.save).first();

            if (saveButton) {
                await saveButton.click();
                await this.page.waitForTimeout(3000);
            }

            // Try to get created gem ID from URL
            const url = this.page.url();
            const match = url.match(/\/gem\/([^\/\?]+)/);
            const gemId = match ? match[1] : null;

            console.log(`[Gemini] ✅ Created gem: ${config.name}${gemId ? ` (ID: ${gemId})` : ''}`);
            return gemId;

        } catch (e: any) {
            console.error(`[Gemini] Error creating gem: ${e.message}`);
            await this.dumpState('create_gem_fail');
            return null;
        }
    }

    /**
     * Chat with a Gem (send message and get response)
     * 
     * @param gemNameOrId - Gem to chat with
     * @param message - Message to send
     * @returns Response or null
     */
    async chatWithGem(gemNameOrId: string, message: string): Promise<string | null> {
        console.log(`[Gemini] Chatting with gem: ${gemNameOrId}`);

        const opened = await this.openGem(gemNameOrId);
        if (!opened) {
            return null;
        }

        return await this.sendMessage(message);
    }

    /**
     * Run deep research using a specific Gem
     * 
     * @param gemNameOrId - Gem to use
     * @param query - Research query
     */
    async researchWithGem(gemNameOrId: string, query: string): Promise<string | null> {
        console.log(`[Gemini] Research with gem: ${gemNameOrId}`);

        const opened = await this.openGem(gemNameOrId);
        if (!opened) {
            return null;
        }

        // Enable deep research if available
        await this.enableDeepResearchMode();

        return await this.sendMessage(query);
    }


    async sendMessage(message: string, options: {
        waitForResponse?: boolean,
        resetSession?: boolean,
        onProgress?: (text: string) => void,
        files?: string[],
        model?: string,
        gemId?: string
    } = {}): Promise<string | null> {
        const { waitForResponse = true, resetSession, onProgress, files = [], model, gemId } = options;

        console.log(`[Gemini] Sending message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}" (Reset: ${resetSession})`);

        await this.checkAuth();

        if (gemId) {
            await this.selectGem(gemId);
        } else if (model) {
            await this.setModel(model);
        }

        if (files.length > 0) {
            await this.uploadFiles(files);
        }

        // Handle Session Reset (NEW functionality for isolation)
        if (resetSession && !gemId) {
            await this.resetToNewChat();
        }

        // Start trace for this message exchange
        // Start trace for this message exchange
        const trace = telemetry.startTrace('gemini:send-message', {
            messageLength: message.length,
            waitForResponse
        });

        // Start generation tracking for LLM call
        const generation = telemetry.startGeneration(trace, message, 'gemini-2.0-flash');

        try {
            const input = this.page.locator(selectors.gemini.chat.input).first();
            await input.waitFor({ state: 'visible', timeout: 10000 });

            const responsesBefore = await this.page.locator(selectors.gemini.chat.response).count();

            await input.fill(message);
            await this.page.waitForTimeout(300);

            // Click Send button (Enter key doesn't work reliably in Docker/VNC)
            let sendClicked = false;
            const sendBtn = this.page.locator(selectors.gemini.chat.send).first();
            if (await sendBtn.isVisible({ timeout: 500 }).catch(() => false)) {
                await sendBtn.click();
                sendClicked = true;
            }

            if (!sendClicked) {
                console.log('[Gemini] No Send button found, trying Enter key...');
                await input.press('Enter');
            }

            if (!waitForResponse) {
                telemetry.endGeneration(generation, 'No response awaited');
                telemetry.endTrace(trace, 'Fire and forget', true);
                return null;
            }

            console.log('[Gemini] Waiting for response...');
            const maxWait = 90000; // Increased timeout for long responses
            const pollInterval = 1000;
            let elapsed = 0;
            let lastResponseLength = 0;
            let stableCount = 0;

            const onProgress = options.onProgress;

            while (elapsed < maxWait) {
                const responsesNow = await this.page.locator(selectors.gemini.chat.response).count();
                if (responsesNow > responsesBefore) {
                    // Response started generating
                    const latestResponse = this.page.locator(selectors.gemini.chat.response).last();

                    // Check for thought toggle and expand (Deep Research / Reasoning models)
                    if (selectors.gemini.chat.thoughtToggle) {
                        try {
                            const toggle = latestResponse.locator(selectors.gemini.chat.thoughtToggle).first();
                            if (await toggle.isVisible({ timeout: 100 }).catch(() => false)) {
                                const expanded = await toggle.getAttribute('aria-expanded') === 'true';
                                if (!expanded) {
                                    if (this.verbose) console.log('[Gemini] Expanding thought/reasoning block...');
                                    await toggle.click({ timeout: 500 }).catch(() => { });
                                    await this.page.waitForTimeout(200); // Allow animation/DOM update
                                }
                            }
                        } catch (err) {
                            // Ignore expansion errors
                        }
                    }

                    // Force grab full text, including expanded reasoning
                    // Note: If expanded, the reasoning text should be part of innerText
                    let currentText = await latestResponse.innerText().catch(() => '');

                    // If we have a separate thought container that isn't being captured by parent innerText for some reason:
                    if (selectors.gemini.chat.thoughtContainer) {
                        const thoughts = latestResponse.locator(selectors.gemini.chat.thoughtContainer).first();
                        if (await thoughts.isVisible().catch(() => false)) {
                            // Sometimes innerText of parent misses dynamically loaded shadow/iframe content? 
                            // Unlikely for Gemini, but let's be safe.
                            // Actually, standard Gemini behavior: once expanded, it's just a div.
                        }
                    }

                    // Stream progress if callback provided
                    if (onProgress && currentText.length > lastResponseLength) {
                        onProgress(currentText);
                    }

                    if (currentText.length > 0 && currentText.length === lastResponseLength) {
                        stableCount++;
                        if (stableCount >= 2) { // 2s stable -> done
                            console.log('[Gemini] Response stabilized');
                            break;
                        }
                    } else {
                        stableCount = 0;
                        lastResponseLength = currentText.length;
                    }
                }
                await this.page.waitForTimeout(pollInterval);
                elapsed += pollInterval;
            }

            const response = await this.getLatestResponse();
            console.log(`[Gemini] Response received (${response?.length || 0} chars)`);

            // End generation with response
            telemetry.endGeneration(generation, response || '');
            telemetry.addScore(trace, 'response_length', response?.length || 0);
            telemetry.endTrace(trace, response?.substring(0, 200), true);

            return response;

        } catch (e) {
            console.error('[Gemini] Failed to send message:', e);
            await this.dumpState('send_message_fail');

            telemetry.trackError(trace, e as Error);
            telemetry.endGeneration(generation, '');
            telemetry.endTrace(trace, undefined, false);

            return null;
        }
    }

    async getResponses(): Promise<string[]> {
        console.log('[Gemini] Getting all responses...');
        const responses: string[] = [];

        try {
            await this.page.waitForTimeout(500);
            const responseElements = this.page.locator(selectors.gemini.chat.response);
            const count = await responseElements.count();
            console.log(`[Gemini] Found ${count} elements with selector: model-response`);

            for (let i = 0; i < count; i++) {
                const text = await responseElements.nth(i).innerText().catch(() => '');
                if (text.trim()) {
                    responses.push(text.trim());
                }
            }

            console.log(`[Gemini] Found ${responses.length} responses`);
        } catch (e) {
            console.error('[Gemini] Failed to get responses:', e);
        }

        return responses;
    }

    async getLatestResponse(): Promise<string | null> {
        try {
            const responseElements = this.page.locator(selectors.gemini.chat.response);
            const count = await responseElements.count();
            if (count === 0) return null;

            const lastResponse = responseElements.nth(count - 1);
            return await lastResponse.innerText().catch(() => null);
        } catch (e) {
            console.error('[Gemini] Failed to get latest response:', e);
            return null;
        }
    }

    async getResponse(index: number): Promise<string | null> {
        const responses = await this.getResponses();
        if (responses.length === 0) return null;

        if (index > 0) {
            // Positive index: 1 = first
            const idx = index - 1;
            return idx < responses.length ? responses[idx] : null;
        } else {
            // Negative index: -1 = last
            const idx = responses.length + index;
            return idx >= 0 ? responses[idx] : null;
        }
    }

    private async exportToGoogleDocs(): Promise<{ docId: string | null; docUrl: string | null; docTitle: string | null }> {
        console.log('[Gemini] Exporting to Google Docs...');

        try {
            console.log('[Gemini] Waiting for research panel to load...');

            const panelSelectors = ['model-response', '.response-container', '[data-message-id]'];
            let panelFound = false;
            for (let i = 0; i < 15 && !panelFound; i++) {
                for (const selector of panelSelectors) {
                    const panel = this.page.locator(selector).first();
                    if (await panel.count() > 0 && await panel.isVisible()) {
                        panelFound = true;
                        console.log(`[Gemini] Research panel found (${selector})`);
                        break;
                    }
                }
                if (!panelFound) {
                    await this.page.waitForTimeout(1000);
                }
            }

            await this.page.waitForTimeout(1000);

            // NEW: Check for "Open" button (Deep Research specific)
            // Sometimes the document is collapsed/previewed and needs to be opened to see the export menu.
            const openButtonSelectors = [
                'button:has-text("Open")',
                'button:has-text("Otevřít")',
                'button[aria-label="Open"]',
                'button[aria-label="Otevřít"]'
            ];

            for (const selector of openButtonSelectors) {
                const openBtn = this.page.locator(selector).first();
                if (await openBtn.count() > 0 && await openBtn.isVisible()) {
                    // Check if it's relevant (inside research panel or nearby)
                    console.log(`[Gemini] Found 'Open' button: ${selector}. Clicking...`);
                    await openBtn.click();
                    await this.page.waitForTimeout(1500); // Wait for open animation
                    break;
                }
            }

            // Find export button
            const exportButtonSelectors = [
                'button[aria-label="Nabídka pro export"]',
                'button[aria-label="Export menu"]',
                'button[aria-label*="Nabídka pro export"]',
                'button[aria-label*="Export menu"]'
            ];

            let exportButton = null;
            for (const selector of exportButtonSelectors) {
                try {
                    const btn = this.page.locator(selector).first();
                    if (await btn.count() > 0 && await btn.isVisible()) {
                        exportButton = btn;
                        console.log(`[Gemini] Found export button with selector: ${selector}`);
                        break;
                    }
                } catch (e) { /* continue */ }
            }

            if (!exportButton) {
                console.warn('[Gemini] Export button not found');
                await this.dumpState('export_button_not_found');
                return { docId: null, docUrl: null, docTitle: null };
            }

            console.log('[Gemini] Clicking export dropdown...');
            await exportButton.click();
            await this.page.waitForTimeout(1000);

            // Find docs export option
            const docsOptionSelectors = [
                'button[role="menuitem"]:has-text("Exportovat do Dokumentů")',
                'button[role="menuitem"]:has-text("Export to Docs")',
                'button:has-text("Exportovat do Dokumentů")',
                'button:has-text("Export to Docs")'
            ];

            let docsOptionClicked = false;
            for (const selector of docsOptionSelectors) {
                const docsOption = this.page.locator(selector).first();
                if (await docsOption.count() > 0 && await docsOption.isVisible()) {
                    console.log(`[Gemini] Clicking Google Docs export option: ${selector}`);

                    const newPagePromise = this.page.context().waitForEvent('page', { timeout: 30000 });
                    await docsOption.click();
                    docsOptionClicked = true;

                    console.log('[Gemini] Waiting for Google Docs tab...');
                    const newPage = await newPagePromise;

                    await newPage.waitForLoadState('domcontentloaded');

                    // Poll for actual URL
                    let docUrl = '';
                    let docId: string | null = null;
                    let docTitle: string | null = null;

                    for (let i = 0; i < 20; i++) {
                        docUrl = newPage.url();
                        if (docUrl && docUrl !== 'about:blank' && docUrl.includes('docs.google.com')) {
                            break;
                        }
                        await this.page.waitForTimeout(500);
                    }

                    if (docUrl.includes('docs.google.com')) {
                        await newPage.waitForLoadState('load').catch(() => { });
                        // Extract title
                        docTitle = await newPage.title().then(t => t.replace(' - Google Docs', '').replace(' - Dokumenty Google', '').trim()).catch(() => null);
                    }

                    const docMatch = docUrl.match(/\/document(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
                    if (docMatch) {
                        docId = docMatch[1];
                    }

                    console.log(`[Gemini] Google Doc created: ${docId}`);
                    console.log(`[Gemini] URL: ${docUrl}`);
                    console.log(`[Gemini] Title: ${docTitle}`);

                    await newPage.close();
                    return { docId, docUrl, docTitle };
                }
            }

            if (!docsOptionClicked) {
                console.warn('[Gemini] Export to Docs option not found');
                await this.dumpState('export_docs_option_not_found');
            }

            return { docId: null, docUrl: null, docTitle: null };

        } catch (e) {
            console.error('[Gemini] Export to Google Docs failed:', e);
            await this.dumpState('export_to_docs_fail');
            return { docId: null, docUrl: null, docTitle: null };
        }
    }

    async research(query: string, options: { sessionId?: string, sessionName?: string, deepResearch?: boolean, resetSession?: boolean, model?: string, gemId?: string } = {}): Promise<string> {
        this.progress(`Researching: "${query}" (Session: ${options.sessionId || 'current'}, Deep: ${options.deepResearch}, Reset: ${options.resetSession})`, 'research');
        try {
            // Handle Session Reset (NEW functionality for isolation)
            if (options.resetSession) {
                await this.resetToNewChat();
            }

            // Handle Gem selection
            if (options.gemId) {
                await this.selectGem(options.gemId);
            }

            // Handle Session Switching
            if (options.sessionId && !options.gemId) {
                const currentId = this.getCurrentSessionId();
                if (currentId !== options.sessionId) {
                    await this.openSession(options.sessionId);
                }
            } else if (options.sessionName) {
                // Try to find session by name if ID not provided
                // This is expensive (crawls list), so use sparingly or if we implement caching
                // For now, if name matches current title, we might be good.
                // But generally, we rely on OpenAI API usage passing the ID if it knows it.
            }

            // Set model if specified
            if (options.model && !options.gemId) {
                await this.setModel(options.model);
            }

            // Handle Deep Research Toggle
            if (options.deepResearch) {
                await this.enableDeepResearchMode();
            }

            const inputSelector = 'div[contenteditable="true"], textarea, input[type="text"]';
            const input = this.page.locator(inputSelector).first();
            await input.waitFor({ state: 'visible', timeout: 20000 });
            await input.fill(query);
            await this.page.waitForTimeout(500);

            // Click Send button (Enter key doesn't work reliably in Docker/VNC)
            // Try multiple selectors as the UI varies between normal and Deep Research mode
            // IMPORTANT: Avoid generic "last-child" selectors as they match attachment buttons
            const sendButtonSelectors = [
                // High-priority: aria-labels (most reliable)
                'button[aria-label*="Send"]',
                'button[aria-label*="Odeslat"]',
                'button[data-testid="send-button"]',
                // Submit button type
                'button[type="submit"]',
                // Button with send/arrow SVG icon (Gemini uses specific paths)
                'button:has(svg[class*="send"])',
                'button:has(path[d*="M2.01"])',  // Arrow path pattern
                // Class-based (specific)
                'button.send-button',
                'button[class*="send"]',
                // Material icon based
                'button mat-icon:has-text("send")',
                'button mat-icon:has-text("arrow_upward")',
                // Enabled state (the blue arrow becomes enabled when text is entered)
                'button[class*="enabled"]:not([aria-label*="Add"]):not([aria-label*="Přidat"])',
            ];

            let sendClicked = false;
            for (const selector of sendButtonSelectors) {
                const btn = this.page.locator(selector).first();
                if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
                    console.log(`[Gemini] Found Send button with selector: ${selector}`);
                    await btn.click();
                    sendClicked = true;
                    break;
                }
            }

            if (!sendClicked) {
                // Fallback: use Enter key to submit
                console.log('[Gemini] No Send button found, trying Enter key...');
                await input.press('Enter');
            }

            // Handle Deep Research Confirmation Flow
            if (options.deepResearch) {
                this.progress('Deep Research started, waiting for plan...', 'research');
                await this.waitForAndConfirmResearchPlan().catch(e => console.warn('[Gemini] Plan confirmation skipped/failed:', e.message));

                this.progress('Waiting for research completion...', 'research');
                await this.waitForResearchCompletion();
            }

            this.progress('Waiting for response...', 'research');
            const responseSelector = 'model-response, .message-content, .response-container-content';
            await this.page.waitForSelector(responseSelector, { timeout: 60000 }); // Longer timeout for standard response too
            await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });

            const responses = this.page.locator(responseSelector);
            const count = await responses.count();
            if (count > 0) {
                const lastResponse = responses.last();

                // For Deep Research, we might want to expand reasoning/content
                if (options.deepResearch) {
                    // Try to extract from the specific deep research container if present
                    // Or just use the standard last response which usually contains the summary
                }

                const text = await lastResponse.innerText();
                this.progress('Response extracted.', 'research');
                return text;
            } else {
                throw new Error('No response elements found.');
            }
        } catch (e) {
            console.error('[Gemini] Research failed:', e);
            await this.dumpState('gemini_research_fail');
            throw e;
        }
    }

    /**
     * Streaming variant of research() that polls DOM and calls callback with deltas.
     * @param query The research question
     * @param onChunk Callback for each new chunk of text
     * @param options Polling options
     */
    async researchWithStreaming(
        query: string,
        onChunk: (chunk: { content: string; isComplete: boolean }) => void,
        options: { pollIntervalMs?: number; timeoutMs?: number; sessionId?: string; sessionName?: string; deepResearch?: boolean; resetSession?: boolean } = {}
    ): Promise<string> {
        const { pollIntervalMs = 300, timeoutMs = 300000 } = options;

        console.log(`[Gemini] Streaming research: "${query}" (Session: ${options.sessionId || 'current'}, Deep: ${options.deepResearch}, Reset: ${options.resetSession})`);

        try {
            // Handle Session Reset (NEW functionality for isolation)
            if (options.resetSession) {
                await this.resetToNewChat();
            }

            // Handle Session Switching
            if (options.sessionId) {
                const currentId = this.getCurrentSessionId();
                if (currentId !== options.sessionId) {
                    await this.openSession(options.sessionId);
                }
            }

            // Handle Deep Research Toggle
            if (options.deepResearch) {
                await this.enableDeepResearchMode();
            }

            // Send the query
            const inputSelector = 'div[contenteditable="true"], textarea, input[type="text"]';
            const input = this.page.locator(inputSelector).first();
            await input.waitFor({ state: 'visible', timeout: 20000 });

            // Count responses before
            const responseSelector = 'model-response, .message-content, .response-container-content';
            const responsesBefore = await this.page.locator(responseSelector).count();

            await input.fill(query);
            await this.page.waitForTimeout(500);
            await input.press('Enter');

            // Handle Deep Research Confirmation Flow
            if (options.deepResearch) {
                console.log('[Gemini] Deep Research started, waiting for plan...');
                // We emit a "Thinking..." generic chunk so the UI doesn't timeout
                onChunk({ content: "Thinking (Deep Research Planning)...", isComplete: false });

                await this.waitForAndConfirmResearchPlan().catch(e => console.warn('[Gemini] Plan confirmation skipped/failed warning:', e.message));

                console.log('[Gemini] Waiting for research completion...');
                onChunk({ content: "\nExecuting Research Plan (may take minutes)...\n", isComplete: false });

                await this.waitForResearchCompletion();
            }

            console.log('[Gemini] Query sent, starting stream...');

            // Polling loop with safety limits
            let previousContent = '';
            const startTime = Date.now();
            let stableCount = 0;
            let iterations = 0;
            const maxIterations = Math.ceil(timeoutMs / pollIntervalMs) + 10; // Safety margin

            while (iterations < maxIterations) {
                iterations++;

                // Timeout check
                if (Date.now() - startTime > timeoutMs) {
                    console.warn(`[Gemini] Streaming timeout after ${iterations} iterations`);
                    onChunk({ content: '', isComplete: true });
                    throw new Error('Streaming timeout');
                }

                // Get current response text
                const responses = this.page.locator(responseSelector);
                const count = await responses.count();

                if (count > responsesBefore) {
                    const lastResponse = responses.last();
                    let currentContent = '';

                    try {
                        currentContent = await lastResponse.innerText();
                    } catch (e) {
                        // DOM might be updating
                    }

                    // Calculate delta
                    const delta = currentContent.slice(previousContent.length);

                    if (delta.length > 0) {
                        onChunk({ content: delta, isComplete: false });
                        previousContent = currentContent;
                        stableCount = 0;
                    } else if (currentContent.length > 50) {
                        stableCount++;
                        // Consider stable after 3 polls with no change (900ms)
                        if (stableCount >= 3) {
                            console.log(`[Gemini] Response stabilized after ${iterations} iterations`);
                            onChunk({ content: '', isComplete: true });
                            return currentContent;
                        }
                    }
                }

                await this.page.waitForTimeout(pollIntervalMs);
            }

            // Max iterations reached - this should never happen with proper timeout
            console.error(`[Gemini] Max iterations (${maxIterations}) reached - forcing completion`);
            onChunk({ content: '', isComplete: true });
            throw new Error(`Max iterations reached (${maxIterations})`);

        } catch (e) {
            console.error('[Gemini] Streaming research failed:', e);
            await this.dumpState('gemini_streaming_fail');
            throw e;
        }
    }

    /**
     * Start a full Deep Research workflow with artifact registry integration.
     * 
     * This method:
     * 1. Enables Deep Research mode (Thinking 3 Pro + Deep Research tool)
     * 2. Sends the query and automatically confirms the research plan
     * 3. Waits for research completion (can take several minutes)
     * 4. Exports results to Google Docs
     * 5. Registers session and document in the artifact registry
     * 6. Renames the Google Doc with the registry ID prefix
     * 
     * @param query The research question/topic
     * @param gemIdOrName Optional Gem ID or Name to use context from
     * @returns DeepResearchResult with status, doc info, and registry IDs
     */
    async startDeepResearch(query: string, gemIdOrName?: string): Promise<DeepResearchResult> {
        console.log(`[Gemini] Starting Deep Research: "${query}"${gemIdOrName ? ` (Gem: ${gemIdOrName})` : ''}`);

        const result: DeepResearchResult = {
            query,
            status: 'failed'
        };

        try {
            if (gemIdOrName) {
                const opened = await this.openGem(gemIdOrName);
                if (!opened) {
                    throw new Error(`Failed to open Gem: ${gemIdOrName}`);
                }
                // Wait a bit to ensure context is fully loaded
                await this.page.waitForTimeout(2000);
            } else {
                // Ensure we are in a fresh session or standard state if needed?
                // Currently startDeepResearch assumes we are just on the page.
                // If we are in a gem, and no gem specified, it might use the gem.
                // But usually the user wants to start from scratch if they don't specify gem.
                // However, navigating to Gems list or Home might be needed if side effects exist.
                // For now, assume user knows what they are doing or we reuse current state.
            }

            const registry = getRegistry();

            // Step 1: Force Reset to avoid carryover
            // Deep Research MUST start in a fresh state to avoid "mode already active" confusion
            if (!gemIdOrName) {
                // Only reset if NOT using a specific Gem (Gems have their own context)
                await this.resetToNewChat();
            }

            // Step 1b: Register session at the start (moved after reset)
            const geminiSessionId = this.getCurrentSessionId() || 'new-session';
            const sessionId = registry.registerSession(geminiSessionId, query);
            result.registrySessionId = sessionId;
            console.log(`[Gemini] Registered session: ${sessionId}`);

            // Step 1: Enable Deep Research mode
            await this.enableDeepResearchMode();
            console.log('[Gemini] Deep Research mode enabled');

            // Step 2: Send the query
            const inputSelector = 'div[contenteditable="true"], textarea, input[type="text"]';
            const input = this.page.locator(inputSelector).first();
            await input.waitFor({ state: 'visible', timeout: 20000 });
            await input.fill(query);
            await this.page.waitForTimeout(500);
            await input.press('Enter');
            console.log('[Gemini] Query sent, waiting for research plan...');

            // Step 3: Wait for and auto-confirm the research plan
            await this.waitForAndConfirmResearchPlan();
            console.log('[Gemini] Research plan confirmed, waiting for completion...');

            // Step 4: Wait for research to complete
            await this.waitForResearchCompletion();
            console.log('[Gemini] Research completed');

            // Update session ID now that we have it
            const actualSessionId = this.getCurrentSessionId();
            if (actualSessionId && actualSessionId !== geminiSessionId) {
                // Update registry with actual session ID
                const sessionEntry = registry.get(sessionId);
                if (sessionEntry) {
                    sessionEntry.geminiSessionId = actualSessionId;
                }
            }

            // Step 5: Export to Google Docs
            const exportResult = await this.exportToGoogleDocs();
            if (exportResult.docId) {
                result.googleDocId = exportResult.docId;
                result.googleDocUrl = exportResult.docUrl || undefined;
                result.googleDocTitle = exportResult.docTitle || undefined;

                // Step 6: Register document in artifact registry
                const docId = registry.registerDocument(
                    sessionId,
                    exportResult.docId,
                    exportResult.docTitle || 'Untitled Research'
                );
                result.registryDocId = docId;
                console.log(`[Gemini] Registered document: ${docId}`);

                // Step 7: Rename the Google Doc with registry ID prefix
                const originalTitle = exportResult.docTitle || 'Research';
                const newTitle = `${docId} ${originalTitle}`;
                const renamed = await this.renameGoogleDoc(exportResult.docId, newTitle);
                if (renamed) {
                    registry.updateTitle(docId, newTitle);
                    result.googleDocTitle = newTitle;
                    console.log(`[Gemini] Document renamed to: ${newTitle}`);
                }

                // Step 8: Rename the Gemini session with registry ID prefix
                const sessionTitle = exportResult.docTitle || query.substring(0, 30);
                const newSessionTitle = `${sessionId} ${sessionTitle}`;
                const sessionRenamed = await this.renameSession(newSessionTitle);
                if (sessionRenamed) {
                    console.log(`[Gemini] Session renamed to: ${newSessionTitle}`);
                }

                result.status = 'completed';
            } else {
                result.error = 'Failed to export to Google Docs';
                console.warn('[Gemini] Export to Google Docs failed');
            }

        } catch (e: any) {
            console.error('[Gemini] Deep Research failed:', e);
            result.error = e.message;
            result.status = 'failed';
            await this.dumpState('deep_research_fail');
        }

        return result;
    }

    /**
     * Enable Deep Research mode by clicking the Tools button and toggling Deep Research.
     * 
     * UI Path: Click "Nástroje" (Tools) button near input → Toggle "Deep Research" in drawer
     */
    private async enableDeepResearchMode(): Promise<void> {
        console.log('[Gemini] Enabling Deep Research mode...');

        // Step 1: Click the "Nástroje" (Tools) button near the input area
        const toolsButtonSelectors = [
            'button:has-text("Nástroje")',  // Czech
            'button:has-text("Tools")',      // English
            'button[aria-label*="Nástroje"]',
            'button[aria-label*="Tools"]',
            'button[aria-label*="nástroje"]',
        ];

        let toolsClicked = false;
        for (const selector of toolsButtonSelectors) {
            const btn = this.page.locator(selector).first();
            if (await btn.count() > 0 && await btn.isVisible()) {
                console.log(`[Gemini] Found Tools button with selector: ${selector}`);
                await btn.click();
                await this.page.waitForTimeout(1000);
                toolsClicked = true;
                break;
            }
        }

        if (!toolsClicked) {
            console.warn('[Gemini] Tools button not found. Trying alternative approach...');
            // Try clicking on the toolbar area that might contain tools
            const toolbarBtn = this.page.locator('[class*="tools"], [class*="capabilities"]').first();
            if (await toolbarBtn.count() > 0) {
                await toolbarBtn.click();
                await this.page.waitForTimeout(1000);
                toolsClicked = true;
            }
        }

        // Step 2: Find and toggle the Deep Research option
        const deepResearchSelectors = [
            // Toggle/switch for Deep Research
            'button:has-text("Deep Research")',
            '[role="switch"]:has-text("Deep Research")',
            '[role="menuitem"]:has-text("Deep Research")',
            'label:has-text("Deep Research")',
            // Try finding the toggle within the drawer
            '[role="dialog"] button:has-text("Deep Research")',
            'div:has-text("Deep Research") input[type="checkbox"]',
            'div:has-text("Deep Research") [role="switch"]',
        ];

        for (const selector of deepResearchSelectors) {
            const toggle = this.page.locator(selector).first();
            if (await toggle.count() > 0 && await toggle.isVisible()) {
                console.log(`[Gemini] Found Deep Research toggle: ${selector}`);
                await toggle.click();
                await this.page.waitForTimeout(500);
                this.deepResearchEnabled = true;
                console.log('[Gemini] Deep Research mode enabled!');

                // Close the drawer by clicking outside or pressing Escape
                await this.page.keyboard.press('Escape');
                await this.page.waitForTimeout(500);
                return;
            }
        }

        // If we found the tools drawer but not Deep Research, log what's visible
        console.warn('[Gemini] Deep Research toggle not found in drawer');
        await this.dumpState('deep_research_mode_fail');
    }

    /**
     * Wait for the research plan to appear and automatically confirm it.
     */
    private async waitForAndConfirmResearchPlan(): Promise<void> {
        const maxWait = 60000; // 60 seconds for plan to appear
        const pollInterval = 2000;
        let elapsed = 0;

        while (elapsed < maxWait) {
            // Look for confirmation buttons
            const confirmButtons = [
                'button:has-text("Start research")',
                'button:has-text("Confirm")',
                'button:has-text("Continue")',
                'button:has-text("Zahájit výzkum")',
                'button:has-text("Potvrdit")',
            ];

            for (const selector of confirmButtons) {
                const btn = this.page.locator(selector).first();
                if (await btn.count() > 0 && await btn.isVisible()) {
                    await btn.click();
                    console.log('[Gemini] Research plan confirmed via button');
                    return;
                }
            }

            await this.page.waitForTimeout(pollInterval);
            elapsed += pollInterval;
        }

        console.warn('[Gemini] No research plan confirmation button found - research may have started automatically');
    }

    /**
     * Wait for DOM to stabilize (no mutations for stabilityMs).
     * Uses MutationObserver injected into the page for event-driven detection.
     */
    private async waitForDomStabilization(stabilityMs = 3000, maxWait = 600000): Promise<string> {
        console.log(`[Gemini] Waiting for DOM stabilization (${stabilityMs}ms quiet period)...`);

        return this.page.evaluate(({ stabilityMs, maxWait }) => {
            return new Promise<string>((resolve, reject) => {
                let timer: any;
                let changeCount = 0;

                const observer = new MutationObserver(() => {
                    changeCount++;
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(() => {
                        observer.disconnect();
                        resolve(`stable after ${changeCount} changes`);
                    }, stabilityMs);
                });

                // Start observing
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    characterData: true
                });

                // Initial timer in case page is already stable
                timer = setTimeout(() => {
                    observer.disconnect();
                    resolve('already stable');
                }, stabilityMs);

                // Fallback timeout
                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error(`DOM stabilization timeout after ${maxWait}ms`));
                }, maxWait);
            });
        }, { stabilityMs, maxWait });
    }

    /**
     * Wait for the Deep Research to complete.
     * Uses event-driven approach: waits for Export button (primary) with DOM stability backup.
     * 
     * Key insight: Research takes 3-10 minutes. We need minimum wait time before 
     * accepting DOM stability to avoid false positives during plan→research transition.
     */
    private async waitForResearchCompletion(): Promise<void> {
        const maxWait = 600000; // 10 minutes max
        const minWait = 60000;  // Minimum 1 minute before accepting stability

        console.log('[Gemini] Waiting for research completion (event-driven)...');
        console.log(`[Gemini] Minimum wait: ${minWait / 1000}s, max: ${maxWait / 1000}s`);

        const startTime = Date.now();

        try {
            // Use Promise.race to wait for first completion signal
            const result = await Promise.race([
                // Signal 1: Export button appears (STRONGEST - this means research is truly done)
                this.page.locator('button[aria-label*="Export"], button[aria-label*="Nabídka pro export"], button:has-text("Export")').first()
                    .waitFor({ state: 'visible', timeout: maxWait })
                    .then(() => 'export-button-visible'),

                // Signal 2: Deep research panel stabilizes (but only after minWait)
                (async () => {
                    // Wait for panel to appear
                    await this.page.locator('deep-research-immersive-panel').first()
                        .waitFor({ state: 'visible', timeout: maxWait });

                    // Enforce minimum wait before accepting stability
                    const elapsed = Date.now() - startTime;
                    const remaining = Math.max(0, minWait - elapsed);
                    if (remaining > 0) {
                        console.log(`[Gemini] Panel visible, waiting ${remaining / 1000}s more before stability check...`);
                        await this.page.waitForTimeout(remaining);
                    }

                    // Now check for DOM stability (10s quiet = research truly done)
                    await this.waitForDomStabilization(10000, maxWait - (Date.now() - startTime));
                    return 'panel-stabilized';
                })(),

                // Signal 3: Progress logging and error checking
                (async () => {
                    const checkInterval = 5000;
                    let elapsed = 0;
                    while (elapsed < maxWait) {
                        // Check for error states
                        const errorIndicators = this.page.locator('text="Something went wrong", text="Error", text="Try again"');
                        if (await errorIndicators.count() > 0) {
                            throw new Error('Research encountered an error');
                        }

                        await this.page.waitForTimeout(checkInterval);
                        elapsed += checkInterval;

                        if (elapsed % 30000 === 0) {
                            console.log(`[Gemini] Still researching... (${Math.round(elapsed / 1000)}s elapsed)`);
                        }
                    }
                    return 'timeout-fallback';
                })()
            ]);

            console.log(`[Gemini] Research completion detected via: ${result}`);

            // Give a short buffer for any final rendering
            await this.page.waitForTimeout(2000);

        } catch (error: any) {
            if (error.message.includes('timeout')) {
                console.warn('[Gemini] Research wait timeout - proceeding anyway');
            } else {
                throw error;
            }
        }
    }

    async dumpState(name: string) {
        try {
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const timestamp = Date.now();
            const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const htmlPath = path.join(dataDir, `${cleanName}_${timestamp}.html`);
            const pngPath = path.join(dataDir, `${cleanName}_${timestamp}.png`);
            const html = await this.page.evaluate(() => document.body.outerHTML);
            fs.writeFileSync(htmlPath, html);
            await this.page.screenshot({ path: pngPath, fullPage: true });
            console.log(`[Gemini] Dumped state to ${htmlPath} / ${pngPath}`);
        } catch (e) {
            console.error('[Gemini] Failed to dump state:', e);
        }
    }

    /**
     * Rename a Google Doc by navigating to it and editing the title.
     * @param googleDocId The document ID (from URL)
     * @param newTitle The new title to set
     */
    async renameGoogleDoc(googleDocId: string, newTitle: string): Promise<boolean> {
        console.log(`[Gemini] Renaming Google Doc ${googleDocId} to "${newTitle}"`);

        try {
            // Navigate to the document
            const docUrl = `https://docs.google.com/document/d/${googleDocId}/edit`;
            await this.page.goto(docUrl, { waitUntil: 'domcontentloaded' });
            await this.page.waitForTimeout(2000);

            // The title is usually in an input or contenteditable div at the top
            // Selector for Google Docs title: input.docs-title-input or similar
            const titleSelector = 'input.docs-title-input';

            try {
                await this.page.waitForSelector(titleSelector, { state: 'visible', timeout: 10000 });

                // Click to focus
                await this.page.click(titleSelector);
                await this.page.waitForTimeout(300);

                // Select all and replace
                await this.page.keyboard.press('Control+a');
                await this.page.keyboard.type(newTitle, { delay: 30 });

                // Click outside to trigger auto-save (click on the document body)
                await this.page.click('.kix-appview-editor');
                await this.page.waitForTimeout(1500);

                console.log(`[Gemini] Document renamed successfully.`);
                return true;
            } catch (e) {
                console.warn('[Gemini] Title input not found with primary selector. Trying alternative...');

                // Alternative: sometimes title is in a different location
                const altTitleSelector = '[data-tooltip="Rename"]';
                const altTitle = this.page.locator(altTitleSelector).first();
                if (await altTitle.count() > 0) {
                    await altTitle.click();
                    await this.page.waitForTimeout(500);
                    await this.page.keyboard.press('Control+a');
                    await this.page.keyboard.type(newTitle, { delay: 30 });
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(1000);
                    console.log(`[Gemini] Document renamed via alternative selector.`);
                    return true;
                }

                console.error('[Gemini] Could not find title element to rename.');
                await this.dumpState('rename_doc_fail');
                return false;
            }
        } catch (e) {
            console.error('[Gemini] Failed to rename document:', e);
            return false;
        }
    }

    /**
     * Rename the current Gemini chat session.
     * Uses the dropdown menu accessed from the session title bar.
     * 
     * @param newTitle The new title for the session
     * @returns true if rename was successful
     */
    async renameSession(newTitle: string): Promise<boolean> {
        console.log(`[Gemini] Renaming session to "${newTitle}"`);

        try {
            // First, we need to go back to Gemini if we navigated away
            const currentUrl = this.page.url();
            if (!currentUrl.includes('gemini.google.com')) {
                await this.page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
                await this.page.waitForTimeout(2000);
            }

            // Click on the session title/dropdown button
            // The dropdown trigger is typically the session title bar with a chevron
            const titleDropdownSelectors = [
                'button[aria-haspopup="menu"]:has-text("Espresso")',  // Recent session
                '.conversation-title button',
                'button[data-test-id="conversation-menu"]',
                'mat-icon:has-text("expand_more")',  // Chevron icon
                'button:has(mat-icon:has-text("expand_more"))',
            ];

            let dropdownOpened = false;
            for (const selector of titleDropdownSelectors) {
                const btn = this.page.locator(selector).first();
                if (await btn.count() > 0 && await btn.isVisible()) {
                    await btn.click();
                    await this.page.waitForTimeout(500);
                    dropdownOpened = true;
                    break;
                }
            }

            if (!dropdownOpened) {
                // Try clicking on the header area of the chat that shows the title
                const headerArea = this.page.locator('[class*="conversation-header"], [class*="chat-header"]').first();
                if (await headerArea.count() > 0) {
                    await headerArea.click();
                    await this.page.waitForTimeout(500);
                    dropdownOpened = true;
                }
            }

            // Look for the Rename option in the menu
            // Czech: "Přejmenovat", English: "Rename"
            const renameSelectors = [
                'button:has-text("Přejmenovat")',
                'button:has-text("Rename")',
                '[role="menuitem"]:has-text("Přejmenovat")',
                '[role="menuitem"]:has-text("Rename")',
                'mat-menu-item:has-text("Přejmenovat")',
                'mat-menu-item:has-text("Rename")',
            ];

            let renameClicked = false;
            for (const selector of renameSelectors) {
                const renameBtn = this.page.locator(selector).first();
                if (await renameBtn.count() > 0 && await renameBtn.isVisible()) {
                    await renameBtn.click();
                    await this.page.waitForTimeout(500);
                    renameClicked = true;
                    break;
                }
            }

            if (!renameClicked) {
                console.warn('[Gemini] Rename option not found in menu');
                await this.dumpState('rename_session_no_menu');
                return false;
            }

            // Now there should be an input field for the new name
            const inputSelectors = [
                'input[type="text"]',
                '[contenteditable="true"]',
                'textarea',
            ];

            let inputFound = false;
            for (const selector of inputSelectors) {
                const input = this.page.locator(selector).first();
                if (await input.count() > 0 && await input.isVisible()) {
                    await input.fill('');  // Clear existing
                    await input.fill(newTitle);
                    await this.page.waitForTimeout(300);

                    // Confirm with Enter or click a save button
                    await this.page.keyboard.press('Enter');
                    await this.page.waitForTimeout(1000);

                    inputFound = true;
                    break;
                }
            }

            if (!inputFound) {
                // Try looking for a dialog with form
                const dialogInput = this.page.locator('[role="dialog"] input, mat-dialog-container input').first();
                if (await dialogInput.count() > 0) {
                    await dialogInput.fill('');
                    await dialogInput.fill(newTitle);
                    await this.page.waitForTimeout(300);

                    // Click confirm/save button
                    const confirmBtn = this.page.locator('[role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("Uložit"), mat-dialog-container button[type="submit"]').first();
                    if (await confirmBtn.count() > 0) {
                        await confirmBtn.click();
                    } else {
                        await this.page.keyboard.press('Enter');
                    }
                    await this.page.waitForTimeout(1000);
                    inputFound = true;
                }
            }

            if (inputFound) {
                console.log(`[Gemini] Session renamed to "${newTitle}"`);
                return true;
            }

            console.warn('[Gemini] Could not find input field to type new name');
            await this.dumpState('rename_session_no_input');
            return false;

        } catch (e: any) {
            console.error('[Gemini] Failed to rename session:', e.message);
            await this.dumpState('rename_session_fail');
            return false;
        }
    }
    /**
     * Navigate to a specific research session by URL or session ID.
     * This ensures we're viewing the full research content.
     */
    async navigateToResearchSession(sessionIdOrUrl: string): Promise<boolean> {
        console.log(`[Gemini] Navigating to research session: ${sessionIdOrUrl}`);

        try {
            // Build full URL if just session ID
            let url = sessionIdOrUrl;
            if (!url.startsWith('http')) {
                url = `https://gemini.google.com/app/${sessionIdOrUrl}`;
            }

            await this.page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            await this.page.waitForTimeout(3000);

            // Wait for content to load
            await this.page.waitForSelector('model-response, div.container', { timeout: 15000 });

            console.log('[Gemini] ✅ Navigated to research session');
            return true;
        } catch (e: any) {
            console.error('[Gemini] Failed to navigate to session:', e.message);
            return false;
        }
    }

    /**
     * Parse the current deep research session into a structured format.
     * Extracts content, citations, reasoning steps, and builds research flow.
     * 
     * @param sessionIdOrUrl - Optional session ID or URL. If provided, navigates to that session first.
     */
    async parseResearch(sessionIdOrUrl?: string): Promise<ParsedResearch | null> {
        console.log('[Gemini] Parsing research content...');

        try {
            // Navigate to session if URL provided
            if (sessionIdOrUrl) {
                const navigated = await this.navigateToResearchSession(sessionIdOrUrl);
                if (!navigated) {
                    console.warn('[Gemini] Could not navigate to session, parsing current page');
                }
            }

            // Wait for immersive panel to be present
            console.log('[Gemini] Waiting for research content...');
            await this.page.waitForSelector('model-response, div.container', { timeout: 10000 }).catch(() => { });

            // Check if immersive view is open (has more content)
            const immersiveOpen = await this.page.locator('.immersives-open').count() > 0;
            console.log(`[Gemini] Immersive view: ${immersiveOpen ? 'OPEN' : 'closed'}`);

            // Extract title from research panel or page
            const title = await this.extractTitle();
            console.log(`[Gemini] Title: ${title}`);

            // Extract query (original prompt)
            const query = await this.extractQuery();
            console.log(`[Gemini] Query: ${query?.substring(0, 50)}...`);

            // Extract main content - try multiple containers to get most content
            const { content, contentHtml, headings } = await this.extractContent();
            console.log(`[Gemini] Extracted ${headings.length} headings, ${content.length} chars`);

            // Extract citations
            const citations = await this.extractCitations();
            console.log(`[Gemini] Found ${citations.length} citations`);

            // Extract reasoning steps from chat history
            const reasoningSteps = await this.extractReasoningSteps();
            console.log(`[Gemini] Found ${reasoningSteps.length} reasoning steps`);

            // Build research flow diagram
            const researchFlow = this.buildResearchFlow(citations, reasoningSteps, query || '');

            // Convert to markdown
            const contentMarkdown = this.htmlToMarkdown(contentHtml, citations);

            const parsed: ParsedResearch = {
                title: title || 'Untitled Research',
                query: query || '',
                content,
                contentHtml,
                contentMarkdown,
                headings,
                citations,
                reasoningSteps,
                researchFlow,
                createdAt: new Date().toISOString()
            };

            return parsed;

        } catch (e: any) {
            console.error('[Gemini] Failed to parse research:', e);
            await this.dumpState('parse_research_fail');
            return null;
        }
    }

    /**
     * Extract the title from the research panel
     * 
     * Skip generic headings like "Chaty", "Konverzace" and find actual research title.
     */
    private async extractTitle(): Promise<string | null> {
        // Generic headings to skip
        const skipTitles = ['chaty', 'konverzace', 'konverzace s gemini', 'gemini', 'conversations'];

        // Look for all headings in content area
        const headings = this.page.locator('model-response h1, model-response h2, div.container h1, div.container h2');
        const count = await headings.count();

        for (let i = 0; i < count; i++) {
            const text = await headings.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                const lower = trimmed.toLowerCase();

                // Skip generic titles
                if (skipTitles.some(skip => lower === skip || lower.startsWith(skip))) continue;

                // Skip very short titles (likely navigation)
                if (trimmed.length < 10) continue;

                return trimmed;
            }
        }

        // Fallback: try conversation title from sidebar
        const convTitle = this.page.locator('.conversation-title').first();
        if (await convTitle.count() > 0) {
            const text = await convTitle.textContent();
            if (text && text.trim().length > 5) {
                return text.trim();
            }
        }

        return null;
    }

    /**
     * Extract the original query/prompt
     */
    private async extractQuery(): Promise<string | null> {
        // Look in chat history for user message
        const userMessages = this.page.locator('.user-message, [class*="user-query"], .query-text');
        if (await userMessages.count() > 0) {
            const text = await userMessages.first().textContent();
            return text?.trim() || null;
        }

        // Try to find prompt in another location
        const promptEl = this.page.locator('[data-query], [aria-label*="query"]').first();
        if (await promptEl.count() > 0) {
            return await promptEl.textContent();
        }

        return null;
    }

    /**
     * Extract main content from the research panel.
     * 
     * Aggregates content from all model-response elements to capture full research.
     */
    private async extractContent(): Promise<{ content: string, contentHtml: string, headings: string[] }> {
        let allContent = '';
        let allHtml = '';
        const headings: string[] = [];

        // Try to get content from all model-response elements
        const modelResponses = this.page.locator('model-response');
        const responseCount = await modelResponses.count();
        console.log(`[Gemini] Found ${responseCount} model-response elements`);

        if (responseCount > 0) {
            for (let i = 0; i < responseCount; i++) {
                try {
                    const el = modelResponses.nth(i);
                    const html = await el.evaluate(node => node.innerHTML);
                    const text = await el.evaluate(node => node.textContent || '');
                    allHtml += html + '\n';
                    allContent += text + '\n';
                } catch (e) {
                    // Skip inaccessible elements
                }
            }
        }

        // Fallback: try container elements if no model-response
        if (allContent.length < 1000) {
            const containers = this.page.locator('div.container.hide-from-message-actions');
            const containerCount = await containers.count();

            for (let i = 0; i < containerCount; i++) {
                try {
                    const el = containers.nth(i);
                    const text = await el.evaluate(node => node.textContent || '');
                    const html = await el.evaluate(node => node.innerHTML);
                    allContent += text + '\n';
                    allHtml += html + '\n';
                } catch (e) {
                    // Skip
                }
            }
        }

        // Extract headings
        const headingEls = this.page.locator('model-response h1, model-response h2, model-response h3, div.container h1, div.container h2, div.container h3');
        const headingCount = await headingEls.count();
        for (let i = 0; i < Math.min(headingCount, 50); i++) {
            const text = await headingEls.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                if (trimmed.length > 5 && !headings.includes(trimmed)) {
                    headings.push(trimmed);
                }
            }
        }

        return {
            content: allContent.trim(),
            contentHtml: allHtml.trim(),
            headings
        };
    }

    /**
     * Extract citations from inline links in the content
     * 
     * DOM research showed: Source URLs are regular <a href> elements,
     * NOT hidden behind button clicks. Filter out Google/internal URLs.
     */
    async extractCitations(): Promise<Citation[]> {
        const citations: Citation[] = [];

        // Domains to exclude (internal/boilerplate)
        const excludeDomains = [
            'google.com',
            'gstatic.com',
            'accounts.google.com',
            'gemini.google.com',
            'support.google.com',
            'www.google.com',
            'googletagmanager.com'
        ];

        // Look for all external links in content containers
        const links = this.page.locator('model-response a[href^="http"], div.container a[href^="http"]');
        const linkCount = await links.count();
        console.log(`[Gemini] Found ${linkCount} links in content`);

        for (let i = 0; i < Math.min(linkCount, 100); i++) {
            try {
                const link = links.nth(i);
                const href = await link.getAttribute('href');
                const text = await link.textContent();

                if (!href) continue;

                // Parse URL and check domain
                const url = new URL(href);
                const domain = url.hostname.replace('www.', '');

                // Skip if excluded domain
                if (excludeDomains.some(d => domain.includes(d))) continue;

                // Skip if already have this URL
                if (citations.some(c => c.url === href)) continue;

                citations.push({
                    id: citations.length + 1,
                    text: text?.trim() || domain,
                    url: href,
                    domain: domain,
                    usedInSections: []
                });
            } catch (e) {
                // Skip invalid URLs
            }
        }

        console.log(`[Gemini] Extracted ${citations.length} unique citations`);
        return citations;
    }

    /**
     * Extract reasoning steps from chat history
     */
    async extractReasoningSteps(): Promise<ReasoningStep[]> {
        const steps: ReasoningStep[] = [];

        // Look for research status messages
        const statusMessages = this.page.locator(
            '[class*="research-status"], [class*="thinking"], .system-message'
        );

        const count = await statusMessages.count();
        for (let i = 0; i < count; i++) {
            const text = await statusMessages.nth(i).textContent();
            if (text) {
                const trimmed = text.trim();
                if (trimmed.includes('výzkum') || trimmed.includes('research') ||
                    trimmed.includes('Searching') || trimmed.includes('Analyzing')) {
                    steps.push({
                        phase: `Step ${i + 1}`,
                        action: trimmed.substring(0, 100)
                    });
                }
            }
        }

        // Look for specific markers in chat
        const chatHistory = this.page.locator('[data-test-id="chat-history-container"]').first();
        if (await chatHistory.count() > 0) {
            try {
                const historyText = await chatHistory.textContent();

                // Extract research phases
                if (historyText?.includes('Zahájit výzkum') || historyText?.includes('Start research')) {
                    steps.push({ phase: 'Start', action: 'Research initiated' });
                }
                if (historyText?.includes('Dokončeno') || historyText?.includes('Completed')) {
                    steps.push({ phase: 'Complete', action: 'Research completed' });
                }
            } catch (e) {
                // Ignore if can't get text
            }
        }

        return steps;
    }

    /**
     * Build research flow diagram data
     */
    private buildResearchFlow(citations: Citation[], steps: ReasoningStep[], query: string): FlowNode[] {
        const nodes: FlowNode[] = [];

        // Query node
        nodes.push({
            id: 'query',
            type: 'query',
            label: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
            links: []
        });

        // Add source nodes from citations
        citations.slice(0, 10).forEach((c, i) => {
            nodes.push({
                id: `source_${i}`,
                type: 'source',
                label: c.domain || c.text.substring(0, 30),
                links: ['query']
            });
        });

        // Add thought nodes from reasoning steps
        steps.forEach((s, i) => {
            nodes.push({
                id: `thought_${i}`,
                type: 'thought',
                label: s.action.substring(0, 40),
                links: i === 0 ? ['query'] : [`thought_${i - 1}`]
            });
        });

        // Conclusion node
        if (nodes.length > 1) {
            nodes.push({
                id: 'conclusion',
                type: 'conclusion',
                label: 'Research Complete',
                links: [nodes[nodes.length - 1].id]
            });
        }

        return nodes;
    }

    /**
     * Convert HTML content to Markdown with citation references
     */
    private htmlToMarkdown(html: string, citations: Citation[]): string {
        let md = html;

        // Convert headings
        md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
        md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
        md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
        md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

        // Convert paragraphs
        md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

        // Convert lists
        md = md.replace(/<ul[^>]*>/gi, '\n');
        md = md.replace(/<\/ul>/gi, '\n');
        md = md.replace(/<ol[^>]*>/gi, '\n');
        md = md.replace(/<\/ol>/gi, '\n');
        md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

        // Convert links
        md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        // Convert bold/italic
        md = md.replace(/<(strong|b)[^>]*>(.*?)<\/(strong|b)>/gi, '**$2**');
        md = md.replace(/<(em|i)[^>]*>(.*?)<\/(em|i)>/gi, '*$2*');

        // Remove remaining HTML tags
        md = md.replace(/<[^>]+>/g, '');

        // Clean up whitespace
        md = md.replace(/\n{3,}/g, '\n\n');
        md = md.trim();

        return md;
    }

    /**
     * Export parsed research to a Markdown file
     */
    exportToMarkdown(parsed: ParsedResearch): string {
        let md = `# ${parsed.title}\n\n`;
        md += `> **Query:** ${parsed.query}\n`;
        md += `> **Generated:** ${parsed.createdAt}\n\n`;
        md += `---\n\n`;

        // Main content
        md += parsed.contentMarkdown;
        md += '\n\n---\n\n';

        // Sources section
        if (parsed.citations.length > 0) {
            md += `## Sources Used\n\n`;
            md += `| # | Source | Domain |\n`;
            md += `|---|--------|--------|\n`;
            parsed.citations.forEach(c => {
                md += `| ${c.id} | [${c.text}](${c.url}) | ${c.domain} |\n`;
            });
            md += '\n';
        }

        // Reasoning section
        if (parsed.reasoningSteps.length > 0) {
            md += `## Research Process\n\n`;
            parsed.reasoningSteps.forEach(s => {
                md += `- **${s.phase}**: ${s.action}\n`;
            });
            md += '\n';
        }

        // Research flow diagram
        if (parsed.researchFlow.length > 0) {
            md += `## Research Flow\n\n`;
            md += '```mermaid\ngraph TD\n';
            parsed.researchFlow.forEach(node => {
                const shape = node.type === 'query' ? `[${node.label}]` :
                    node.type === 'source' ? `((${node.label}))` :
                        node.type === 'conclusion' ? `[/${node.label}/]` :
                            `{${node.label}}`;
                md += `    ${node.id}${shape}\n`;
                node.links.forEach(link => {
                    md += `    ${link} --> ${node.id}\n`;
                });
            });
            md += '```\n';
        }

        return md;
    }

    /**
     * Create a Google Doc with the parsed research content.
     * 
     * Uses browser automation to:
     * 1. Navigate to Google Docs
     * 2. Create a new blank document
     * 3. Insert the markdown content
     * 4. Rename the document
     * 
     * @returns Object with docId and docUrl, or null on failure
     */
    async createGoogleDoc(parsed: ParsedResearch, customTitle?: string): Promise<{ docId: string, docUrl: string } | null> {
        console.log('[Gemini] Creating Google Doc...');

        try {
            const title = customTitle || parsed.title;

            // Navigate to Google Docs create page
            await this.page.goto('https://docs.google.com/document/create', {
                waitUntil: 'networkidle',
                timeout: 60000
            });
            await this.page.waitForTimeout(3000);

            // Wait for document to be ready
            await this.page.waitForSelector('.docs-title-input, [aria-label*="Document title"]', { timeout: 15000 });

            // Get the document URL (contains the doc ID)
            const docUrl = this.page.url();
            const docIdMatch = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            const docId = docIdMatch ? docIdMatch[1] : '';
            console.log(`[Gemini] Created doc: ${docId}`);

            // Rename the document
            const titleInput = this.page.locator('.docs-title-input, input[aria-label*="Document title"]').first();
            if (await titleInput.count() > 0) {
                await titleInput.click();
                await this.page.waitForTimeout(500);
                await titleInput.fill(title);
                await this.page.keyboard.press('Enter');
                await this.page.waitForTimeout(1000);
            }

            // Generate markdown content
            const markdown = this.exportToMarkdown(parsed);

            // Focus on document body
            const docBody = this.page.locator('.kix-appview-editor, [contenteditable="true"]').first();
            if (await docBody.count() > 0) {
                await docBody.click();
                await this.page.waitForTimeout(500);

                // Type the content (Docs will auto-format some markdown)
                // Note: For large content, we split into chunks
                const chunks = this.splitIntoChunks(markdown, 5000);
                for (const chunk of chunks) {
                    await this.page.keyboard.type(chunk, { delay: 1 });
                    await this.page.waitForTimeout(100);
                }
            }

            console.log(`[Gemini] ✅ Created Google Doc: ${title}`);
            return { docId, docUrl };

        } catch (e: any) {
            console.error('[Gemini] Failed to create Google Doc:', e.message);
            await this.dumpState('create_doc_fail');
            return null;
        }
    }

    /**
     * Split text into chunks for typing
     */
    private splitIntoChunks(text: string, chunkSize: number): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        return chunks;
    }
}
