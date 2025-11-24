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
        browserDataPath: 'playwright/.browser-data',
    },
    paths: {
        resultsDir: 'data/results',
        queriesFile: 'data/queries.json',
    }
};
