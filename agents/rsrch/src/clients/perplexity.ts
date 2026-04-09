import { Page } from 'playwright';
import { config } from '../config';
import { selectors } from '../selectors';
import { UniversalContext, PerplexityActionDeps } from '../actions/types';
import * as actions from '../actions';

/**
 * PerplexityClient is a modular wrapper for Perplexity AI actions.
 * Follows the stateless action pattern used by Gemini and NotebookLM.
 */
export class PerplexityClient {
    public page: Page;
    private ctx: UniversalContext;
    private deps: PerplexityActionDeps;

    constructor(page: Page) {
        this.page = page;
        this.ctx = {
            page,
            log: (msg: string, level?: 'info' | 'warn' | 'error') => {
                const prefix = level === 'error' ? '❌ ' : level === 'warn' ? '⚠️ ' : 'ℹ️ ';
                console.log(`${prefix}[Perplexity] ${msg}`);
            },
            config
        };
        this.deps = {
            selectors,
            humanDelay: async (ms: number) => { await page.waitForTimeout(ms); }
        };
    }

    /**
     * Resets the UI to the home page to preserve session/cache while clearing state.
     */
    async recycle() {
        this.ctx.log('Recycling session via logo click...');
        try {
            const logo = this.page.locator('a[href="/"], .perplexity-logo').first();
            if (await logo.count() > 0 && await logo.isVisible()) {
                await logo.click();
                await this.page.waitForURL(url => url.origin.includes('perplexity.ai') && url.pathname === '/', { timeout: 5000 });
            } else {
                await this.page.goto(config.urls.perplexity, { waitUntil: 'domcontentloaded' });
            }
        } catch (e) {
            this.ctx.log('Recycle via click failed, falling back to page.goto', 'warn');
            await this.page.goto(config.urls.perplexity, { waitUntil: 'domcontentloaded' });
        }
    }

    /**
     * Performs a search query.
     */
    async query(queryText: string) {
        return actions.perplexityQueryAction(this.ctx, this.deps, queryText);
    }
}
