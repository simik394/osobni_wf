/**
 * Windmill Script: Get Notes by Tag
 * 
 * Returns all notes that have a specific tag.
 * Useful for exploring thematic connections.
 * 
 * @param tag The tag name (without #)
 * @returns List of note paths with this tag
 */

export async function main(tag: string): Promise<{
    success: boolean;
    tag: string;
    notes?: string[];
    count?: number;
    error?: string;
}> {
    console.log(`🏷️ Querying notes with tag: #${tag}...`);

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const conn = await Deno.connect({ hostname: host, port });

        const safeTag = tag.replace(/'/g, "\\'");
        const query = `MATCH (n:Note)-[:TAGGED]->(t:Tag {name: '${safeTag}'}) RETURN n.path`;
        const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

        await conn.write(new TextEncoder().encode(command));

        const buffer = new Uint8Array(65536);
        const bytesRead = await conn.read(buffer);
        conn.close();

        if (bytesRead === null) {
            throw new Error("No response from FalkorDB");
        }

        const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
        const notes = parseRespPaths(response);

        console.log(`✅ Found ${notes.length} notes with tag #${tag}`);

        return {
            success: true,
            tag,
            notes,
            count: notes.length
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            tag,
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
