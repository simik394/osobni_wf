import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(__dirname, '../src');
const SERVER_FILE = path.join(SRC_DIR, 'server.ts');

interface EndpointDoc {
    method: string;
    path: string;
    description: string;
    line: number;
}

function parseEndpoints(filePath: string): EndpointDoc[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const endpoints: EndpointDoc[] = [];

    let lastComment = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Capture comments
        if (line.startsWith('//')) {
            const comment = line.substring(2).trim();
            // Ignore some common noisy comments
            if (!comment.startsWith('=') && !comment.startsWith('Import')) {
                lastComment = comment;
            }
            continue;
        }

        // Match app.get('/path', ...
        const match = line.match(/app\.(get|post|put|delete|patch)\(['"](.+?)['"]/);
        if (match) {
            endpoints.push({
                method: match[1].toUpperCase(),
                path: match[2],
                description: lastComment,
                line: i + 1
            });
            lastComment = ''; // Reset comment
        } else if (line !== '') {
            // Reset description if line is not a comment and not a route match
            // This prevents using stale comments
            lastComment = '';
        }
    }

    return endpoints;
}

function main() {
    console.log('---');
    console.log('title: "API Reference"');


    console.log('---');

    console.log('\n# API Reference\n');
    console.log('REST API endpoints provided by `src/server.ts`.\n');

    const endpoints = parseEndpoints(SERVER_FILE);

    for (const ep of endpoints) {
        console.log(`## ${ep.method} \`${ep.path}\`\n`);
        if (ep.description) {
            console.log(`${ep.description}\n`);
        }

        console.log('**Example Request:**\n');
        console.log('```bash');
        console.log(`curl -X ${ep.method} http://localhost:3055${ep.path}`);
        console.log('```\n');

        console.log(`_Source: [server.ts:L${ep.line}](file://${SERVER_FILE}#L${ep.line})_\n`);
        console.log('***');
    }
}

main();
