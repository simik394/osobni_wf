// Windmill Script: notify_audio_start
// Sends notification when audio generation starts
// Observable and extensible - currently just calls ntfy

export async function main(args: {
    source_title: string;
    notebook_title: string;
    source_index?: number;
    total_sources?: number;
}) {
    const { source_title, notebook_title, source_index, total_sources } = args;

    const ntfyTopic = Deno.env.get("NTFY_TOPIC") || "rsrch-audio";
    const ntfyServer = Deno.env.get("NTFY_SERVER") || "https://ntfy.sh";

    const title = `🎵 Starting: ${source_title.substring(0, 40)}`;
    const message = source_index && total_sources
        ? `Generating audio for source ${source_index}/${total_sources}\nNotebook: ${notebook_title}`
        : `Generating audio\nNotebook: ${notebook_title}`;

    const startTime = Date.now();

    try {
        const response = await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: "POST",
            headers: {
                "Title": title,
                "Tags": "hourglass_flowing_sand,audio",
            },
            body: message,
        });

        if (!response.ok) {
            console.error(`ntfy response: ${response.status} ${response.statusText}`);
        }

        return {
            success: true,
            source_title,
            notebook_title,
            start_time: startTime,
            start_time_iso: new Date(startTime).toISOString(),
            notification_sent: true,
        };
    } catch (error) {
        console.error(`Failed to send ntfy notification: ${error}`);
        return {
            success: true, // Still return success - notification failure shouldn't block generation
            source_title,
            notebook_title,
            start_time: startTime,
            start_time_iso: new Date(startTime).toISOString(),
            notification_sent: false,
            notification_error: String(error),
        };
    }
}
