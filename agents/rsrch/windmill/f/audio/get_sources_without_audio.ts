// Windmill Script: get_sources_without_audio
// Queries FalkorDB for sources that don't have audio generated yet
// Returns list of sources for workflow orchestration

import * as wmill from "windmill-client";

export async function main(args: {
    notebook_title: string;
}) {
    const { notebook_title } = args;

    // Get FalkorDB connection from Windmill resources
    const falkorHost = await wmill.getVariable("f/rsrch/FALKORDB_HOST") || "localhost";
    const falkorPort = parseInt(await wmill.getVariable("f/rsrch/FALKORDB_PORT") || "6379");

    // Use rsrch server API to query
    const rsrchServerUrl = await wmill.getVariable("f/rsrch/RSRCH_SERVER_URL") || "http://localhost:3080";

    try {
        // Call rsrch server to get sources without audio
        const response = await fetch(`${rsrchServerUrl}/notebooklm/sources-without-audio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notebookTitle: notebook_title }),
        });

        if (!response.ok) {
            throw new Error(`rsrch server responded with ${response.status}`);
        }

        const data = await response.json();

        return {
            notebook_title,
            sources_without_audio: data.sources || [],
            total_count: data.sources?.length || 0,
            queried_at: new Date().toISOString(),
        };
    } catch (error) {
        console.error(`Failed to query sources without audio: ${error}`);
        return {
            notebook_title,
            sources_without_audio: [],
            total_count: 0,
            error: String(error),
            queried_at: new Date().toISOString(),
        };
    }
}
