/**
 * CLI utilities for production-first command execution.
 * All commands go through the server API by default.
 * Use --local flag for development mode (direct browser).
 */

export interface ServerOptions {
    server?: string;
    local?: boolean;
    cdp?: string;
}

const DEFAULT_SERVER_URL = process.env.RSRCH_SERVER_URL || 'http://localhost:3001';

/**
 * Execute a Gemini command via the server API.
 * @param endpoint - The Gemini endpoint (e.g., 'chat', 'list-sessions')
 * @param args - Request body arguments
 * @param opts - Server options
 */
export async function executeGeminiCommand(
    endpoint: string,
    args: Record<string, any>,
    opts: ServerOptions
): Promise<any> {
    const serverUrl = opts.server || DEFAULT_SERVER_URL;
    const url = `${serverUrl}/gemini/${endpoint}`;

    console.log(`[CLI] Calling server: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server returned ${response.status}`);
        }

        return response.json();
    } catch (e: any) {
        if (e.cause?.code === 'ECONNREFUSED') {
            throw new Error(`Server not reachable at ${serverUrl}. Start server with 'rsrch serve' or use --local flag.`);
        }
        throw e;
    }
}

/**
 * Execute a GET request to the server API.
 */
export async function executeGeminiGet(
    endpoint: string,
    params: Record<string, any>,
    opts: ServerOptions
): Promise<any> {
    const serverUrl = opts.server || DEFAULT_SERVER_URL;
    const queryString = new URLSearchParams(
        Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    ).toString();
    const url = `${serverUrl}/gemini/${endpoint}${queryString ? `?${queryString}` : ''}`;

    console.log(`[CLI] Calling server: ${url}`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server returned ${response.status}`);
        }

        return response.json();
    } catch (e: any) {
        if (e.cause?.code === 'ECONNREFUSED') {
            throw new Error(`Server not reachable at ${serverUrl}. Start server with 'rsrch serve' or use --local flag.`);
        }
        throw e;
    }
}

export function getServerUrl(opts: ServerOptions): string {
    return opts.server || DEFAULT_SERVER_URL;
}
