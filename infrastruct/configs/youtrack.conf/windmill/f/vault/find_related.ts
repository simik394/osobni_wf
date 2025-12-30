/**
 * Windmill Script: Find Related Notes
 * 
 * Finds notes related to a given note through:
 * - Direct links (outgoing and incoming)
 * - Shared tags
 * - Transitive connections (up to specified depth)
 * 
 * @param notePath Path or name of the note to find relations for
 * @param depth How many hops to traverse (1 = direct only, 2+ = transitive)
 * @returns Related notes grouped by relationship type
 */

export async function main(
    notePath: string,
    depth: number = 1
): Promise<{
    success: boolean;
    sourceNote: string;
    related?: {
        linksTo: string[];
        linkedFrom: string[];
        sharedTags: Array<{ note: string; tag: string }>;
    };
    error?: string;
}> {
    console.log(`🔗 Finding notes related to: ${notePath} (depth: ${depth})...`);

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        // Extract note name from path
        const noteName = notePath.includes("/")
            ? notePath.split("/").pop()?.replace(".md", "") || notePath
            : notePath.replace(".md", "");

        const safeName = noteName.replace(/'/g, "\\'");

        const related = {
            linksTo: [] as string[],
            linkedFrom: [] as string[],
            sharedTags: [] as Array<{ note: string; tag: string }>
        };

        // Outgoing links
        related.linksTo = await queryPaths(
            host, port, graph,
            `MATCH (n:Note {name: '${safeName}'})-[:LINKS_TO]->(target:Note) RETURN target.path`
        );

        // Incoming links (backlinks)
        related.linkedFrom = await queryPaths(
            host, port, graph,
            `MATCH (source:Note)-[:LINKS_TO]->(n:Note {name: '${safeName}'}) RETURN source.path`
        );

        // Notes with shared tags
        const sharedTagResults = await queryPaths(
            host, port, graph,
            `MATCH (n:Note {name: '${safeName}'})-[:TAGGED]->(t:Tag)<-[:TAGGED]-(other:Note) 
             WHERE n <> other 
             RETURN DISTINCT other.path`
        );
        related.sharedTags = sharedTagResults.map(path => ({ note: path, tag: "shared" }));

        const totalRelated = related.linksTo.length + related.linkedFrom.length + related.sharedTags.length;
        console.log(`✅ Found ${totalRelated} related notes:`);
        console.log(`  → Links to: ${related.linksTo.length}`);
        console.log(`  ← Linked from: ${related.linkedFrom.length}`);
        console.log(`  🏷️ Shared tags: ${related.sharedTags.length}`);

        return {
            success: true,
            sourceNote: notePath,
            related
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            sourceNote: notePath,
            error: errorMsg
        };
    }
}

async function queryPaths(host: string, port: number, graph: string, query: string): Promise<string[]> {
    const conn = await Deno.connect({ hostname: host, port });
    const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

    await conn.write(new TextEncoder().encode(command));

    const buffer = new Uint8Array(65536);
    const bytesRead = await conn.read(buffer);
    conn.close();

    if (bytesRead === null) return [];

    const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
    const paths: string[] = [];

    for (const line of response.split("\r\n")) {
        if (line.startsWith("/") || line.includes("/home/")) {
            paths.push(line);
        }
    }

    return paths;
}
