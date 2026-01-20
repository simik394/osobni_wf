// Windmill Script: watch_audio_completion
// Monitors NotebookLM for audio generation completion, updates FalkorDB, and sends ntfy.
//
// Architecture per agents/rsrch/AGENTS.md:
// 1. click_generate_audio.ts creates a PendingAudio node in FalkorDB.
// 2. This script (watch_audio_completion.ts) runs on a schedule.
// 3. It fetches all PendingAudio nodes.
// 4. For each, it checks NotebookLM for a corresponding completed audio artifact.
// 5. On completion, it updates FalkorDB (replaces PendingAudio with AudioOverview) and sends ntfy.
// 6. On failure (timeout or error), it updates the node state and sends ntfy.

import * as wmill from "windmill-client";

const RSRCH_URL = Deno.env.get("RSRCH_SERVER_URL") || "http://localhost:3080";
const NTFY_TOPIC = Deno.env.get("NTFY_TOPIC") || "rsrch-audio";
const NTFY_SERVER = Deno.env.get("NTFY_SERVER") || "https://ntfy.sh";
const GENERATION_TIMEOUT_MS = 1000 * 60 * 15; // 15 minutes

interface PendingAudio {
    id: string;
    notebookId: string;
    sourceTitle: string;
    startedAt: number;
    createdAt?: number;
}

interface WatchResult {
    processed: number;
    completed: number;
    failed: number;
    errors: string[];
}

export async function main(): Promise<WatchResult> {
    const results: WatchResult = {
        processed: 0,
        completed: 0,
        failed: 0,
        errors: [],
    };

    try {
        // 1. Fetch all pending audio nodes from FalkorDB
        // Query for status 'queued' or 'generating' to cover both states.
        const pendingNodes = await executeGraphQuery(
            "MATCH (pa:PendingAudio) WHERE pa.status IN ['queued', 'generating'] RETURN pa.id, pa.notebookId, pa.sourceTitle, pa.startedAt, pa.createdAt"
        );

        if (!pendingNodes || pendingNodes.length === 0) {
            console.log("No pending audio tasks found.");
            return results;
        }

        results.processed = pendingNodes.length;
        console.log(`Found ${results.processed} pending audio tasks.`);

        // 2. Process each pending node
        for (const pending of pendingNodes) {
            // Destructure with correct number of columns
            const [id, notebookId, sourceTitle, startedAt, createdAt] = pending;
            const pendingAudio: PendingAudio = { id, notebookId, sourceTitle, startedAt, createdAt };

            try {
                const notebookRes = await fetch(`${RSRCH_URL}/notebook/list`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notebookId: pendingAudio.notebookId, includeSources: true, includeAudio: true })
                });

                if (!notebookRes.ok) throw new Error(`NotebookLM fetch failed: ${notebookRes.statusText}`);
                const notebookData = await notebookRes.json();

                if (!notebookData.success || !notebookData.data) {
                    throw new Error(notebookData.error || "Failed to get notebook data");
                }

                const notebook = notebookData.data[0];

                const audio = notebook.audioOverviews?.find(a => a.correlationId === pendingAudio.id);

                // Determine reference start time for timeout (prefer startedAt, fallback to createdAt)
                const refTime = pendingAudio.startedAt || pendingAudio.createdAt || Date.now();

                if (audio) {
                    // Audio found - SUCCESS
                    await handleCompletion(pendingAudio, audio);
                    results.completed++;
                } else if (Date.now() - refTime > GENERATION_TIMEOUT_MS) {
                    // Timeout - FAILURE
                    await handleFailure(pendingAudio, "Timeout");
                    results.failed++;
                }

            } catch (e) {
                console.error(`Error processing pending audio ${pendingAudio.id}:`, e);
                // Don't mark as failed immediately on transient errors, unless it's a persistent issue?
                // For now, let's just log it. If it times out, it will fail eventually.
                // Or should we fail it? If the error is permanent (e.g. notebook deleted), we should fail.
                // Assuming errors here might be network glitches, let's just log.
                results.errors.push(e.message);
                // results.failed++; // Don't count as failed logic unless we actually fail the node
            }
        }

    } catch (error) {
        console.error("Watchdog run failed:", error);
        results.errors.push(error.message);
    }

    console.log("Watchdog run complete:", results);
    return results;
}

async function handleCompletion(pending: PendingAudio, audio: any) {
    const endTime = Date.now();
    const startTime = pending.startedAt || pending.createdAt || endTime;
    const durationMs = endTime - startTime;
    const durationStr = formatDuration(durationMs);

    // 1. Update FalkorDB
    await executeGraphQuery(
        `
        MATCH (pa:PendingAudio {id: $pendingId})
        DETACH DELETE pa
        WITH 1 as dummy
        MATCH (n:Notebook {id: $notebookId})-[:HAS_SOURCE]->(s:Source {title: $sourceTitle})
        CREATE (ao:AudioOverview {
            id: $audioId,
            notebookId: n.id,
            title: $audioTitle,
            sourceCount: $sourceCount,
            createdAt: $endTime,
            generationDurationMs: $durationMs
        })
        CREATE (n)-[:HAS_AUDIO]->(ao)
        CREATE (ao)-[:GENERATED_FROM]->(s)
    `,
        {
            pendingId: pending.id,
            notebookId: pending.notebookId,
            sourceTitle: pending.sourceTitle,
            audioId: audio.id || `audio_${Date.now()}`,
            audioTitle: audio.title,
            sourceCount: audio.sourceCount || 1,
            endTime,
            durationMs,
        }
    );

    // 2. Send notification
    await sendNtfy({
        title: `Complete: ${pending.sourceTitle.substring(0, 40)}`,
        message: `Audio generated in ${durationStr}\nTitle: ${audio.title}`,
        tags: "white_check_mark,audio",
    });
}

async function handleFailure(pending: PendingAudio, reason: string) {
    const endTime = Date.now();
    const startTime = pending.startedAt || pending.createdAt || endTime;
    const durationMs = endTime - startTime;

    // 1. Update FalkorDB
    await executeGraphQuery(
        `
        MATCH (pa:PendingAudio {id: $pendingId})
        SET pa.status = "failed", pa.failureReason = $reason, pa.failedAt = $endTime
    `,
        {
            pendingId: pending.id,
            reason: reason.substring(0, 100),
            endTime,
        }
    );

    // 2. Send notification
    await sendNtfy({
        title: `Failed: ${pending.sourceTitle.substring(0, 40)}`,
        message: `Audio generation failed after ${formatDuration(durationMs)}\nReason: ${reason}`,
        tags: "x,warning",
    });
}

async function executeGraphQuery(query: string, params: Record<string, any> = {}) {
    const response = await fetch(`${RSRCH_URL}/graph/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, params }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`FalkorDB query failed: ${response.statusText}. Body: ${errorBody}`);
    }
    return response.json();
}

async function sendNtfy(args: { title: string; message: string; tags: string }) {
    try {
        await fetch(`${NTFY_SERVER}/${NTFY_TOPIC}`, {
            method: "POST",
            headers: { "Title": args.title, "Tags": args.tags },
            body: args.message,
        });
    } catch (e) {
        console.error("Failed to send ntfy notification:", e);
    }
}

function formatDuration(ms: number): string {
    const sec = Math.round(ms / 1000);
    const min = Math.floor(sec / 60);
    const secRem = sec % 60;
    return `${min}m ${secRem}s`;
}
