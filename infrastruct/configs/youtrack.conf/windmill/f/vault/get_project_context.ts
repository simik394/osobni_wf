/**
 * Windmill Script: Get Project Context
 * 
 * Returns comprehensive context about a project including:
 * - All notes in the project
 * - All code files
 * - Key functions and classes
 * - Tags used
 * - TODOs and FIXMEs
 * 
 * Useful for providing AI agents with project-specific knowledge.
 * 
 * @param projectName Name of the project (e.g., "01-pwf", "rsrch")
 * @returns Complete project context
 */

export async function main(projectName: string): Promise<{
    success: boolean;
    project: string;
    context?: {
        notes: string[];
        codeFiles: string[];
        functions: string[];
        classes: string[];
        tags: string[];
        tasks: Array<{ file: string; text: string; status: string }>;
    };
    error?: string;
}> {
    console.log(`📁 Getting context for project: ${projectName}...`);

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const safeName = projectName.replace(/'/g, "\\'");

        const context = {
            notes: [] as string[],
            codeFiles: [] as string[],
            functions: [] as string[],
            classes: [] as string[],
            tags: [] as string[],
            tasks: [] as Array<{ file: string; text: string; status: string }>
        };

        // Query for notes in project
        context.notes = await queryPaths(
            host, port, graph,
            `MATCH (p:Project {name: '${safeName}'})-[:CONTAINS]->(n:Note) RETURN n.path`
        );

        // Query for code files in project
        context.codeFiles = await queryPaths(
            host, port, graph,
            `MATCH (p:Project {name: '${safeName}'})-[:CONTAINS]->(c:Code) RETURN c.path`
        );

        // Query for functions in project
        context.functions = await queryStrings(
            host, port, graph,
            `MATCH (p:Project {name: '${safeName}'})-[:CONTAINS]->(c:Code)-[:DEFINES]->(f:Function) RETURN f.name`
        );

        // Query for classes in project
        context.classes = await queryStrings(
            host, port, graph,
            `MATCH (p:Project {name: '${safeName}'})-[:CONTAINS]->(c:Code)-[:DEFINES]->(cl:Class) RETURN cl.name`
        );

        // Query for tags used in project notes
        context.tags = await queryStrings(
            host, port, graph,
            `MATCH (p:Project {name: '${safeName}'})-[:CONTAINS]->(n:Note)-[:TAGGED]->(t:Tag) RETURN DISTINCT t.name`
        );

        console.log(`✅ Project context retrieved:`);
        console.log(`  📝 Notes: ${context.notes.length}`);
        console.log(`  💻 Code files: ${context.codeFiles.length}`);
        console.log(`  ⚙️ Functions: ${context.functions.length}`);
        console.log(`  📦 Classes: ${context.classes.length}`);
        console.log(`  🏷️ Tags: ${context.tags.length}`);

        return {
            success: true,
            project: projectName,
            context
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            project: projectName,
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

async function queryStrings(host: string, port: number, graph: string, query: string): Promise<string[]> {
    const conn = await Deno.connect({ hostname: host, port });
    const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

    await conn.write(new TextEncoder().encode(command));

    const buffer = new Uint8Array(65536);
    const bytesRead = await conn.read(buffer);
    conn.close();

    if (bytesRead === null) return [];

    const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
    const results: string[] = [];

    // Parse bulk strings from RESP
    const lines = response.split("\r\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Bulk string indicator
        if (line.startsWith("$") && parseInt(line.slice(1)) > 0) {
            const value = lines[i + 1];
            if (value && !value.startsWith("$") && !value.startsWith("*") && !value.startsWith(":")) {
                results.push(value);
            }
        }
    }

    return [...new Set(results)]; // Dedupe
}
