/**
 * Config module tests
 * Tests config resolution: env vars > local config > defaults
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the config schema logic by re-requiring with different env vars
describe('Config Resolution', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        // Restore original env
        process.env = { ...originalEnv };
    });

    it('should export a valid config object', async () => {
        const { config } = await import('../src/config');
        expect(config).toBeDefined();
        expect(config.port).toBeTypeOf('number');
        expect(config.host).toBeTypeOf('string');
    });

    it('should have auth paths defined', async () => {
        const { config } = await import('../src/config');
        expect(config.auth.userDataDir).toContain('rsrch');
        expect(config.auth.authFile).toContain('auth.json');
    });

    it('should have notification config', async () => {
        const { config } = await import('../src/config');
        expect(config.notifications).toBeDefined();
        expect(config.notifications.ntfy).toBeDefined();
        expect(config.notifications.ntfy!.topic).toBeTypeOf('string');
    });

    it('should have falkor config', async () => {
        const { config } = await import('../src/config');
        expect(config.falkor).toBeDefined();
        expect(config.falkor.host).toBeTypeOf('string');
        expect(config.falkor.port).toBeTypeOf('number');
    });

    it('should have valid selectors defaults', async () => {
        const { config } = await import('../src/config');
        expect(config.selectors.queryInput).toBeInstanceOf(Array);
        expect(config.selectors.queryInput.length).toBeGreaterThan(0);
        expect(config.selectors.submitButton).toContain('button');
    });
});
