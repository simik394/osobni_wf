"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiedTelemetry = void 0;
exports.getAngravTelemetry = getAngravTelemetry;
exports.getRsrchTelemetry = getRsrchTelemetry;
exports.getJulesTelemetry = getJulesTelemetry;
exports.createTelemetry = createTelemetry;
const langfuse_1 = require("langfuse");
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
// ============================================================================
// Configuration
// ============================================================================
function getConfig(agentName) {
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
class UnifiedTelemetry {
    constructor(agentName, configOverrides) {
        this.langfuse = null;
        this.activeTraces = new Map();
        this.config = { ...getConfig(agentName), ...configOverrides };
        if (this.config.enabled && this.config.publicKey && this.config.secretKey) {
            this.langfuse = new langfuse_1.Langfuse({
                publicKey: this.config.publicKey,
                secretKey: this.config.secretKey,
                baseUrl: this.config.host
            });
            this.log('Langfuse client initialized');
        }
    }
    log(message) {
        if (this.config.debug) {
            console.log(`[Telemetry:${this.config.agentName}] ${message}`);
        }
    }
    isEnabled() {
        return this.langfuse !== null;
    }
    // ========================================================================
    // Trace Management (Session/Conversation Level)
    // ========================================================================
    startTrace(name, metadata) {
        if (!this.langfuse)
            return null;
        const trace = this.langfuse.trace({
            name,
            metadata: {
                agent: this.config.agentName,
                ...metadata
            },
            tags: [this.config.agentName, name]
        });
        const handle = {
            trace,
            name,
            startTime: Date.now(),
            agentName: this.config.agentName
        };
        this.activeTraces.set(name, handle);
        this.log(`Started trace: ${name}`);
        return handle;
    }
    endTrace(handle, output, success = true) {
        if (!handle)
            return;
        const duration = Date.now() - handle.startTime;
        handle.trace.update({
            output: output === null || output === void 0 ? void 0 : output.substring(0, 1000),
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
    startGeneration(trace, input, model, metadata) {
        if (!trace)
            return null;
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
    endGeneration(handle, output, completionTokens) {
        var _a;
        if (!handle)
            return;
        const estimatedCompletion = completionTokens !== null && completionTokens !== void 0 ? completionTokens : Math.ceil(output.length / 4);
        const latency = Date.now() - handle.startTime;
        handle.generation.end({
            output: output.substring(0, 2000),
            usage: {
                promptTokens: handle.promptTokens,
                completionTokens: estimatedCompletion,
                totalTokens: ((_a = handle.promptTokens) !== null && _a !== void 0 ? _a : 0) + estimatedCompletion
            },
            completionStartTime: new Date(handle.startTime + latency)
        });
        this.log(`Ended generation: ${handle.model} (${estimatedCompletion} completion tokens, ${latency}ms)`);
    }
    // ========================================================================
    // Span Management (Thoughts, Tools, Answers)
    // ========================================================================
    startThoughtSpan(trace, content) {
        if (!trace)
            return null;
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
    startToolSpan(trace, toolName, input) {
        if (!trace)
            return null;
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
    startAnswerSpan(trace) {
        if (!trace)
            return null;
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
    startExtractionSpan(trace, extractionType) {
        if (!trace)
            return null;
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
    endSpan(handle, output, success = true) {
        if (!handle)
            return;
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
    trackEvent(trace, name, data, level = 'DEFAULT') {
        if (!trace)
            return;
        trace.trace.event({
            name,
            level,
            metadata: data
        });
        this.log(`Tracked event: ${name} (${level})`);
    }
    trackError(trace, error, context) {
        if (!trace)
            return;
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
    addScore(trace, name, value, comment) {
        if (!trace || !this.langfuse)
            return;
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
    async flush() {
        if (this.langfuse) {
            await this.langfuse.flushAsync();
            this.log('Flushed pending events');
        }
    }
    async shutdown() {
        if (this.langfuse) {
            await this.langfuse.shutdownAsync();
            this.langfuse = null;
            this.log('Shutdown complete');
        }
    }
}
exports.UnifiedTelemetry = UnifiedTelemetry;
// ============================================================================
// Factory Functions for Each Agent
// ============================================================================
let angravTelemetry = null;
let rsrchTelemetry = null;
let julesTelemetry = null;
function getAngravTelemetry() {
    if (!angravTelemetry) {
        angravTelemetry = new UnifiedTelemetry('angrav');
    }
    return angravTelemetry;
}
function getRsrchTelemetry() {
    if (!rsrchTelemetry) {
        rsrchTelemetry = new UnifiedTelemetry('rsrch');
    }
    return rsrchTelemetry;
}
function getJulesTelemetry() {
    if (!julesTelemetry) {
        julesTelemetry = new UnifiedTelemetry('jules');
    }
    return julesTelemetry;
}
// ============================================================================
// Convenience Export
// ============================================================================
function createTelemetry(agentName) {
    return new UnifiedTelemetry(agentName);
}
