const { sleep, notifyUser } = require('./utils');

/**
 * Checks if the current page is on a login screen.
 */
async function checkLoginState(page, type) {
    return await page.evaluate((t) => {
        if (t === 'vse_insis') {
            const loginInput = document.querySelector('input[name="credential_0"]');
            const loginBtn = document.querySelector('input[name="login"]');
            const title = document.title.toLowerCase();
            return !!(loginInput || loginBtn || title.includes('log in to system') || title.includes('přihlášení'));
        }
        if (t === 'vse_moodle') {
            const loginBtn = document.querySelector('a[href*="login/index.php"]');
            const loginForm = document.querySelector('#login');
            return !!(loginForm || (loginBtn && loginBtn.textContent.includes('Log in')));
        }
        return false;
    }, type);
}

/**
 * Unified authentication dispatcher. Pauses and notifies user if login is needed.
 */
async function assertAuthenticated(page, type) {
    let isLogin = await checkLoginState(page, type);

    if (isLogin) {
        notifyUser(`Action required: The browser session for ${type} requires login. Connect via VNC to authenticate within the next 10 minutes.`);
        
        let attempts = 0;
        const maxAttempts = 60; // 60 * 10s = 10 minutes limit
        
        while (isLogin && attempts < maxAttempts) {
            process.stdout.write(`Waiting for manual authentication via VNC... (${attempts + 1}/${maxAttempts})\r`);
            await sleep(10000);
            isLogin = await checkLoginState(page, type);
            attempts++;
        }
        console.log("\n"); // Clear line

        if (isLogin) {
            notifyUser(`Authentication timeout for ${type}. Terminating process.`);
            throw new Error(`AUTH_REQUIRED: Authentication timeout after 10 minutes.`);
        } else {
            notifyUser(`Authentication successful for ${type}. Resuming process!`);
        }
    }
    return true;
}

module.exports = { assertAuthenticated };
