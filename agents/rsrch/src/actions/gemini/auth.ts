import { UniversalContext, GeminiActionDeps } from '../types';

/**
 * Handles initial page overlays like cookie consent, "No thanks" popups, etc.
 */
export async function handleInitialOverlaysAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    log('Checking for initial overlays (cookies, popups)...');

    // 1. Cookie Consent
    try {
        const acceptBtn = page.locator(selectors.gemini.auth.acceptAll).first();
        if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            log('Clicking Cookie Consent...');
            await acceptBtn.click();
            await page.waitForTimeout(1000);
        }
    } catch (e) {}

    // 2. Popups / Dismissibles
    const dismissSelectors = selectors.gemini.auth.dismiss.split(',').map(s => s.trim());
    for (const selector of dismissSelectors) {
        try {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
                log(`Dismissing popup: ${selector}`);
                await btn.click();
                await page.waitForTimeout(500);
            }
        } catch (e) {}
    }

    // 3. Welcome / Got it
    try {
        const welcomeBtn = page.locator(selectors.gemini.auth.welcome).first();
        if (await welcomeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
            log('Clicking Welcome/Got it...');
            await welcomeBtn.click();
        }
    } catch (e) {}
}

/**
 * Checks if the user is redirected to a sign-in page.
 */
export async function checkAuthRequiredAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps
): Promise<void> {
    const { page, log } = ctx;
    const { selectors } = deps;

    const signInBtn = page.locator(selectors.gemini.auth.signIn).first();
    if (await signInBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        log('Sign-in button detected. Auth required!', 'error');
        throw new Error('Gemini requires authentication. Please run rsrch auth first.');
    }

    const url = page.url();
    if (url.includes('accounts.google.com') || url.includes('/ServiceLogin')) {
        log('Google Login page detected. Auth required!', 'error');
        throw new Error('Gemini requires authentication. Please run rsrch auth first.');
    }
}
