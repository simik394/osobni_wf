// Windmill Script: notify_audio_complete
// Sends notification when audio generation completes
// Observable and extensible - currently just calls ntfy

export async function main(args: {
    source_title: string;
    notebook_title: string;
    start_time: number;
    success: boolean;
    artifact_title?: string;
    source_index?: number;
    total_sources?: number;
}) {
    const { source_title, notebook_title, start_time, success, artifact_title, source_index, total_sources } = args;

    const ntfyTopic = Deno.env.get("NTFY_TOPIC") || "rsrch-audio";
    const ntfyServer = Deno.env.get("NTFY_SERVER") || "https://ntfy.sh";

    const endTime = Date.now();
    const durationMs = endTime - start_time;
    const durationSec = Math.round(durationMs / 1000);
    const durationMin = Math.floor(durationSec / 60);
    const durationSecRemainder = durationSec % 60;
    const durationStr = `${durationMin}m ${durationSecRemainder}s`;

    const title = success
        ? `✅ Complete: ${source_title.substring(0, 40)}`
        : `❌ Failed: ${source_title.substring(0, 40)}`;

    const message = success
        ? `Audio generated in ${durationStr}${source_index && total_sources ? `\nSource ${source_index}/${total_sources}` : ""}${artifact_title ? `\nArtifact: ${artifact_title}` : ""}`
        : `Audio generation failed after ${durationStr}`;

    const tags = success ? "white_check_mark,audio" : "x,warning";

    try {
        const response = await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: "POST",
            headers: {
                "Title": title,
                "Tags": tags,
            },
            body: message,
        });

        if (!response.ok) {
            console.error(`ntfy response: ${response.status} ${response.statusText}`);
        }

        return {
            success,
            source_title,
            notebook_title,
            artifact_title,
            start_time,
            end_time: endTime,
            duration_ms: durationMs,
            duration_str: durationStr,
            notification_sent: true,
        };
    } catch (error) {
        console.error(`Failed to send ntfy notification: ${error}`);
        return {
            success,
            source_title,
            notebook_title,
            artifact_title,
            start_time,
            end_time: endTime,
            duration_ms: durationMs,
            duration_str: durationStr,
            notification_sent: false,
            notification_error: String(error),
        };
    }
}
