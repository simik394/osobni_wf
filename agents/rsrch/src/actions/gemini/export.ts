import { UniversalContext, GeminiActionDeps } from '../types';

export interface ExportResult {
    docId: string | null;
    docUrl: string | null;
    docTitle: string | null;
}

/**
 * Exports the current Gemini response/research to a Google Doc.
 * Handles the multi-step UI interaction of finding the export menu,
 * clicking the Doc option, and waiting for the new tab to stabilize.
 */
export async function exportToGoogleDocsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<ExportResult> {
    const { page, log } = ctx;
    
    log('Exporting to Google Docs...');

    try {
        log('Waiting for research panel to load...');

        const panelSelectors = ['model-response', '.response-container', '[data-message-id]'];
        let panelFound = false;
        
        for (let i = 0; i < 15 && !panelFound; i++) {
            for (const selector of panelSelectors) {
                const panel = page.locator(selector).first();
                if (await panel.count() > 0 && await panel.isVisible().catch(() => false)) {
                    panelFound = true;
                    log(`Research panel found (${selector})`);
                    break;
                }
            }
            if (!panelFound) {
                await page.waitForTimeout(1000);
            }
        }

        await page.waitForTimeout(1000);

        // Check for "Open" button (Deep Research specific)
        const openButtonSelectors = [
            'button:has-text("Open")',
            'button:has-text("Otevřít")',
            'button[aria-label="Open"]',
            'button[aria-label="Otevřít"]'
        ];

        for (const selector of openButtonSelectors) {
            const openBtn = page.locator(selector).first();
            if (await openBtn.count() > 0 && await openBtn.isVisible().catch(() => false)) {
                log(`Found 'Open' button: ${selector}. Clicking...`);
                await openBtn.click().catch(() => {});
                await page.waitForTimeout(1500); // Wait for open animation
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
                const btn = page.locator(selector).first();
                if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
                    exportButton = btn;
                    log(`Found export button with selector: ${selector}`);
                    break;
                }
            } catch (e) { /* continue */ }
        }

        if (!exportButton) {
            log('Export button not found', 'warn');
            if (deps.dumpState) await deps.dumpState('export_button_not_found');
            return { docId: null, docUrl: null, docTitle: null };
        }

        log('Clicking export dropdown...');
        await exportButton.click();
        await page.waitForTimeout(1000);

        // Find docs export option
        const docsOptionSelectors = [
            'button[role="menuitem"]:has-text("Exportovat do Dokumentů")',
            'button[role="menuitem"]:has-text("Export to Docs")',
            'button:has-text("Exportovat do Dokumentů")',
            'button:has-text("Export to Docs")'
        ];

        let docsOptionClicked = false;
        for (const selector of docsOptionSelectors) {
            const docsOption = page.locator(selector).first();
            if (await docsOption.count() > 0 && await docsOption.isVisible().catch(() => false)) {
                log(`Clicking Google Docs export option: ${selector}`);

                const newPagePromise = page.context().waitForEvent('page', { timeout: 30000 });
                await docsOption.click().catch(() => {});
                docsOptionClicked = true;

                log('Waiting for Google Docs tab...');
                const newPage = await newPagePromise;

                await newPage.waitForLoadState('domcontentloaded').catch(() => {});

                // Poll for actual URL
                let docUrl = '';
                let docId: string | null = null;
                let docTitle: string | null = null;

                for (let i = 0; i < 20; i++) {
                    docUrl = newPage.url();
                    if (docUrl && docUrl !== 'about:blank' && docUrl.includes('docs.google.com')) {
                        break;
                    }
                    await page.waitForTimeout(500);
                }

                if (docUrl.includes('docs.google.com')) {
                    await newPage.waitForLoadState('load').catch(() => { });
                    docTitle = await newPage.title()
                        .then(t => t.replace(' - Google Docs', '').replace(' - Dokumenty Google', '').trim())
                        .catch(() => null);
                }

                const docMatch = docUrl.match(/\/document(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
                if (docMatch) {
                    docId = docMatch[1];
                }

                log(`Google Doc created: ${docId}`);
                log(`URL: ${docUrl}`);
                log(`Title: ${docTitle}`);

                await newPage.close().catch(() => {});
                return { docId, docUrl, docTitle };
            }
        }

        if (!docsOptionClicked) {
            log('Export to Docs option not found', 'warn');
            if (deps.dumpState) await deps.dumpState('export_docs_option_not_found');
        }

        return { docId: null, docUrl: null, docTitle: null };

    } catch (e: any) {
        log(`Export to Google Docs failed: ${e.message}`, 'error');
        if (deps.dumpState) await deps.dumpState('export_to_docs_fail');
        return { docId: null, docUrl: null, docTitle: null };
    }
}

/**
 * Creates a Gmail draft containing the latest response/research.
 * Returns the Gmail draft direct URL or success indicator.
 */
export async function draftInGmailAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<{ success: boolean; draftUrl?: string }> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Drafting latest response in Gmail...');

    try {
        // 1. Find export menu button
        const exportButtonSelectors = [
            'button[aria-label="Nabídka pro export"]',
            'button[aria-label="Export menu"]',
            'button[aria-label*="Nabídka pro export"]',
            'button[aria-label*="Export menu"]'
        ];

        let exportButton = null;
        for (const selector of exportButtonSelectors) {
            const btn = page.locator(selector).first();
            if (await btn.count() > 0 && await btn.isVisible().catch(() => false)) {
                exportButton = btn;
                break;
            }
        }

        if (!exportButton) {
            log('Export menu button not found', 'error');
            if (deps.dumpState) await deps.dumpState('gmail_export_btn_not_found');
            return { success: false };
        }

        await exportButton.click();
        await page.waitForTimeout(1000);

        // 2. Locate and click the "Draft in Gmail" option
        const gmailOption = page.locator(selectors.gemini.session.draftGmailOption).first();
        if (!await gmailOption.isVisible()) {
            log('Draft in Gmail menu option not found', 'error');
            await page.keyboard.press('Escape');
            return { success: false };
        }

        log('Clicking "Draft in Gmail"...');
        await gmailOption.click();

        // 3. Wait for the confirmation toast/overlay to appear
        log('Waiting for Gmail draft confirmation toast...');
        const toastLink = page.locator(selectors.gemini.session.toastGmailLink).first();
        
        let draftUrl = undefined;
        try {
            await toastLink.waitFor({ state: 'visible', timeout: 30000 });
            draftUrl = await toastLink.getAttribute('href') || undefined;
            log(`Draft created successfully! Direct Gmail Link: ${draftUrl}`);
        } catch (err: any) {
            log('Draft created, but direct link to Gmail was not found in toast.', 'warn');
        }

        return { success: true, draftUrl };
    } catch (e: any) {
        log(`Draft in Gmail failed: ${e.message}`, 'error');
        return { success: false };
    }
}
