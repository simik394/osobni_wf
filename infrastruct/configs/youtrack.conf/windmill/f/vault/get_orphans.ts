/**
 * Windmill Script: Get Orphan Notes
 * 
 * Returns notes with no incoming links (orphans).
 * Useful for finding disconnected knowledge.
 * 
 * @returns List of orphan note paths
 */

import * as wmill from "windmill-client";

type RedisResult = [string[], any[][], any[]];

export async function main(): Promise<{
    success: boolean;
    orphans?: string[];
    count?: number;
    error?: string;
}> {
    console.log("🔍 Querying FalkorDB for orphan notes...");

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        // Connect to Redis/FalkorDB
        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const conn = await Deno.connect({ hostname: host, port });

        const query = `MATCH (n:Note) WHERE NOT ()-[:LINKS_TO]->(n) RETURN n.path`;
        const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

        await conn.write(new TextEncoder().encode(command));

        const buffer = new Uint8Array(65536);
        const bytesRead = await conn.read(buffer);
        conn.close();

        if (bytesRead === null) {
            throw new Error("No response from FalkorDB");
        }

        const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));

        // Parse RESP response - extract paths
        const orphans = parseRespPaths(response);

        console.log(`✅ Found ${orphans.length} orphan notes`);

        return {
            success: true,
            orphans,
            count: orphans.length
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            error: errorMsg
        };
    }
}

function parseRespPaths(response: string): string[] {
    // Simple RESP parser for string arrays
    const paths: string[] = [];
    const lines = response.split("\r\n");

    for (const line of lines) {
        // Look for bulk strings that look like file paths
        if (line.startsWith("/") || line.includes("/home/") || line.includes("/Obsi/")) {
            paths.push(line);
        }
    }

    return paths;
}
