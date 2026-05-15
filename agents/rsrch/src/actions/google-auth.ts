import { UniversalContext, GoogleAuthActionDeps } from './types';

/**
 * Shared Google Authentication handling.
 * Detects 'accountchooser' pages and automatically selects the primary account.
 */
export async function ensureGoogleAuthAction(
    ctx: UniversalContext,
    deps: GoogleAuthActionDeps
): Promise<boolean> {
    const { page, log } = ctx;
    const { selectors } = deps;

    const url = page.url();
    log(`Checking Google authentication state at ${url}...`);

    // 1. Detect Google Account Chooser
    if (url.includes('accounts.google.com') && url.includes('accountchooser')) {
        log('Detected Google Account Chooser. Attempting to select primary account...');
        
        try {
            const container = page.locator(selectors.googleAuth.accountChooser.container).first();
            if (await container.isVisible({ timeout: 5000 }).catch(() => false)) {
                const primaryAccount = page.locator(selectors.googleAuth.accountChooser.accountItem).first();
                if (await primaryAccount.isVisible({ timeout: 2000 }).catch(() => false)) {
                    log('Clicking primary account...');
                    await primaryAccount.click({ delay: 500 });
                    
                    // Wait for navigation or a new URL that isn't the account chooser
                    await page.waitForFunction((oldUrl) => window.location.href !== oldUrl, url, { timeout: 15000 }).catch(() => {});
                    
                    const newUrl = page.url();
                    log(`Navigated to ${newUrl} after account selection.`);
                    
                    // If it redirects to login (password prompt), we can't automate that yet
                    if (newUrl.includes('challenge/pwd')) {
                        log('Password prompt detected. Manual intervention required.', 'error');
                        throw new Error('Authentication requires password entry. Please refresh your storage state.');
                    }

                    if (newUrl.includes('signin/rejected')) {
                        log('Google rejected the sign-in attempt (Secure Browser check).', 'error');
                        throw new Error('Google rejected the sign-in. This usually happens in headless mode without a valid session. Please update your storage state manually.');
                    }
                    
                    return true;
                } else {
                    log('No account items found in account chooser.', 'warn');
                }
            }
        } catch (error: any) {
            log(`Failed to handle account chooser: ${error.message}`, 'warn');
            if (error.message.includes('rejected')) throw error;
        }
    }

    // 2. Detect Sign-in Page
    if (url.includes('accounts.google.com') && (url.includes('/ServiceLogin') || url.includes('/signin'))) {
        const emailInput = page.locator(selectors.googleAuth.login.identifier).first();
        if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            log('Google Sign-in page detected (Email input visible). Auth required!', 'error');
            throw new Error('Authentication required. Your session may have expired.');
        }
    }

    return false;
}
