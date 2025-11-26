import * as path from 'path';
import * as os from 'os';

export const config = {
    url: 'https://www.perplexity.ai',
    selectors: {
        loginButton: 'button:has-text("Log in")',
        googleLoginButton: 'button:has-text("Continue with Google")', // Adjust if needed
        queryInput: ['textarea[placeholder*="Ask"]', 'textarea', 'input[placeholder*="Ask"]', 'div[contenteditable="true"]'],
        submitButton: 'button[aria-label="Submit"]', // Common pattern
        answerContainer: '.prose', // Markdown content usually in prose class
        followUpInput: 'textarea[placeholder*="Ask follow-up"]',
    },
    auth: {
        browserDataPath: path.join(os.homedir(), '.config', 'perplexity-researcher', 'browser-data'),
    },
    paths: {
        resultsDir: path.join(process.cwd(), 'perplexity_results'),
        queriesFile: path.join(process.cwd(), 'queries.json'),
    }
};
