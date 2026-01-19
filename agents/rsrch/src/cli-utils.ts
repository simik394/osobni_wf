import { config } from './config';
import { PerplexityClient } from './client';
import { cliContext } from './cli-context';

export interface ServerOptions {
    server?: string;
    local?: boolean;
    cdp?: string;
}

const DEFAULT_SERVER_URL = process.env.RSRCH_SERVER_URL || 'http://localhost:3001';

// --- Helpers from index.ts ---

// ntfy notification helper
export async function notifyNtfy(title: string, message: string, tags?: string[]) {
    const ntfyTopic = config.notifications.ntfy?.topic || 'rsrch-audio';
    const ntfyServer = config.notifications.ntfy?.server || 'https://ntfy.sh';
    try {
        await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: 'POST',
            headers: {
                'Title': title,
                'Tags': (tags || ['audio']).join(',')
            },
            body: message
        });
    } catch (e) {
        console.error(`[ntfy] Failed to send notification: ${e}`);
    }
}

// Helper to send request to server (returns data for programmatic use)
export async function sendServerRequest(path: string, body: any = {}): Promise<any> {
    const port = config.port;
    const url = `http://localhost:${port}${path}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Server error: ${response.status} ${err}`);
        }

        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
        return data;
    } catch (e: any) {
        console.error(`Failed to communicate with server at port ${port}. Is it running?`);
        console.error(e.message);
        process.exit(1);
    }
}

// Helper to send request with SSE streaming (prints progress to console)
export async function sendServerRequestWithSSE(path: string, body: any = {}): Promise<any> {
    const port = config.port;
    const url = `http://localhost:${port}${path}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Server error: ${response.status} ${err}`);
        }

        // Parse SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result: any = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'log') {
                            // Print progress message to console
                            console.log(data.message);
                        } else if (data.type === 'result') {
                            // Final result
                            result = data;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }

        return result;
    } catch (e: any) {
        console.error(`Failed to communicate with server at port ${port}. Is it running?`);
        console.error(e.message);
        process.exit(1);
    }
}

// Helper for local Notebook execution
export async function runLocalNotebookAction(action: (client: PerplexityClient, notebook: any) => Promise<void>) {
    const { profileId, cdpEndpoint } = cliContext.get();
    console.log(`Running in LOCAL mode (profile: ${profileId})...`);
    const client = new PerplexityClient({ profileId, cdpEndpoint });
    await client.init({ profileId, cdpEndpoint });
    const notebook = await client.createNotebookClient();
    try {
        await action(client, notebook);
    } finally {
        await client.close();
    }
}

// Helper for local Gemini execution
export async function runLocalGeminiAction(action: (client: PerplexityClient, gemini: any) => Promise<void>, sessionId?: string, hasLocalFlag: boolean = true) {
    const { profileId, cdpEndpoint } = cliContext.get();
    // If CDP endpoint is provided, force REMOTE mode
    const useLocalMode = cdpEndpoint ? false : hasLocalFlag;
    console.log(`Running Gemini in ${useLocalMode ? 'LOCAL' : 'REMOTE BROWSER'} mode...`);
    const client = new PerplexityClient({ profileId, cdpEndpoint });
    await client.init({ local: useLocalMode, profileId, cdpEndpoint });
    const gemini = await client.createGeminiClient();
    await gemini.init(sessionId); // Pass sessionId to navigate directly
    try {
        await action(client, gemini);
    } finally {
        await client.close();
    }
}

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

/**
 * Execute a Gemini command with SSE streaming.
 */
export async function executeGeminiStream(
    endpoint: string,
    args: Record<string, any>,
    opts: ServerOptions,
    onEvent: (data: any) => void
): Promise<any> {
    const serverUrl = opts.server || DEFAULT_SERVER_URL;
    const url = `${serverUrl}/gemini/${endpoint}`;

    console.log(`[CLI] Calling server (stream): ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify(args)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server returned ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.substring(6));
                        onEvent(data);
                        if (data.type === 'result') return data;
                    } catch (e) {
                        console.error('[CLI] Failed to parse SSE data:', line);
                    }
                }
            }
        }
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

// Helper to get options with globals (merging parent options)
export function getOptionsWithGlobals(command: any): any {
    let options = {};
    let current = command;
    while (current) {
        options = { ...current.opts(), ...options };
        current = current.parent;
    }
    return options;
}
