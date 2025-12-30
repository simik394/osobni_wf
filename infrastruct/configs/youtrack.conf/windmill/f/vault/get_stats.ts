/**
 * Windmill Script: Get Vault Stats
 * 
 * Returns statistics about the indexed vault.
 * Useful for understanding the scope and structure of your knowledge base.
 * 
 * @returns Counts of notes, links, tags, code files, functions, and classes
 */

export async function main(): Promise<{
    success: boolean;
    stats?: {
        notes: number;
        links: number;
        tags: number;
        codeFiles: number;
        functions: number;
        classes: number;
        projects: number;
        tasks: number;
    };
    error?: string;
}> {
    console.log("📊 Querying vault statistics...");

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const stats = {
            notes: 0,
            links: 0,
            tags: 0,
            codeFiles: 0,
            functions: 0,
            classes: 0,
            projects: 0,
            tasks: 0
        };

        const queries = [
            { key: "notes", query: "MATCH (n:Note) RETURN count(n)" },
            { key: "links", query: "MATCH ()-[r:LINKS_TO]->() RETURN count(r)" },
            { key: "tags", query: "MATCH (t:Tag) RETURN count(t)" },
            { key: "codeFiles", query: "MATCH (c:Code) RETURN count(c)" },
            { key: "functions", query: "MATCH (f:Function) RETURN count(f)" },
            { key: "classes", query: "MATCH (c:Class) RETURN count(c)" },
            { key: "projects", query: "MATCH (p:Project) RETURN count(p)" },
            { key: "tasks", query: "MATCH (t:Task) RETURN count(t)" }
        ];

        for (const { key, query } of queries) {
            const conn = await Deno.connect({ hostname: host, port });
            const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

            await conn.write(new TextEncoder().encode(command));

            const buffer = new Uint8Array(4096);
            const bytesRead = await conn.read(buffer);
            conn.close();

            if (bytesRead !== null) {
                const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
                const count = parseCount(response);
                stats[key as keyof typeof stats] = count;
            }
        }

        console.log(`✅ Vault stats retrieved:`);
        console.log(`  📝 Notes: ${stats.notes}`);
        console.log(`  🔗 Links: ${stats.links}`);
        console.log(`  🏷️ Tags: ${stats.tags}`);
        console.log(`  💻 Code files: ${stats.codeFiles}`);
        console.log(`  ⚙️ Functions: ${stats.functions}`);
        console.log(`  📦 Classes: ${stats.classes}`);
        console.log(`  📁 Projects: ${stats.projects}`);
        console.log(`  ✅ Tasks: ${stats.tasks}`);

        return {
            success: true,
            stats
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

function parseCount(response: string): number {
    // Look for integers in RESP response
    const match = response.match(/:(\d+)/);
    if (match) {
        return parseInt(match[1]);
    }
    return 0;
}
