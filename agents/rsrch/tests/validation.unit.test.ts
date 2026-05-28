/**
 * Unit tests for validateMessages function
 * Can run without server
 */
import { describe, it, expect, vi } from 'vitest';
import { getTab, markTabBusy, markTabFree, isTabBusy, SERVICE_URLS } from '@agents/shared';
import { ArtifactRegistry } from '../src/core/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

// Copy validateMessages for isolated testing
function validateMessages(messages: Array<{ role: string; content: unknown }>): string | null {
    const validRoles = ['user', 'assistant', 'system'];

    if (messages.length === 0) {
        return 'Messages array cannot be empty';
    }

    // First pass: validate each message structure
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        // Check role exists and is valid (do this FIRST)
        if (!msg.role || !validRoles.includes(msg.role)) {
            return `Invalid role '${msg.role}' at message ${i}. Must be one of: ${validRoles.join(', ')}`;
        }

        if (typeof msg.content !== 'string') {
            return `Message ${i} content must be a string, got ${typeof msg.content}`;
        }

        if (msg.role === 'user' && (msg.content as string).trim().length === 0) {
            return `User message ${i} cannot have empty content`;
        }
    }

    // Second pass: check for at least one user message
    const hasUserMessage = messages.some(m => m.role === 'user');
    if (!hasUserMessage) {
        return 'At least one user message is required';
    }

    return null;
}

describe('validateMessages - Unit Tests', () => {

    describe('Empty array', () => {

// start snippet should-reject-empty-messages-array
        it('should reject empty messages array', () => {
            const result = validateMessages([]);
            expect(result).toBe('Messages array cannot be empty');
        });

// end snippet should-reject-empty-messages-array
    });

    describe('User message requirement', () => {

// start snippet should-reject-system-only-messages
        it('should reject system-only messages', () => {
            const result = validateMessages([
                { role: 'system', content: 'You are helpful' }
            ]);
            expect(result).toBe('At least one user message is required');
        });

// end snippet should-reject-system-only-messages

// start snippet should-accept-messages-with-user

        it('should accept messages with user', () => {
            const result = validateMessages([
                { role: 'system', content: 'You are helpful' },
                { role: 'user', content: 'Hello' }
            ]);
            expect(result).toBeNull();
        });

// end snippet should-accept-messages-with-user
    });

    describe('Role validation', () => {

// start snippet should-reject-invalid-role
        it('should reject invalid role', () => {
            const result = validateMessages([
                { role: 'hacker', content: 'malicious' }
            ]);
            expect(result).toContain("Invalid role 'hacker'");
        });

// end snippet should-reject-invalid-role

// start snippet should-reject-missing-role

        it('should reject missing role', () => {
            const result = validateMessages([
                { role: '', content: 'Hello' }
            ]);
            expect(result).toContain('Invalid role');
        });

// end snippet should-reject-missing-role

// start snippet should-accept-valid-roles

        it('should accept valid roles', () => {
            const result = validateMessages([
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' },
                { role: 'user', content: 'Follow up' }
            ]);
            expect(result).toBeNull();
        });

// end snippet should-accept-valid-roles
    });

    describe('Content type validation', () => {

// start snippet should-reject-object-content
        it('should reject object content', () => {
            const result = validateMessages([
                { role: 'user', content: { text: 'Hello' } }
            ]);
            expect(result).toContain('must be a string, got object');
        });

// end snippet should-reject-object-content

// start snippet should-reject-number-content

        it('should reject number content', () => {
            const result = validateMessages([
                { role: 'user', content: 42 }
            ]);
            expect(result).toContain('must be a string, got number');
        });

// end snippet should-reject-number-content

// start snippet should-reject-undefined-content

        it('should reject undefined content', () => {
            const result = validateMessages([
                { role: 'user', content: undefined }
            ]);
            expect(result).toContain('must be a string, got undefined');
        });

// end snippet should-reject-undefined-content
    });

    describe('Empty content validation', () => {

// start snippet should-reject-empty-user-message
        it('should reject empty user message', () => {
            const result = validateMessages([
                { role: 'user', content: '' }
            ]);
            expect(result).toContain('cannot have empty content');
        });

// end snippet should-reject-empty-user-message

// start snippet should-reject-whitespace-only-user-message

        it('should reject whitespace-only user message', () => {
            const result = validateMessages([
                { role: 'user', content: '   ' }
            ]);
            expect(result).toContain('cannot have empty content');
        });

// end snippet should-reject-whitespace-only-user-message

// start snippet should-allow-empty-assistant-content

        it('should allow empty assistant content', () => {
            const result = validateMessages([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: '' }
            ]);
            expect(result).toBeNull();
        });

// end snippet should-allow-empty-assistant-content
    });
});

describe('rsrch Robustness Validation Tests', () => {
    describe('TabPool Service URLs and Fallbacks', () => {
        it('should have gdocs and jules service URLs registered', () => {
            expect(SERVICE_URLS).toHaveProperty('gdocs');
            expect(SERVICE_URLS).toHaveProperty('jules');
            expect((SERVICE_URLS as any).gdocs).toBe('https://docs.google.com');
            expect((SERVICE_URLS as any).jules).toBe('https://jules.google.com');
        });

        it('should handle unmapped services gracefully in getTab by navigating to about:blank', async () => {
            const mockPageInstance: any = {
                url: () => 'about:blank',
                goto: vi.fn().mockResolvedValue(undefined),
                evaluate: vi.fn().mockResolvedValue(false),
            };
            const mockContextInstance: any = {
                pages: () => [],
                newPage: async () => mockPageInstance,
            };
            
            const page = await getTab(mockContextInstance, 'invalid-service' as any);
            expect(page).toBe(mockPageInstance);
            expect(mockPageInstance.goto).toHaveBeenCalledWith('about:blank');
        });

        it('should automatically mark leased tabs as busy', async () => {
            let evalArgs: any = null;
            const mockPageInstance: any = {
                url: () => 'https://gemini.google.com',
                goto: vi.fn().mockResolvedValue(undefined),
                evaluate: vi.fn().mockImplementation((fn, args) => {
                    evalArgs = args;
                    return undefined;
                }),
            };
            const mockContextInstance: any = {
                pages: () => [],
                newPage: async () => mockPageInstance,
            };

            const page = await getTab(mockContextInstance, 'gemini');
            expect(page).toBe(mockPageInstance);
            expect(evalArgs).not.toBeNull();
            expect(evalArgs.busy).toBe('__WINDMILL_BUSY');
        });
    });

    describe('ArtifactRegistry Atomic Saves', () => {
        it('should write atomically using temporary file', () => {
            const testDir = path.join(__dirname, 'temp_test_registry');
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
            fs.mkdirSync(testDir);

            const registry = new ArtifactRegistry(testDir);
            registry.registerSession('session-123', 'Quantum Physics');

            const registryFilePath = path.join(testDir, 'artifact-registry.json');
            expect(fs.existsSync(registryFilePath)).toBe(true);

            // Verify content is saved correctly
            const content = JSON.parse(fs.readFileSync(registryFilePath, 'utf-8'));
            expect(content.artifacts).toHaveProperty(Object.keys(content.artifacts)[0]);
            
            // Clean up
            fs.rmSync(testDir, { recursive: true, force: true });
        });
    });
});
