// Windmill Script: webhook_audio_complete
// Called by watcher when audio generation completes
// Updates FalkorDB state and sends ntfy notification
//
// Architecture per agents/rsrch/AGENTS.md:
// Watcher monitors page → calls this webhook → updates FalkorDB + ntfy

import * as wmill from "windmill-client";

interface AudioCompleteRequest {
    pending_audio_id: string;
    notebook_id: string;
    source_title: string;
    audio_title: string;
    source_count: number;
    start_time: number;
}

interface AudioCompleteResult {
    success: boolean;
    audio_id: string;
    duration_ms: number;
    duration_str: string;
}

export async function main(args: AudioCompleteRequest): Promise<AudioCompleteResult> {
    const endTime = Date.now();
    const durationMs = endTime - args.start_time;
    const durationSec = Math.round(durationMs / 1000);
    const durationMin = Math.floor(durationSec / 60);
    const durationSecRemainder = durationSec % 60;
    const durationStr = `${durationMin}m ${durationSecRemainder}s`;

    const rsrchUrl = Deno.env.get("RSRCH_SERVER_URL") || "http://localhost:3080";

    try {
        // 1. Update FalkorDB: Create AudioOverview, link to source, delete pending
        const audioId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        await fetch(`${rsrchUrl}/graph/execute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query: `
          // Delete pending audio
          MATCH (pa:PendingAudio {id: "${args.pending_audio_id}"})
          DETACH DELETE pa
          
          // Create completed AudioOverview
          WITH 1 as dummy
          MATCH (n:Notebook {id: "${args.notebook_id}"})-[:HAS_SOURCE]->(s:Source {title: "${args.source_title}"})
          CREATE (ao:AudioOverview {
            id: "${audioId}",
            notebookId: "${args.notebook_id}",
            title: "${args.audio_title}",
            sourceCount: ${args.source_count},
            createdAt: ${endTime},
            generationDurationMs: ${durationMs}
          })
          CREATE (n)-[:HAS_AUDIO]->(ao)
          CREATE (ao)-[:GENERATED_FROM]->(s)
          RETURN ao.id
        `
            })
        });

        // 2. Send completion notification
        const ntfyTopic = Deno.env.get("NTFY_TOPIC") || "rsrch-audio";
        const ntfyServer = Deno.env.get("NTFY_SERVER") || "https://ntfy.sh";

        await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: "POST",
            headers: {
                "Title": `✅ Complete: ${args.source_title.substring(0, 40)}`,
                "Tags": "white_check_mark,audio"
            },
            body: `Audio generated in ${durationStr}\nTitle: ${args.audio_title}\nSources: ${args.source_count}`
        }).catch(e => console.error("ntfy failed:", e));

        return {
            success: true,
            audio_id: audioId,
            duration_ms: durationMs,
            duration_str: durationStr
        };

    } catch (error) {
        console.error("webhook_audio_complete failed:", error);

        // Still send failure notification
        const ntfyTopic = Deno.env.get("NTFY_TOPIC") || "rsrch-audio";
        const ntfyServer = Deno.env.get("NTFY_SERVER") || "https://ntfy.sh";

        await fetch(`${ntfyServer}/${ntfyTopic}`, {
            method: "POST",
            headers: {
                "Title": `❌ Failed: ${args.source_title.substring(0, 40)}`,
                "Tags": "x,warning"
            },
            body: `Audio generation failed after ${durationStr}\nError: ${error}`
        }).catch(() => { });

        return {
            success: false,
            audio_id: "",
            duration_ms: durationMs,
            duration_str: durationStr
        };
    }
}
