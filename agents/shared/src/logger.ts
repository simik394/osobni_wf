import * as winston from 'winston';

export interface LoggerOptions {
    service: string;
    level?: string;
    environment?: 'development' | 'production' | 'test';
}

export class Logger {
    private logger: winston.Logger;

    constructor(options: LoggerOptions) {
        const level = options.level || (options.environment === 'production' ? 'info' : 'debug');

        const formats = [
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.splat(),
            winston.format.json()
        ];

        // Add console transport with appropriate formatting
        const transports: winston.transport[] = [];

        if (options.environment !== 'production') {
            transports.push(new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
                        let msg = `${timestamp} [${service}] ${level}: ${message}`;
                        if (Object.keys(metadata).length > 0) {
                            msg += ` ${JSON.stringify(metadata)}`;
                        }
                        return msg;
                    })
                )
            }));
        } else {
            transports.push(new winston.transports.Console());
        }

        this.logger = winston.createLogger({
            level,
            defaultMeta: { service: options.service, environment: options.environment },
            format: winston.format.combine(...formats),
            transports
        });
    }

    public debug(message: string, meta?: any): void {
        this.logger.debug(message, meta);
    }

    public info(message: string, meta?: any): void {
        this.logger.info(message, meta);
    }

    public warn(message: string, meta?: any): void {
        this.logger.warn(message, meta);
    }

    public error(message: string, meta?: any): void {
        this.logger.error(message, meta);
    }

    // Access underlying winston logger if needed
    public getWinstonLogger(): winston.Logger {
        return this.logger;
    }
}

// Global default logger instance for convenience
let defaultLogger: Logger | null = null;

export function initLogger(options: LoggerOptions): Logger {
    defaultLogger = new Logger(options);
    return defaultLogger;
}

export function getLogger(): Logger {
    if (!defaultLogger) {
        // Fallback to a default development logger
        defaultLogger = new Logger({ service: 'shared', environment: 'development' });
    }
    return defaultLogger;
}
