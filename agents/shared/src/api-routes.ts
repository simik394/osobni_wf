/**
 * Unified API Routes Configuration
 * This file serves as the Single Source of Truth for Gemini API endpoints
 * to ensure synchronization between the CLI and the Server.
 */

export const GEMINI_API_ROUTES = {
    // GET Endpoints
    SESSIONS: 'sessions',
    INFO: 'info',
    RESPONSES: 'responses',
    RESEARCH_DOCS: 'research-docs',
    MODEL_STATUS: 'environment/model-status',
    
    // POST Endpoints
    SESSION_OPEN: 'session/open',
    SESSION_SHARE: 'session/share',
    SESSION_PIN: 'pin',
    SESSION_UNPIN: 'unpin',
    SESSION_RENAME: 'session/rename',
    SESSION_DELETE: 'session/delete',

    // Canvas Endpoints
    CANVAS_LIST: 'canvas/list',
    CANVAS_READ: 'canvas/read',
    CANVAS_OPEN: 'canvas/open',
    CANVAS_UPDATE: 'canvas/update',
    CANVAS_TAB: 'canvas/tab',
    CANVAS_CLOSE: 'canvas/close',
    CANVAS_VERSIONS: 'canvas/versions',
    CANVAS_RESTORE: 'canvas/restore',
    CANVAS_PROMPT: 'canvas/prompt',
    CANVAS_EXPORT: 'canvas/export',
    CANVAS_ARCHIVE: 'canvas/archive'
} as const;
