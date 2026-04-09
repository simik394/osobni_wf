
import { Page } from 'playwright';
import { GeminiClient } from '../clients/gemini';
import { config } from '../config';
import { selectors } from '../selectors';
import { GraphStore } from '../core/graph-store';

/**
 * Universal context for browser-based actions.
 * Provides a common set of dependencies needed by any modular action.
 */
export interface UniversalContext {
    page: Page;
    log: (message: string, level?: 'info' | 'warn' | 'error') => void;
    config: typeof config;
}

/**
 * Standard dependencies for actions.
 */
export interface ActionDeps {
    selectors: typeof selectors;
    config?: typeof config;
}

/**
 * Gemini-specific action dependencies.
 */
export type GeminiActionDeps = ActionDeps & {
    checkAuth: () => Promise<boolean>;
    setModel: (model: string) => Promise<boolean>;
    uploadFiles: (files: string[]) => Promise<boolean>;
    injectSources: (sources: any[]) => Promise<void>;
    injectText: (text: string) => Promise<void>;
    resetToNewChat: () => Promise<void>;
    recycle: () => Promise<void>;
    telemetry: any;
    verbose: boolean;
    getGraphStore: () => any;
    getLatestResponse: () => Promise<string | null>;
    getLatestResponseData: () => Promise<{ text: string, markdown: string, sources: any[], thoughts?: string } | null>;
    getCurrentSessionId: () => string | null;
    dumpState: (prefix: string) => Promise<any>;
};

/**
 * NotebookLM-specific action dependencies.
 */
export type NotebookLMActionDeps = ActionDeps & {
    humanDelay: (ms: number, variance?: number) => Promise<void>;
    dumpState?: (prefix?: string) => Promise<any>;
    openNotebook?: (title: string) => Promise<void>;
    maximizeStudio?: () => Promise<void>;
    getAudioArtifactTitles?: () => Promise<string[]>;
    selectSources?: (sources: string[] | string) => Promise<void>;
    triggerAudioGeneration?: (prompt?: string, dry?: boolean, title?: string) => Promise<boolean>;
    waitForGeneration?: (title?: string) => Promise<void>;
    renameArtifact?: (old: string, newT: string) => Promise<boolean>;
    enqueueTask?: (name: string, task: () => Promise<any>) => Promise<any>;
    setIsBusy?: (busy: boolean) => void;
    getIsBusy?: () => boolean;
    recycle?: () => Promise<void>;
};

/**
 * Perplexity-specific action dependencies.
 */
export type PerplexityActionDeps = ActionDeps & {
    humanDelay?: (ms: number) => Promise<void>;
    dumpState?: (prefix: string) => Promise<any>;
};

/**
 * AI Mode (Google Search AI) action dependencies.
 */
export type AIModeActionDeps = ActionDeps & {
    humanDelay?: (ms: number, variance?: number) => Promise<void>;
    dumpState?: (prefix: string) => Promise<any>;
    getGraphStore?: () => any;
};


