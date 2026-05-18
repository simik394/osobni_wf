import { test, expect } from 'vitest';
import { chromium } from 'playwright';
import { listSharedLinksAction, deleteSharedLinkAction, deleteAllSharedLinksAction } from '../src/actions/gemini/sharing';
import { uploadFromNotebookLMAction, uploadFromPhotosAction } from '../src/actions/gemini/upload';
import { draftInGmailAction } from '../src/actions/gemini/export';

test('Gemini Native public shared links automation mock test', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock page with sharing settings elements
    const mockHtml = `
        <div id="sharing-settings-root">
            <div class="share-link-item">
                <span class="link-title">Research Session A</span>
                <a href="https://gemini.google.com/share/session_a_id">Link</a>
                <button aria-label="Smazat">Delete</button>
            </div>
            <div class="share-link-item">
                <span class="link-title">NotebookLM Investigation</span>
                <a href="https://gemini.google.com/share/session_b_id">Link</a>
                <button aria-label="Smazat">Delete</button>
            </div>
            <button id="delete-all-btn">Delete all links</button>
        </div>
    `;

    await page.setContent(mockHtml);

    // Mock page.goto so we don't hit external URLs in Vitest unit context
    page.goto = async (url: string) => {
        return null;
    };

    const selectors = {
        gemini: {
            settings: {
                sharing: {
                    linksList: '.share-link-item',
                    linkTitle: '.link-title',
                    linkUrl: 'a',
                    deleteButton: 'button[aria-label="Smazat"]',
                    deleteAllButton: '#delete-all-btn',
                    confirmDelete: 'button:has-text("Smazat")'
                }
            }
        }
    } as any;

    const ctx = {
        page,
        log: (msg: string) => console.log(`[Test] ${msg}`),
        config: { urls: { gemini: 'https://gemini.google.com' } }
    } as any;

    // 1. List
    const links = await listSharedLinksAction(ctx, { selectors } as any);
    expect(links.length).toBe(2);
    expect(links[0].title).toBe('Research Session A');
    expect(links[0].id).toBe('session_a_id');
    expect(links[1].title).toBe('NotebookLM Investigation');
    expect(links[1].id).toBe('session_b_id');

    await browser.close();
});

test('Gemini Native NotebookLM and Google Photos upload mock test', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const mockHtml = `
        <div>
            <button id="plus-btn" aria-label="Attach">Attach</button>
            <button id="photos-btn">Photos</button>
            <button id="notebooklm-btn">NotebookLM</button>
            
            <div id="notebook-dialog" class="notebook-import-dialog" style="display: none;">
                <input id="search-input" placeholder="Search..." />
                <div class="notebook-row">Research Notebook</div>
                <button id="insert-btn">Insert</button>
            </div>
        </div>
    `;

    await page.setContent(mockHtml);

    // Mock interaction handlers
    await page.exposeFunction('onAttachClick', async () => {
        // Mock opening menu
    });

    const selectors = {
        gemini: {
            upload: {
                button: '#plus-btn',
                photos: '#photos-btn',
                notebooklm: '#notebooklm-btn',
                notebooklmDialog: {
                    container: '#notebook-dialog',
                    searchInput: '#search-input',
                    notebookItem: '.notebook-row',
                    insertButton: '#insert-btn'
                }
            }
        }
    } as any;

    const ctx = {
        page,
        log: (msg: string) => console.log(`[Test] ${msg}`),
        config: { urls: { gemini: 'https://gemini.google.com' } }
    } as any;

    // Test NotebookLM import dialog flow
    // Trigger dialog open when notebooklm button is clicked
    await page.locator('#notebooklm-btn').evaluate((el) => {
        el.addEventListener('click', () => {
            const dialog = document.getElementById('notebook-dialog');
            if (dialog) dialog.style.display = 'block';
        });
    });

    // Execute uploadFromNotebookLMAction (this action will click plus button, click NLM option, fill search, click row, click insert)
    const uploadPromise = uploadFromNotebookLMAction(ctx, { selectors } as any, 'Research Notebook');
    
    // Wait for the action to click
    await page.waitForTimeout(500);
    
    const success = await uploadPromise;
    expect(success).toBe(true);

    await browser.close();
});

test('Gemini Native Gmail draft export mock test', async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const mockHtml = `
        <div>
            <button aria-label="Nabídka pro export">Export</button>
            <button id="gmail-option" role="menuitem" style="display: none;">Draft in Gmail</button>
            <a id="toast-link" href="https://mail.google.com/mail/u/0/#drafts/12345" style="display: none;">Open Gmail</a>
        </div>
    `;

    await page.setContent(mockHtml);

    // Wire up events
    await page.locator('button[aria-label="Nabídka pro export"]').evaluate((el) => {
        el.addEventListener('click', () => {
            const option = document.getElementById('gmail-option');
            if (option) option.style.display = 'block';
        });
    });

    await page.locator('#gmail-option').evaluate((el) => {
        el.addEventListener('click', () => {
            const toast = document.getElementById('toast-link');
            if (toast) toast.style.display = 'block';
        });
    });

    const selectors = {
        gemini: {
            session: {
                draftGmailOption: '#gmail-option',
                toastGmailLink: '#toast-link'
            }
        }
    } as any;

    const ctx = {
        page,
        log: (msg: string) => console.log(`[Test] ${msg}`),
        config: { urls: { gemini: 'https://gemini.google.com' } }
    } as any;

    const res = await draftInGmailAction(ctx, { selectors } as any);
    expect(res.success).toBe(true);
    expect(res.draftUrl).toBe('https://mail.google.com/mail/u/0/#drafts/12345');

    await browser.close();
});
