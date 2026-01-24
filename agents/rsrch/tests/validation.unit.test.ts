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

// #region test:should-reject-empty-messages-array
        it('should reject empty messages array', () => {
            const result = validateMessages([]);
            expect(result).toBe('Messages array cannot be empty');
        });

// #endregion test:should-reject-empty-messages-array
    });

    describe('User message requirement', () => {

// #region test:should-reject-system-only-messages
        it('should reject system-only messages', () => {
            const result = validateMessages([
                { role: 'system', content: 'You are helpful' }
            ]);
            expect(result).toBe('At least one user message is required');
        });

// #endregion test:should-reject-system-only-messages

// #region test:should-accept-messages-with-user

        it('should accept messages with user', () => {
            const result = validateMessages([
                { role: 'system', content: 'You are helpful' },
                { role: 'user', content: 'Hello' }
            ]);
            expect(result).toBeNull();
        });

// #endregion test:should-accept-messages-with-user
    });

    describe('Role validation', () => {

// #region test:should-reject-invalid-role
        it('should reject invalid role', () => {
            const result = validateMessages([
                { role: 'hacker', content: 'malicious' }
            ]);
            expect(result).toContain("Invalid role 'hacker'");
        });

// #endregion test:should-reject-invalid-role

// #region test:should-reject-missing-role

        it('should reject missing role', () => {
            const result = validateMessages([
                { role: '', content: 'Hello' }
            ]);
            expect(result).toContain('Invalid role');
        });

// #endregion test:should-reject-missing-role

// #region test:should-accept-valid-roles

        it('should accept valid roles', () => {
            const result = validateMessages([
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' },
                { role: 'user', content: 'Follow up' }
            ]);
            expect(result).toBeNull();
        });

// #endregion test:should-accept-valid-roles
    });

    describe('Content type validation', () => {

// #region test:should-reject-object-content
        it('should reject object content', () => {
            const result = validateMessages([
                { role: 'user', content: { text: 'Hello' } }
            ]);
            expect(result).toContain('must be a string, got object');
        });

// #endregion test:should-reject-object-content

// #region test:should-reject-number-content

        it('should reject number content', () => {
            const result = validateMessages([
                { role: 'user', content: 42 }
            ]);
            expect(result).toContain('must be a string, got number');
        });

// #endregion test:should-reject-number-content

// #region test:should-reject-undefined-content

        it('should reject undefined content', () => {
            const result = validateMessages([
                { role: 'user', content: undefined }
            ]);
            expect(result).toContain('must be a string, got undefined');
        });

// #endregion test:should-reject-undefined-content
    });

    describe('Empty content validation', () => {

// #region test:should-reject-empty-user-message
        it('should reject empty user message', () => {
            const result = validateMessages([
                { role: 'user', content: '' }
            ]);
            expect(result).toContain('cannot have empty content');
        });

// #endregion test:should-reject-empty-user-message

// #region test:should-reject-whitespace-only-user-message

        it('should reject whitespace-only user message', () => {
            const result = validateMessages([
                { role: 'user', content: '   ' }
            ]);
            expect(result).toContain('cannot have empty content');
        });

// #endregion test:should-reject-whitespace-only-user-message

// #region test:should-allow-empty-assistant-content

        it('should allow empty assistant content', () => {
            const result = validateMessages([
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: '' }
            ]);
            expect(result).toBeNull();
        });

// #endregion test:should-allow-empty-assistant-content
    });
});
