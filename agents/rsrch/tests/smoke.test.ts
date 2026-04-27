import { describe, it, expect, beforeAll } from 'vitest';
import { ArtifactRegistry } from '../src/core/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

/**
 * RSRCH Smoke Test
 * 
 * This test verifies the core infrastructure is "Ready to Operate"
 * without triggering expensive actions (Deep Research, Audio Gen).
 */

const SERVER_URL = process.env.RSRCH_URL || 'http://localhost:3001';

describe('rsrch Smoke Test (Ready to Operate)', () => {

    describe('1. Server Health & Connectivity', () => {
        it('should respond to /health with browser status', async () => {
            const response = await fetch(`${SERVER_URL}/health`);
            expect(response.status).toBe(200);
            
            const data = await response.json();
            expect(data.status).toBe('ok');
            // This is the CRITICAL check for production readiness
            // Accept both 'connected' (legacy) and 'ready' (modular)
            expect(['connected', 'ready']).toContain(data.browser);
            console.log(`✅ Server is healthy and Browser is ${data.browser}.`);
        });

        it('should respond to /system/status', async () => {
            const response = await fetch(`${SERVER_URL}/system/status`);
            expect(response.status).toBe(200);
            
            const data = await response.json();
            expect(data.uptime).toBeDefined();
            console.log(`✅ System status retrieved. Uptime: ${Math.floor(data.uptime / 60)}m`);
        });
    });

    describe('2. API & Routing (OpenAI Compatible)', () => {
        it('should route a minimal ping request to the Gemini provider', async () => {
            // We use a query that should return a very short response
            // and we ensure we are NOT using 'deep-research' model.
            const response = await fetch(`${SERVER_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gemini-flash', // Use a cheap model for smoke test
                    messages: [
                        { role: 'user', content: 'Respond with exactly one word: PONG' }
                    ],
                    max_tokens: 5
                })
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.choices[0].message.content.toUpperCase()).toContain('PONG');
            console.log('✅ API Routing and Gemini connectivity verified.');
        });
    });

    describe('3. Local Persistence (Artifact Registry)', () => {
        const testDir = 'data/smoke-test-registry';
        
        it('should be able to write to the artifact registry', () => {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true });
            }
            
            const registry = new ArtifactRegistry(testDir);
            const sessionId = registry.registerSession('smoke-session', 'Smoke Test Query');
            
            expect(sessionId).toBeDefined();
            expect(sessionId.length).toBe(3);
            
            const session = registry.get(sessionId);
            expect(session?.query).toBe('Smoke Test Query');
            
            // Cleanup
            fs.rmSync(testDir, { recursive: true });
            console.log('✅ Artifact Registry persistence verified.');
        });
    });

    describe('4. NotebookLM (State Check)', () => {
        it('should list notebooks (even if empty)', async () => {
            const response = await fetch(`${SERVER_URL}/notebook/list`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);
            expect(Array.isArray(data.data)).toBe(true);
            console.log(`✅ NotebookLM connectivity verified. Found ${data.data.length} notebooks.`);
        });
    });
});
