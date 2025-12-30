/**
 * Windmill Script: Find Function Definition
 * 
 * Searches for functions by name across all indexed code files.
 * Returns the file path and line number where each function is defined.
 * 
 * @param functionName Name of the function to search for
 * @returns List of locations where the function is defined
 */

export async function main(functionName: string): Promise<{
    success: boolean;
    functionName: string;
    locations?: Array<{ path: string; line: number; signature?: string }>;
    count?: number;
    error?: string;
}> {
    console.log(`🔍 Searching for function: ${functionName}...`);

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const conn = await Deno.connect({ hostname: host, port });

        const safeName = functionName.replace(/'/g, "\\'");
        const query = `MATCH (c:Code)-[:DEFINES]->(f:Function {name: '${safeName}'}) RETURN c.path, f.line, f.signature`;
        const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

        await conn.write(new TextEncoder().encode(command));

        const buffer = new Uint8Array(65536);
        const bytesRead = await conn.read(buffer);
        conn.close();

        if (bytesRead === null) {
            throw new Error("No response from FalkorDB");
        }

        const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));
        const locations = parseFunctionResults(response);

        console.log(`✅ Found ${locations.length} definition(s) of "${functionName}"`);

        return {
            success: true,
            functionName,
            locations,
            count: locations.length
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed: ${errorMsg}`);

        return {
            success: false,
            functionName,
            error: errorMsg
        };
    }
}

function parseFunctionResults(response: string): Array<{ path: string; line: number; signature?: string }> {
    const results: Array<{ path: string; line: number; signature?: string }> = [];
    const lines = response.split("\r\n");

    let currentPath = "";
    for (const line of lines) {
        // Look for file paths
        if (line.startsWith("/") || line.includes("/home/") || line.includes("/Obsi/")) {
            currentPath = line;
        }
        // Look for line numbers (integers after a colon in RESP)
        const lineMatch = line.match(/^:(\d+)$/);
        if (lineMatch && currentPath) {
            results.push({
                path: currentPath,
                line: parseInt(lineMatch[1])
            });
            currentPath = "";
        }
    }

    return results;
}
