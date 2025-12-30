/**
 * Windmill Script: Get Scan Status
 * 
 * Returns information about the last vault scan, including:
 * - When it was run
 * - How long it took
 * - What sources were scanned
 * - What patterns were used
 * - File counts
 * 
 * Use this to check if the graph is up-to-date.
 * 
 * @returns Scan status and configuration
 */

export async function main(): Promise<{
    success: boolean;
    scanStatus?: {
        lastScanTime: string;
        lastScanAgo: string;
        durationMs: number;
        filesScanned: number;
        notesIndexed: number;
        codeFilesIndexed: number;
        sources: string[];
        includePatterns: string[];
        excludePatterns: string[];
        globalIgnores: string[];
        version: string;
    };
    error?: string;
}> {
    console.log("📊 Querying scan status from FalkorDB...");

    try {
        const addr = Deno.env.get("FALKORDB_ADDR") || "localhost:6379";
        const graph = Deno.env.get("FALKORDB_GRAPH") || "vault";

        const [host, portStr] = addr.split(":");
        const port = parseInt(portStr) || 6379;

        const conn = await Deno.connect({ hostname: host, port });

        const query = `MATCH (s:ScanConfig {id: 'singleton'}) RETURN s.startTime, s.endTime, s.durationMs, s.filesScanned, s.notesIndexed, s.codeFilesIndexed, s.sources, s.includePatterns, s.excludePatterns, s.globalIgnores, s.version`;
        const command = `*3\r\n$11\r\nGRAPH.QUERY\r\n$${graph.length}\r\n${graph}\r\n$${query.length}\r\n${query}\r\n`;

        await conn.write(new TextEncoder().encode(command));

        const buffer = new Uint8Array(65536);
        const bytesRead = await conn.read(buffer);
        conn.close();

        if (bytesRead === null) {
            throw new Error("No response from FalkorDB");
        }

        const response = new TextDecoder().decode(buffer.subarray(0, bytesRead));

        // Parse response to extract values
        const values = parseRespValues(response);

        if (values.length < 11) {
            return {
                success: true,
                scanStatus: undefined,
                error: "No scan has been performed yet. Run 'librarian scan' first."
            };
        }

        const startTime = parseInt(values[0]) || 0;
        const lastScanDate = new Date(startTime * 1000);
        const now = new Date();
        const agoMs = now.getTime() - lastScanDate.getTime();
        const agoMinutes = Math.floor(agoMs / 60000);
        const agoHours = Math.floor(agoMinutes / 60);
        const agoDays = Math.floor(agoHours / 24);

        let lastScanAgo = "";
        if (agoDays > 0) {
            lastScanAgo = `${agoDays}d ${agoHours % 24}h ago`;
        } else if (agoHours > 0) {
            lastScanAgo = `${agoHours}h ${agoMinutes % 60}m ago`;
        } else {
            lastScanAgo = `${agoMinutes}m ago`;
        }

        const scanStatus = {
            lastScanTime: lastScanDate.toISOString(),
            lastScanAgo,
            durationMs: parseInt(values[2]) || 0,
            filesScanned: parseInt(values[3]) || 0,
            notesIndexed: parseInt(values[4]) || 0,
            codeFilesIndexed: parseInt(values[5]) || 0,
            sources: values[6] ? values[6].split(",") : [],
            includePatterns: values[7] ? values[7].split(",") : [],
            excludePatterns: values[8] ? values[8].split(",") : [],
            globalIgnores: values[9] ? values[9].split(",") : [],
            version: values[10] || "unknown"
        };

        console.log(`✅ Last scan: ${scanStatus.lastScanAgo}`);
        console.log(`  📝 Notes: ${scanStatus.notesIndexed}`);
        console.log(`  💻 Code files: ${scanStatus.codeFilesIndexed}`);
        console.log(`  ⏱️ Duration: ${scanStatus.durationMs}ms`);
        console.log(`  📁 Sources: ${scanStatus.sources.join(", ")}`);

        return {
            success: true,
            scanStatus
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

function parseRespValues(response: string): string[] {
    const values: string[] = [];
    const lines = response.split("\r\n");

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Integer values
        if (line.startsWith(":")) {
            values.push(line.slice(1));
        }
        // Bulk string values
        else if (line.startsWith("$") && parseInt(line.slice(1)) > 0) {
            const nextLine = lines[i + 1];
            if (nextLine !== undefined) {
                values.push(nextLine);
                i++;
            }
        }
    }

    return values;
}
