
export class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly isOperational: boolean;

    constructor(message: string, code: string = 'INTERNAL_ERROR', statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Object.setPrototypeOf(this, new.target.prototype);
        Error.captureStackTrace(this);
    }
}

export class NetworkError extends AppError {
    constructor(message: string) {
        super(message, 'NETWORK_ERROR', 503);
    }
}

export class ConfigError extends AppError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR', 500, false); // Usually fatal at startup
    }
}

export class ValidationError extends AppError {
    public readonly details: any;

    constructor(message: string, details?: any) {
        super(message, 'VALIDATION_ERROR', 400);
        this.details = details;
    }
}

export class NotFoundError extends AppError {
    constructor(message: string) {
        super(message, 'NOT_FOUND', 404);
    }
}

export class AuthError extends AppError {
    constructor(message: string) {
        super(message, 'UNAUTHORIZED', 401);
    }
}
