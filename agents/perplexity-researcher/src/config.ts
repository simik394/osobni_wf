import * as path from 'path';
import * as os from 'os';

export const config = {
    url: 'https://www.perplexity.ai',
    // WebSocket endpoint for the decoupled browser service
    browserWsEndpoint: process.env.BROWSER_WS_ENDPOINT || 'ws://localhost:3000/ws',
    selectors: {
        loginButton: 'button:has-text("Log in")',
        googleLoginButton: 'button:has-text("Continue with Google")',
        queryInput: ['textarea[placeholder*="Ask"]', 'textarea', 'input[placeholder*="Ask"]', 'div[contenteditable="true"]'],
        submitButton: 'button[aria-label="Submit"]',
        answerContainer: '.prose',
        followUpInput: 'textarea[placeholder*="Ask follow-up"]',
    },
    auth: {
        // Persistent user data directory (store cookies, etc.)
        userDataDir: process.env.PERPLEXITY_USER_DATA_DIR || path.join(os.homedir(), '.config', 'perplexity-researcher', 'user-data'),
        // Legacy file support if needed, but we are moving to directory
        authFile: path.join(os.homedir(), 'auth.json'), // Dummy default
    },
    paths: {
        resultsDir: path.join(process.cwd(), 'data', 'results'),
        queriesFile: path.join(process.cwd(), 'data', 'queries.json'),
    }
};
