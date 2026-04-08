import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves a list of paths (files or directories) into a flat list of uploadable file paths.
 */
export function resolveLocalFiles(filePaths: string[]): string[] {
    const filesToUpload: string[] = [];
    
    for (const filePath of filePaths) {
        const resolvedPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(resolvedPath)) {
            console.warn(`Warning: File or directory not found at ${resolvedPath}`);
            continue;
        }
        
        const stat = fs.statSync(resolvedPath);
        if (stat.isDirectory()) {
            const files = fs.readdirSync(resolvedPath)
                .filter(f => {
                    const ext = f.toLowerCase();
                    return ext.endsWith('.pdf') || ext.endsWith('.txt') || ext.endsWith('.md');
                })
                .map(f => path.join(resolvedPath, f));
            filesToUpload.push(...files);
        } else {
            filesToUpload.push(resolvedPath);
        }
    }
    
    return filesToUpload;
}

/**
 * Resolves text content from a string, which can be direct text, a file path (prefixed with @), 
 * or stdin (if "-").
 */
export async function resolveTextContent(content: string): Promise<string> {
    if (content.startsWith('@')) {
        const filePath = content.slice(1);
        const resolvedPath = path.resolve(process.cwd(), filePath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found: ${resolvedPath}`);
        }
        console.log(`[CLI] Loading content from ${resolvedPath}`);
        return fs.readFileSync(resolvedPath, 'utf-8');
    } else if (content === '-') {
        const readline = await import('readline');
        const rl = readline.createInterface({ input: process.stdin });
        const lines: string[] = [];
        for await (const line of rl) {
            lines.push(line);
        }
        const text = lines.join('\n');
        console.log(`[CLI] Read ${text.length} chars from stdin`);
        return text;
    }
    return content;
}

/**
 * Resolves notebook titles from a comma-separated string or special symbols like 'all' or '*'.
 */
export async function resolveNotebookTitles(titlesArg: string, listFn: () => Promise<{ title: string }[]>): Promise<string[]> {
    if (titlesArg === 'all' || titlesArg === '*') {
        console.log('[Batch] Fetching all notebooks...');
        const allNotebooks = await listFn();
        const titles = allNotebooks.map(n => n.title);
        console.log(`[Batch] Found ${titles.length} notebooks.`);
        return titles;
    }
    return titlesArg.split(',').map(t => t.trim()).filter(t => t.length > 0);
}
