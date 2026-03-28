/**
 * Custom Error Classes for the rsrch agent
 */

/**
 * Represents an error returned from an API (e.g., 4xx or 5xx status code).
 */
export class ApiError extends Error {
    constructor(message: string, public status: number, public statusText: string) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * Represents a network-level error (e.g., connection refused, timeout).
 */
export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

/**
 * Represents an authentication or authorization error (e.g., 401 Unauthorized, 403 Forbidden).
 */
export class AuthError extends ApiError {
    constructor(message: string, status: number, statusText: string) {
        super(message, status, statusText);
        this.name = 'AuthError';
    }
}
