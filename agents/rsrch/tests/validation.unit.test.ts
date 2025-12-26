/**
 * Unit tests for validateMessages function
 * Can run without server
 */
import { describe, it, expect } from 'vitest';

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
        it('should reject empty messages array', () => {
            const result = validateMessages([]);
            expect(result).toBe('Messages array cannot be empty');
        });
    });

    describe('User message requirement', () => {
        it('should reject system-only messages', () => {
            const result = validateMessages([
                { role: 'system', content: 'You are helpful' }
            ]);
            expect(result).toBe('At least one user message is required');
        });

        it('should accept messages with user', () => {
            const result = validateMessages([
                { role: 'system', content: 'You are helpful' },
                { role: 'user', content: 'Hello' }
            ]);
            expect(result).toBeNull();
        });
    });

    describe('Role validation', () => {
        it('should reject invalid role', () => {
            const result = validateMessages([
                { role: 'hacker', content: 'malicious' }
            ]);
            expect(result).toContain("Invalid role 'hacker'");
        });

        it('should reject missing role', () => {
            const result = validateMessages([
                { role: '', content: 'Hello' }
            ]);
            expect(result).toContain('Invalid role');
        });

        it('should accept valid roles', () => {
            const result = validateMessages([
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' },
                { role: 'user', content: 'Follow up' }
            ]);
            expect(result).toBeNull();
        });
    });

    describe('Content type validation', () => {
        it('should reject object content', () => {
            const result = validateMessages([
                { role: 'user', content: { text: 'Hello' } }
            ]);
            expect(result).toContain('must be a string, got object');
        });

        it('should reject number content', () => {
            const result = validateMessages([
                { role: 'user', content: 42 }
            ]);
            expect(result).toContain('must be a string, got number');
        });

        it('should reject undefined content', () => {
            const result = validateMessages([
                { role: 'user', content: undefined }
            ]);
            expect(result).toContain('must be a string, got undefined');
        });
    });

    describe('Empty content validation', () => {
        it('should reject empty user message', () => {
            const result = validateMessages([
                { role: 'user', content: '' }
            ]);
            expect(result).toContain('cannot have empty content');
        });

        it('should reject whitespace-only user message', () => {
            const result = validateMessages([
                { role: 'user', content: '   ' }
            ]);
            expect(result).toContain('cannot have empty content');
        });

        it('should allow empty assistant content', () => {
            const result = validateMessages([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: '' }
            ]);
            expect(result).toBeNull();
        });
    });
});
