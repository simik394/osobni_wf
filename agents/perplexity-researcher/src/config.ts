import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Load local config if exists
const configPath = path.join(process.cwd(), 'config.json');
let localConfig: any = {};
if (fs.existsSync(configPath)) {
    try {
        localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
        console.warn('Failed to parse config.json', e);
    }
}

export const config = {
    url: 'https://www.perplexity.ai',
    port: localConfig.port || process.env.PORT || 3001,
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
        // Auth file for remote sessions (cookies/storage)
        authFile: process.env.AUTH_FILE || path.join(os.homedir(), '.config', 'perplexity-researcher', 'auth.json'),
    },
    paths: {
        resultsDir: path.join(process.cwd(), 'data', 'results'),
        queriesFile: path.join(process.cwd(), 'data', 'queries.json'),
    }
};
