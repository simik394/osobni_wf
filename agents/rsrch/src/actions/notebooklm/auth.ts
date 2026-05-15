import { UniversalContext, NotebookLMActionDeps } from '../types';

/**
 * Ensures the user is authenticated and handles common auth roadblocks.
 * Detects 'accountchooser' pages and automatically selects the primary account.
 */
export async function ensureAuthAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    const url = page.url();
    log(`Checking authentication state at ${url}...`);

    // 1. Detect Google Account Chooser
    if (url.includes('accounts.google.com') && url.includes('accountchooser')) {
        log('Detected Google Account Chooser. Attempting to select primary account...');
        
        try {
            const container = page.locator(selectors.googleAuth.accountChooser.container).first();
            if (await container.isVisible({ timeout: 5000 }).catch(() => false)) {
                const primaryAccount = page.locator(selectors.googleAuth.accountChooser.accountItem).first();
                if (await primaryAccount.isVisible({ timeout: 2000 }).catch(() => false)) {
                    log('Clicking primary account...');
                    await primaryAccount.click();
                    
                    // Wait for navigation or a new URL that isn't the account chooser
                    await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, url, { timeout: 15000 }).catch(() => {});
                    
                    const newUrl = page.url();
                    log(`Navigated to ${newUrl} after account selection.`);
                    
                    // If it redirects to login (password prompt), we can't automate that yet
                    if (newUrl.includes('challenge/pwd')) {
                        log('Password prompt detected. Manual intervention required.', 'error');
                        throw new Error('Authentication requires password entry. Please refresh your storage state.');
                    }
                    
                    return true;
                } else {
                    log('No account items found in account chooser.', 'warn');
                }
            }
        } catch (error) {
            log(`Failed to handle account chooser: ${error.message}`, 'warn');
        }
    }

    // 2. Detect Sign-in Page
    if (url.includes('accounts.google.com') && (url.includes('/ServiceLogin') || url.includes('/signin'))) {
        // Check if there's a "Sign in" button or email input
        const emailInput = page.locator(selectors.googleAuth.login.emailInput).first();
        if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            log('Google Sign-in page detected (Email input visible). Auth required!', 'error');
            throw new Error('Authentication required. Your session may have expired.');
        }
    }

    // 3. Detect NotebookLM Landing Page (not logged in)
    if (url === 'https://notebooklm.google.com/' || url === 'https://notebooklm.google.com') {
        // The landing page usually has a "Try NotebookLM" or "Sign In" button
        // If we are here, we might not be logged in.
        log('On NotebookLM landing page. Possible auth failure.', 'warn');
    }

    return false;
}
