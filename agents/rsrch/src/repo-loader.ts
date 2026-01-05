
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

interface RepoLoaderOptions {
    branch?: string;
    exclude?: string[];
}

export class RepoLoader {
    private tempDir: string;

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'rsrch-repo-loader-' + Date.now());
    }

    /**
     * Clones a repo and returns the path to a single consolidated file
     */
    async loadRepoAsFile(repoUrl: string, options: RepoLoaderOptions = {}): Promise<string> {
        // 1. Clone
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir);
        }

        const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
        const clonePath = path.join(this.tempDir, repoName);

        console.log(`[RepoLoader] Cloning ${repoUrl} to ${clonePath}...`);

        try {
            let cmd = `git clone --depth 1`;
            if (options.branch) {
                cmd += ` --branch ${options.branch}`;
            }
            cmd += ` ${repoUrl} ${clonePath}`;

            execSync(cmd, { stdio: 'inherit' });
        } catch (e: any) {
            throw new Error(`Failed to clone repository: ${e.message}`);
        }

        // 2. Walk and Concatenate
        const excludes = options.exclude || ['.git', 'node_modules', 'dist', 'build', '__pycache__', '.DS_Store', 'package-lock.json', 'yarn.lock'];

        let content = `# Repository: ${repoUrl}\n`;
        content += `# Date: ${new Date().toISOString()}\n\n`;

        const files = this.walk(clonePath, excludes);

        if (files.length === 0) {
            throw new Error('No files found in repository');
        }

        console.log(`[RepoLoader] Found ${files.length} files. Concatenating...`);

        for (const file of files) {
            const relPath = path.relative(clonePath, file);

            // Skip binary files (naive check)
            // Or just try to read as utf8
            if (this.isBinary(file)) {
                console.log(`[RepoLoader] Skipping binary file: ${relPath}`);
                continue;
            }

            try {
                const fileContent = fs.readFileSync(file, 'utf-8');
                content += `\n\n--- File: ${relPath} ---\n\n`;
                content += fileContent;
            } catch (e) {
                console.warn(`[RepoLoader] Could not read file ${relPath}`);
            }
        }

        // 3. Write output
        const outputFilename = `context_${repoName}_${Date.now()}.md`;
        const outputPath = path.join(process.cwd(), outputFilename); // Save to CWD so user can see it too? Or temp?
        // Let's save to CWD for now as it might be useful to inspect
        // But better to save to temp if we are just uploading

        // Actually, let's return a temp path, invalidation logic is caller's or OS's problem
        const tempOutputFile = path.join(this.tempDir, outputFilename);
        fs.writeFileSync(tempOutputFile, content);

        console.log(`[RepoLoader] Created context file: ${tempOutputFile} (${(content.length / 1024).toFixed(2)} KB)`);

        return tempOutputFile;
    }

    private walk(dir: string, excludes: string[]): string[] {
        let results: string[] = [];
        const list = fs.readdirSync(dir);

        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (excludes.includes(file)) continue;

            if (stat && stat.isDirectory()) {
                results = results.concat(this.walk(filePath, excludes));
            } else {
                results.push(filePath);
            }
        }
        return results;
    }

    private isBinary(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.mov', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite', '.pyc'];
        if (binaryExts.includes(ext)) return true;

        // Check for null bytes if extension not obvious
        try {
            const buffer = fs.readFileSync(filePath, { encoding: null, flag: 'r' }); // Read partially?
            // checking first 4096 bytes is usually enough
            const checkBuffer = buffer.subarray(0, Math.min(buffer.length, 4096));
            return checkBuffer.includes(0);
        } catch (e) {
            return false;
        }
    }

    cleanup() {
        if (fs.existsSync(this.tempDir)) {
            // Recursive delete
            fs.rmSync(this.tempDir, { recursive: true, force: true });
        }
    }
}
