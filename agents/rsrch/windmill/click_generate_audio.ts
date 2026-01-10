// Windmill Script: click_generate_audio
// Triggers audio generation for a source and updates FalkorDB state
// NON-BLOCKING: Returns immediately after clicking, does NOT wait for completion
// 
// Architecture per GEMINI.md:
// 1. Click to generate → Update FalkorDB with pending audio → Return immediately
// 2. Watcher (separate) monitors completion → Webhook updates FalkorDB + ntfy

import * as wmill from "windmill-client";

interface AudioGenerationRequest {
    notebook_title: string;
    source_title: string;
    custom_prompt?: string;
}

interface AudioGenerationResult {
    success: boolean;
    notebook_id: string;
    source_title: string;
    pending_audio_id: string;
    started_at: number;
    error?: string;
}

export async function main(args: AudioGenerationRequest): Promise<AudioGenerationResult> {
    const startTime = Date.now();
    const rsrchUrl = Deno.env.get("RSRCH_SERVER_URL") || "http://localhost:3080";
    const pendingAudioId = `pending_audio_${startTime}_${Math.random().toString(36).substring(2, 8)}`;
    let notebookId = "unknown";

    try {
        // 1. Create PendingAudio with "queued" status
        const falkorCreateResponse = await fetch(`${rsrchUrl}/graph/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: `
          MATCH (n:Notebook)-[:HAS_SOURCE]->(s:Source {title: "${args.source_title}"})
          WHERE n.title CONTAINS "${args.notebook_title.substring(0, 30)}"
          CREATE (pa:PendingAudio {
            id: "${pendingAudioId}",
            notebookId: n.id,
            sourceTitle: "${args.source_title}",
            status: "queued",
            createdAt: ${startTime},
            customPrompt: "${args.custom_prompt || ""}"
          })
          CREATE (s)-[:GENERATING]->(pa)
          RETURN n.id as notebookId
        `
            })
        });

        if (!falkorCreateResponse.ok) {
            throw new Error(`FalkorDB create failed: ${falkorCreateResponse.status}`);
        }
        const graphData = await falkorCreateResponse.json().catch(() => ({ notebookId: "unknown" }));
        notebookId = graphData.notebookId || "unknown";

        // 2. Call rsrch server to trigger generation (non-blocking)
        const response = await fetch(`${rsrchUrl}/notebooklm/generate-audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                notebookTitle: args.notebook_title,
                sources: [args.source_title],
                customPrompt: args.custom_prompt,
                waitForCompletion: false, // NON-BLOCKING!
                dryRun: false,
                correlationId: pendingAudioId,
            }),
        });

        if (!response.ok) {
            throw new Error(`rsrch server responded with ${response.status}`);
        }
        const data = await response.json();

        // 3. Update FalkorDB status to "generating"
        await fetch(`${rsrchUrl}/graph/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: `
          MATCH (pa:PendingAudio {id: "${pendingAudioId}"})
          SET pa.status = "generating", pa.startedAt = ${Date.now()}
        `
            })
        });

        // 4. Send start notification
        const ntfyTopic = Deno.env.get("NTFY_TOPIC") || "rsrch-audio";
        const ntfyServer = Deno.env.get("NTFY_SERVER") || "https://ntfy.sh";

        await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: "POST",
            headers: {
                "Title": `Started: ${args.source_title.substring(0, 40)}`,
                "Tags": "hourglass_flowing_sand,audio"
            },
            body: `Generating audio for: ${args.source_title}\nNotebook: ${args.notebook_title}`
        }).catch(e => console.error("ntfy failed:", e));

        // 4. Return immediately (non-blocking)
        return {
            success: true,
            notebook_id: graphData.notebookId || "unknown",
            source_title: args.source_title,
            pending_audio_id: pendingAudioId,
            started_at: startTime
        };

    } catch (error) {
        // Update FalkorDB status to "failed" if we created the pending node
        // We attempt this only if pendingAudioId exists (which it does, as it's defined at start)
        // But we really only want to do this if Step 1 succeeded.
        // However, if Step 1 failed, this MATCH will just match nothing and do nothing, so it's safe.
        try {
            const errorMsg = String(error);
            // Escape for Cypher string: handle backslashes and quotes
            const escapedError = JSON.stringify(errorMsg).slice(1, -1);

            await fetch(`${rsrchUrl}/graph/execute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: `
                      MATCH (pa:PendingAudio {id: "${pendingAudioId}"})
                      SET pa.status = "failed", pa.error = "${escapedError}", pa.failedAt = ${Date.now()}
                    `
                })
            });
        } catch (updateErr) {
            console.error("Failed to update PendingAudio status to failed:", updateErr);
        }

        return {
            success: false,
            notebook_id: "unknown",
            source_title: args.source_title,
            pending_audio_id: "",
            started_at: startTime,
            error: String(error)
        };
    }
}
