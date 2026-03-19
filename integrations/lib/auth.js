/**
 * Unified authentication dispatcher for academic platforms.
 */
async function assertAuthenticated(page, type) {
    const isLogin = await page.evaluate((t) => {
        if (t === 'vse_insis') {
            const loginInput = document.querySelector('input[name="credential_0"]');
            const loginBtn = document.querySelector('input[name="login"]');
            const title = document.title.toLowerCase();
            return !!(loginInput || loginBtn || title.includes('log in to system') || title.includes('přihlášení'));
        }
        if (t === 'vse_moodle') {
            // Check for Moodle login form or "Log in" button
            const loginBtn = document.querySelector('a[href*="login/index.php"]');
            const loginForm = document.querySelector('#login');
            return !!(loginForm || (loginBtn && loginBtn.textContent.includes('Log in')));
        }
        return false;
    }, type);

    if (isLogin) {
        throw new Error(`AUTH_REQUIRED: The browser session for ${type} has expired or requires login.`);
    }
    return true;
}

module.exports = { assertAuthenticated };
