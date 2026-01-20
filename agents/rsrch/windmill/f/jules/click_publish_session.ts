// Windmill Script: click_publish_session
// Triggers Jules session publishing and returns immediately.
// Follows the non-blocking pattern for browser automation.

export async function main(
    session_id: string,
    mode: "pr" | "branch" = "pr"
) {
    const rsrchUrl = process.env.RSRCH_SERVER_URL || "http://localhost:3030";

    console.log(`[Windmill] Triggering Jules publish for session: ${session_id} (mode: ${mode})`);

    // We use the internal /jules/publish-session endpoint
    const response = await fetch(`${rsrchUrl}/jules/publish-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            sessionId: session_id,
            mode,
            waitForCompletion: false // Trigger and return
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`rsrch server responded with ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
        success: true,
        session_id,
        rsrch_response: data
    };
}
