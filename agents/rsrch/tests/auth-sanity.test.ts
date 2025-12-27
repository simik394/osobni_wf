/**
 * Auth Sanity Test
 * 
 * Verifies that the agents can actually interact with the underlying services
 * (Gemini, Perplexity) which confirms that the browser sessions/auth are valid.
 */
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

describe('Auth Sanity: rsrch', () => {

    it('should be able to get a response from Gemini (confirms Google Auth)', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [{ role: 'user', content: 'Reply only with "PONG"' }]
            })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.choices[0].message.content.toUpperCase()).toContain('PONG');
    }, 120000); // 2 min timeout as browser automation is involved

    it('should be able to get a response from Perplexity (confirms Perplexity Auth)', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'perplexity',
                messages: [{ role: 'user', content: 'Reply only with "PONG"' }]
            })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.choices[0].message.content.toUpperCase()).toContain('PONG');
    }, 120000);
});
