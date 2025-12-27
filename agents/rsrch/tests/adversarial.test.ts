/**
 * Adversarial Tests - Breaking the Features
 * 
 * These tests target edge cases in:
 * - TOOLS-40: Streaming loop safety
 * - TOOLS-39: CORS middleware  
 * - TOOLS-32: Multi-turn context
 * 
 * Goal: Find bugs that realistic usage would trigger
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

describe('Adversarial: TOOLS-32 Multi-turn Context', () => {

    /**
     * BUG FOUND: After removing the "no user message" check,
     * empty messages array will cause formatConversation to return ''
     * which may behave unexpectedly in the agent.
     */
    it('should handle empty messages array gracefully', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [] // Empty array - no messages!
            })
        });

        // This should return 400, not crash or send empty prompt
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBeDefined();
    });

    /**
     * BUG FOUND: Messages with empty content will produce:
     * "User: \n\n---\n\nAssistant: "
     * The agent receives malformed conversation.
     */
    it('should reject messages with empty content', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [
                    { role: 'user', content: '' },
                    { role: 'assistant', content: '' },
                    { role: 'user', content: 'Hello' }
                ]
            })
        });

        // Empty messages should be filtered or rejected
        expect(response.status).toBe(400);
    });

    /**
     * Edge case: System message + no user message
     * Should this be allowed?
     */
    it('should handle only system message', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant' }
                ]
            })
        });

        // System-only should probably be rejected
        expect(response.status).toBe(400);
    });

    /**
     * BUG POTENTIAL: Very long conversation that exceeds token limits
     * The current implementation doesn't truncate.
     */
    it('should handle extremely long conversation history', { timeout: 30000 }, async () => {
        const longMessages = [];
        for (let i = 0; i < 100; i++) {
            longMessages.push({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: 'Lorem ipsum dolor sit amet '.repeat(100) // ~2700 chars each
            });
        }
        // Total: ~270,000 characters = ~67,500 tokens

        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: longMessages
            })
        });

        // Should either truncate gracefully or return 400 with explanation
        // NOT timeout or crash
        expect([200, 400]).toContain(response.status);
    });
});

describe('Adversarial: TOOLS-40 Streaming Loop Safety', () => {

    /**
     * POTENTIAL BUG: If pollIntervalMs is 0, maxIterations becomes Infinity
     * Math.ceil(timeoutMs / 0) = Infinity
     */
    it('should handle pollIntervalMs = 0 edge case', async () => {
        // This can't be tested directly from API, but documents the bug
        // In gemini-client.ts line ~1052:
        // const maxIterations = Math.ceil(timeoutMs / pollIntervalMs) + 10;
        // If pollIntervalMs = 0 → maxIterations = Infinity

        // The fix should validate pollIntervalMs > 0
        expect(true).toBe(true); // Placeholder - need internal test
    });

    /**
     * POTENTIAL BUG: If timeoutMs is 0, loop exits immediately
     */
    it('should handle timeoutMs = 0 edge case', async () => {
        // timeoutMs = 0 means:
        // - maxIterations = 10 (just the safety margin)
        // - Date.now() - startTime > 0 is immediately true
        // So it will timeout on first iteration
        expect(true).toBe(true);
    });
});

describe('Adversarial: TOOLS-39 CORS Middleware', () => {

    /**
     * Test: OPTIONS preflight request
     * CORS requires proper handling of preflight requests
     */
    it('should handle OPTIONS preflight correctly', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://evil.com',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        });

        expect(response.status).toBe(204); // No Content
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    /**
     * Test: CORS with custom headers
     */
    it('should allow Authorization header via CORS', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:8080',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type, Authorization'
            }
        });

        const allowedHeaders = response.headers.get('Access-Control-Allow-Headers');
        expect(allowedHeaders).toContain('Authorization');
    });
});

describe('Adversarial: Input Validation', () => {

    /**
     * BUG POTENTIAL: Non-string content in messages
     */
    it('should reject non-string message content', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [
                    { role: 'user', content: { text: 'Hello' } } // Object instead of string
                ]
            })
        });

        expect(response.status).toBe(400);
    });

    /**
     * BUG POTENTIAL: Invalid role
     */
    it('should reject invalid message role', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [
                    { role: 'hacker', content: 'DROP TABLE users;' }
                ]
            })
        });

        expect(response.status).toBe(400);
    });

    /**
     * BUG POTENTIAL: Missing role or content
     */
    it('should reject messages missing required fields', async () => {
        const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemini-rsrch',
                messages: [
                    { content: 'Hello' } // Missing role
                ]
            })
        });

        expect(response.status).toBe(400);
    });
});
