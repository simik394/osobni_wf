import { ConfigLoader } from '../src/config/loader';
import { z } from 'zod';
import * as path from 'path';

describe('ConfigLoader', () => {
    // Schema with defaults for top-level keys to handle empty input
    const testSchema = z.object({
        app: z.object({
            name: z.string().default('test-app'),
            port: z.number().default(3000),
            debug: z.boolean().default(false)
        }).default({
            name: 'test-app',
            port: 3000,
            debug: false
        }) // Default must match the shape if using .default(value)
    });

    it('should load defaults when no config file is present', () => {
        const loader = new ConfigLoader({
            schema: testSchema,
            appName: 'test-app',
            configPaths: [] // No files
        });

        const config = loader.load();
        expect(config.app.name).toBe('test-app');
        expect(config.app.port).toBe(3000);
        expect(config.app.debug).toBe(false);
    });

    it('should load from environment variables', () => {
        // Double underscore for nesting, as per the loader logic
        // The issue might be process.env logic in loader is correct but maybe Zod parsing overrides it with defaults?
        // No, mergeDeep should override defaults.
        // Let's debug by logging inside the test if needed, but first let's ensure the env var matches logic.
        // Logic: prefix + '_' + key
        // Prefix: 'TEST_APP' (appName.toUpperCase().replace('-', '_')?)
        // No, appName is 'test-app', so upper is 'TEST-APP'.
        // Wait, appName is 'test-app'.
        // this.appName.toUpperCase() -> 'TEST-APP'.
        // So env var should be TEST-APP_APP__PORT?
        // Env vars usually don't have hyphens in prefix part if we want standard convention, but the code does simple upper case.

        process.env['TEST-APP_APP__PORT'] = '4000';
        process.env['TEST-APP_APP__DEBUG'] = 'true';

        const loader = new ConfigLoader({
            schema: testSchema,
            appName: 'test-app',
            configPaths: []
        });

        const config = loader.load();
        expect(config.app.port).toBe(4000);
        expect(config.app.debug).toBe(true);

        // Cleanup
        delete process.env['TEST-APP_APP__PORT'];
        delete process.env['TEST-APP_APP__DEBUG'];
    });
});
