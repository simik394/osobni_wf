/**
 * Shared Agent Utilities
 */

export { FalkorClient, getFalkorClient } from './falkor-client';
export type { Session, Interaction, Artifact } from './falkor-client';

// Unified Telemetry
export {
    UnifiedTelemetry,
    createTelemetry,
    getAngravTelemetry,
    getRsrchTelemetry,
    getJulesTelemetry
} from './telemetry';
export type {
    TelemetryConfig,
    TraceHandle,
    SpanHandle,
    GenerationHandle
} from './telemetry';

// Windmill Proxy
export {
    createWindmillProxyMiddleware,
    proxyChatCompletion,
    shouldBypass,
    isWindmillProxyEnabled,
    runWindmillJob
} from './windmill-proxy';
export type { WindmillConfig, ChatCompletionRequest } from './windmill-proxy';
