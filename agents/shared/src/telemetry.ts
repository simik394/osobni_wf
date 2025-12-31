/**
 * Unified Langfuse Telemetry for All Agents
 * 
 * Provides comprehensive observability with Langfuse-native concepts:
 * - Traces: Session/conversation level tracking
 * - Generations: LLM calls with token counting
 * - Spans: Thoughts, tool calls, answers
 * - Events: Errors, state changes
 * - Scores: Success metrics
 * 
 * Used by: angrav, rsrch (Gemini/Perplexity), Jules
 */

import { Langfuse, LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================================================
// Types
// ============================================================================

export interface TelemetryConfig {
    enabled: boolean;
    publicKey?: string;
    secretKey?: string;
    host?: string;
    debug?: boolean;
    agentName: string;
}

export interface TraceHandle {
    trace: LangfuseTraceClient;
    name: string;
    startTime: number;
    agentName: string;
}

export interface SpanHandle {
    span: LangfuseSpanClient;
    name: string;
    startTime: number;
    type: 'thought' | 'tool' | 'answer' | 'extraction' | 'custom';
}

export interface GenerationHandle {
    generation: LangfuseGenerationClient;
    model: string;
    startTime: number;
    promptTokens?: number;
}

// ============================================================================
// Configuration
// ============================================================================

function getConfig(agentName: string): TelemetryConfig {
    const enabled = process.env.LANGFUSE_ENABLED !== 'false' &&
        !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

    return {
        enabled,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        host: process.env.LANGFUSE_HOST || process.env.LANGFUSE_URL || 'https://cloud.langfuse.com',
        debug: process.env.LANGFUSE_DEBUG === 'true',
        agentName
    };
}

// ============================================================================
// UnifiedTelemetry Class
// ============================================================================

export class UnifiedTelemetry {
    private langfuse: Langfuse | null = null;
    private config: TelemetryConfig;
    private activeTraces: Map<string, TraceHandle> = new Map();

    constructor(agentName: string, configOverrides?: Partial<TelemetryConfig>) {
        this.config = { ...getConfig(agentName), ...configOverrides };

        if (this.config.enabled && this.config.publicKey && this.config.secretKey) {
            this.langfuse = new Langfuse({
                publicKey: this.config.publicKey,
                secretKey: this.config.secretKey,
                baseUrl: this.config.host
            });

            this.log('Langfuse client initialized');
        }
    }

    private log(message: string): void {
        if (this.config.debug) {
            console.log(`[Telemetry:${this.config.agentName}] ${message}`);
        }
    }

    isEnabled(): boolean {
        return this.langfuse !== null;
    }

    // ========================================================================
    // Trace Management (Session/Conversation Level)
    // ========================================================================

    startTrace(name: string, metadata?: Record<string, any>): TraceHandle | null {
        if (!this.langfuse) return null;

        const trace = this.langfuse.trace({
            name,
            metadata: {
                agent: this.config.agentName,
                ...metadata
            },
            tags: [this.config.agentName, name]
        });

        const handle: TraceHandle = {
            trace,
            name,
            startTime: Date.now(),
            agentName: this.config.agentName
        };

        this.activeTraces.set(name, handle);
        this.log(`Started trace: ${name}`);
        return handle;
    }

    endTrace(handle: TraceHandle | null, output?: string, success: boolean = true): void {
        if (!handle) return;

        const duration = Date.now() - handle.startTime;

        handle.trace.update({
            output: output?.substring(0, 1000),
            metadata: {
                durationMs: duration,
                success
            }
        });

        this.activeTraces.delete(handle.name);
        this.log(`Ended trace: ${handle.name} (${duration}ms, success: ${success})`);
    }

    // ========================================================================
    // Generation Management (LLM Calls with Token Tracking)
    // ========================================================================

    startGeneration(
        trace: TraceHandle | null,
        input: string,
        model: string,
        metadata?: Record<string, any>
    ): GenerationHandle | null {
        if (!trace) return null;

        // Estimate tokens (~4 chars per token)
        const promptTokens = Math.ceil(input.length / 4);

        const generation = trace.trace.generation({
            name: 'llm-call',
            model,
            input: input.substring(0, 2000),
            usage: { promptTokens },
            metadata: {
                inputLength: input.length,
                ...metadata
            }
        });

        this.log(`Started generation: ${model} (${promptTokens} prompt tokens)`);

        return {
            generation,
            model,
            startTime: Date.now(),
            promptTokens
        };
    }

    endGeneration(
        handle: GenerationHandle | null,
        output: string,
        completionTokens?: number
    ): void {
        if (!handle) return;

        const estimatedCompletion = completionTokens ?? Math.ceil(output.length / 4);
        const latency = Date.now() - handle.startTime;

        handle.generation.end({
            output: output.substring(0, 2000),
            usage: {
                promptTokens: handle.promptTokens,
                completionTokens: estimatedCompletion,
                totalTokens: (handle.promptTokens ?? 0) + estimatedCompletion
            },
            completionStartTime: new Date(handle.startTime + latency)
        });

        this.log(`Ended generation: ${handle.model} (${estimatedCompletion} completion tokens, ${latency}ms)`);
    }

    // ========================================================================
    // Span Management (Thoughts, Tools, Answers)
    // ========================================================================

    startThoughtSpan(trace: TraceHandle | null, content: string): SpanHandle | null {
        if (!trace) return null;

        const span = trace.trace.span({
            name: 'thinking',
            input: content.substring(0, 500),
            metadata: { type: 'thought', contentLength: content.length }
        });

        this.log(`Started thought span (${content.length} chars)`);

        return {
            span,
            name: 'thinking',
            startTime: Date.now(),
            type: 'thought'
        };
    }

    startToolSpan(
        trace: TraceHandle | null,
        toolName: string,
        input: any
    ): SpanHandle | null {
        if (!trace) return null;

        const span = trace.trace.span({
            name: `tool:${toolName}`,
            input: typeof input === 'string' ? input.substring(0, 500) : JSON.stringify(input).substring(0, 500),
            metadata: { type: 'tool', toolName }
        });

        this.log(`Started tool span: ${toolName}`);

        return {
            span,
            name: `tool:${toolName}`,
            startTime: Date.now(),
            type: 'tool'
        };
    }

    startAnswerSpan(trace: TraceHandle | null): SpanHandle | null {
        if (!trace) return null;

        const span = trace.trace.span({
            name: 'answer',
            metadata: { type: 'answer' }
        });

        this.log('Started answer span');

        return {
            span,
            name: 'answer',
            startTime: Date.now(),
            type: 'answer'
        };
    }

    startExtractionSpan(
        trace: TraceHandle | null,
        extractionType: string
    ): SpanHandle | null {
        if (!trace) return null;

        const span = trace.trace.span({
            name: `extraction:${extractionType}`,
            metadata: { type: 'extraction', extractionType }
        });

        this.log(`Started extraction span: ${extractionType}`);

        return {
            span,
            name: `extraction:${extractionType}`,
            startTime: Date.now(),
            type: 'extraction'
        };
    }

    endSpan(handle: SpanHandle | null, output?: any, success: boolean = true): void {
        if (!handle) return;

        const duration = Date.now() - handle.startTime;
        const outputStr = typeof output === 'string'
            ? output.substring(0, 500)
            : output ? JSON.stringify(output).substring(0, 500) : undefined;

        handle.span.end({
            output: outputStr,
            statusMessage: success ? 'success' : 'failed',
            metadata: { durationMs: duration, success }
        });

        this.log(`Ended ${handle.type} span: ${handle.name} (${duration}ms)`);
    }

    // ========================================================================
    // Event Tracking
    // ========================================================================

    trackEvent(
        trace: TraceHandle | null,
        name: string,
        data?: Record<string, any>,
        level: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR' = 'DEFAULT'
    ): void {
        if (!trace) return;

        trace.trace.event({
            name,
            level,
            metadata: data
        });

        this.log(`Tracked event: ${name} (${level})`);
    }

    trackError(
        trace: TraceHandle | null,
        error: Error | string,
        context?: Record<string, any>
    ): void {
        if (!trace) return;

        const message = error instanceof Error ? error.message : error;
        const stack = error instanceof Error ? error.stack : undefined;

        trace.trace.event({
            name: 'error',
            level: 'ERROR',
            metadata: {
                message,
                stack,
                ...context
            }
        });

        this.log(`Tracked error: ${message}`);
    }

    // ========================================================================
    // Scores (for Evaluation)
    // ========================================================================

    addScore(
        trace: TraceHandle | null,
        name: string,
        value: number,
        comment?: string
    ): void {
        if (!trace || !this.langfuse) return;

        this.langfuse.score({
            traceId: trace.trace.id,
            name,
            value,
            comment
        });

        this.log(`Added score: ${name} = ${value}`);
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    async flush(): Promise<void> {
        if (this.langfuse) {
            await this.langfuse.flushAsync();
            this.log('Flushed pending events');
        }
    }

    async shutdown(): Promise<void> {
        if (this.langfuse) {
            await this.langfuse.shutdownAsync();
            this.langfuse = null;
            this.log('Shutdown complete');
        }
    }
}

// ============================================================================
// Factory Functions for Each Agent
// ============================================================================

let angravTelemetry: UnifiedTelemetry | null = null;
let rsrchTelemetry: UnifiedTelemetry | null = null;
let julesTelemetry: UnifiedTelemetry | null = null;

export function getAngravTelemetry(): UnifiedTelemetry {
    if (!angravTelemetry) {
        angravTelemetry = new UnifiedTelemetry('angrav');
    }
    return angravTelemetry;
}

export function getRsrchTelemetry(): UnifiedTelemetry {
    if (!rsrchTelemetry) {
        rsrchTelemetry = new UnifiedTelemetry('rsrch');
    }
    return rsrchTelemetry;
}

export function getJulesTelemetry(): UnifiedTelemetry {
    if (!julesTelemetry) {
        julesTelemetry = new UnifiedTelemetry('jules');
    }
    return julesTelemetry;
}

// ============================================================================
// Convenience Export
// ============================================================================

export function createTelemetry(agentName: string): UnifiedTelemetry {
    return new UnifiedTelemetry(agentName);
}
