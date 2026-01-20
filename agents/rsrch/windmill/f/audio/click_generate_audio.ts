// Windmill Script: click_generate_audio
// Triggers audio generation for a source and updates FalkorDB state
// NON-BLOCKING: Returns immediately after clicking, does NOT wait for completion
// 
// Architecture per agents/rsrch/AGENTS.md:
// 1. Click to generate → Update FalkorDB with pending audio → Return immediately
// 2. Watcher (separate) monitors completion → Webhook updates FalkorDB + ntfy

interface AudioGenerationResult {
    success: boolean;
    notebook_id: string;
    source_title: string;
    pending_audio_id: string;
    started_at: number;
    error?: string;
}

export async function main(
    notebook_title: string,
    source_title: string,
    custom_prompt?: string
): Promise<AudioGenerationResult> {
    const startTime = Date.now();
    const rsrchUrl = process.env.RSRCH_SERVER_URL || "http://localhost:3030";

    try {
        // 1. Call rsrch server to trigger generation (non-blocking)
        const response = await fetch(`${rsrchUrl}/notebooklm/generate-audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                notebookTitle: notebook_title,
                sources: [source_title],
                customPrompt: custom_prompt,
                waitForCompletion: false, // NON-BLOCKING!
                dryRun: false
            }),
        });

        if (!response.ok) {
            throw new Error(`rsrch server responded with ${response.status}`);
        }

        const data = await response.json();

        // 2. Update FalkorDB with pending audio state
        const pendingAudioId = `pending_audio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const falkorResponse = await fetch(`${rsrchUrl}/graph/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: `
          MATCH (n:Notebook)-[:HAS_SOURCE]->(s:Source {title: "${source_title}"})
          WHERE n.title CONTAINS "${notebook_title.substring(0, 30)}"
          CREATE (pa:PendingAudio {
            id: "${pendingAudioId}",
            notebookId: n.id,
            sourceTitle: "${source_title}",
            status: "generating",
            startedAt: ${startTime},
            customPrompt: "${custom_prompt || ""}"
          })
          CREATE (s)-[:GENERATING]->(pa)
          RETURN n.id as notebookId
        `
            })
        });

        const graphData = await falkorResponse.json().catch(() => ({ notebookId: "unknown" }));

        // 3. Send start notification
        const ntfyTopic = process.env.NTFY_TOPIC || "rsrch-audio";
        const ntfyServer = process.env.NTFY_SERVER || "https://ntfy.sh";

        await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: "POST",
            headers: {
                "Title": `🎵 Started: ${source_title.substring(0, 40)}`,
                "Tags": "hourglass_flowing_sand,audio"
            },
            body: `Generating audio for: ${source_title}\nNotebook: ${notebook_title}`
        }).catch(e => console.error("ntfy failed:", e));

        // 4. Return immediately (non-blocking)
        return {
            success: true,
            notebook_id: graphData.notebookId || "unknown",
            source_title: source_title,
            pending_audio_id: pendingAudioId,
            started_at: startTime
        };

    } catch (error) {
        return {
            success: false,
            notebook_id: "unknown",
            source_title: source_title,
            pending_audio_id: "",
            started_at: startTime,
            error: String(error)
        };
    }
}
