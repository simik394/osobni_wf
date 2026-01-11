import { Logger, initLogger, getLogger } from '../src/logger';

describe('Logger', () => {
    it('should create a logger with default options', () => {
        const logger = new Logger({ service: 'test-service' });
        expect(logger).toBeDefined();
        expect(logger.getWinstonLogger()).toBeDefined();
    });

    it('should support singleton pattern', () => {
        initLogger({ service: 'singleton-service' });
        const logger1 = getLogger();
        const logger2 = getLogger();
        expect(logger1).toBe(logger2);
    });

    it('should log messages without error', () => {
        const logger = new Logger({ service: 'test-service', environment: 'test' });

        // Mock stdout to avoid cluttering test output
        const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

        // Winston writes to stdout/stderr depending on transport.
        // Since we didn't add File transport, it should go to console.

        // Just verify these don't throw
        expect(() => logger.info('Test info')).not.toThrow();
        expect(() => logger.error('Test error')).not.toThrow();

        spy.mockRestore();
    });
});
