import { Page } from 'playwright';
import { GraphStore } from '../graph-store';

/**
 * Universal context for browser-based actions.
 * This allows actions to be stateless and portable between
 * local execution, server orchestration, and Windmill workers.
 */
export interface UniversalContext {
    page: Page;
    log: (message: string, level?: 'info' | 'warn' | 'error') => void;
    db?: GraphStore; 
}

/**
 * Base dependencies for Gemini actions
 */
export interface GeminiActionDeps {
    selectors: {
        gemini: any;
    };
    telemetry?: {
        trackEvent: (trace: any, name: string, data?: any, level?: any) => void;
    };
}

/**
 * Base dependencies for NotebookLM actions
 */
export interface NotebookLMActionDeps {
    selectors: any; // NotebookLM doesn't have a single "notebooklm" property, it's several categories
    telemetry?: {
        trackEvent: (trace: any, name: string, data?: any, level?: any) => void;
    };
}
