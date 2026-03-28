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
    checkAuth?: () => Promise<boolean>;
    setModel?: (model: string) => Promise<void>;
    uploadFiles?: (files: string[]) => Promise<string[]>;
    injectSources?: (sources: any[]) => Promise<void>;
    injectText?: (text: string) => Promise<void>;
    resetToNewChat?: () => Promise<void>;
    telemetry?: any;
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
};
