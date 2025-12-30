/**
 * Windmill Script: Get Backlinks
 * 
 * Returns notes that link TO the specified note.
 * Useful for understanding how a note connects to the knowledge graph.
 * 
 * @param noteName The name of the note to find backlinks for
 * @returns List of paths to notes that link to the target
 */

export async function main(noteName: string): Promise<{
    success: boolean;
    targetNote: string;
    backlinks?: string[];
    count?: number;
    error?: string;
}> {
    console.log(`🔍 Querying backlinks for: "${noteName}"...`);

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const conn = await Deno.connect({ hostname: host, port });

        // Escape single quotes in note name
        const safeName = noteName.replace(/'/g, "\\'");
        const query = `MATCH (n:Note)-[:LINKS_TO]->(target:Note {name: '${safeName}'}) RETURN n.path`;
        const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

        await conn.write(new TextEncoder().encode(command));

        const buffer = new Uint8Array(65536);
        const bytesRead = await conn.read(buffer);
        conn.close();

        if (bytesRead === null) {
            throw new Error("No response from FalkorDB");
        }

        const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
        const backlinks = parseRespPaths(response);

        console.log(`✅ Found ${backlinks.length} backlinks to "${noteName}"`);

        return {
            success: true,
            targetNote: noteName,
            backlinks,
            count: backlinks.length
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            targetNote: noteName,
            error: errorMsg
        };
    }
}

function parseRespPaths(response: string): string[] {
    const paths: string[] = [];
    const lines = response.split("\r\n");

    for (const line of lines) {
        if (line.startsWith("/") || line.includes("/home/") || line.includes("/Obsi/")) {
            paths.push(line);
        }
    }

    return paths;
}
