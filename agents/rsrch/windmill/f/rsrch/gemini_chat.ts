/**
 * Windmill Script: Execute Gemini Chat via RSRCH Server API
 *
 * Instead of importing local modules, this script makes an HTTP call
 * to the rsrch server's /gemini/chat endpoint with a bypass header.
 */

// Windmill entrypoint
export async function main(
    message: string,
    session_id?: string,
    wait_for_response: boolean = true,
    rsrch_server_url: string = 'http://rsrch:3030'
): Promise<{ success: boolean; response?: string; session_id?: string; error?: string }> {
    console.log(`🚀 Gemini Chat via rsrch API: "${message.substring(0, 50)}..." (Session: ${session_id || 'new'})`);

    try {
        const response = await fetch(`${rsrch_server_url}/gemini/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Bypass-Windmill': 'true' // Prevent infinite loop
            },
            body: JSON.stringify({
                message,
                sessionId: session_id,
                waitForResponse: wait_for_response
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Unknown API error');
        }

        return {
            success: true,
            response: result.data?.response,
            session_id: result.data?.sessionId
        };

    } catch (error: any) {
        console.error('❌ Gemini Chat failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}
