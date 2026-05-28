import { Command } from 'commander';
import { GEMINI_API_ROUTES } from '@agents/shared';
import { sendServerRequest } from '../../cli/utils';
import { getRegistry } from '../../core/artifact-registry';

export function registerCanvasCommands(gemini: Command) {
    const canvas = gemini.command('canvas')
        .description('Manage Gemini Canvas and session artifacts');

    canvas.command('list')
        .description('List all artifacts in the current session (includes history scroll)')
        .action(async () => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_LIST}`, {}, 'GET');
            if (data?.success) {
                console.log('\n--- Session Artifacts ---');
                if (data.data.length === 0) {
                    console.log('No artifacts found in this session.');
                } else {
                    data.data.forEach((a: any, i: number) => {
                        console.log(`${i + 1}. [${a.type}] ${a.name}`);
                    });
                }
                console.log('--------------------------\n');
            }
        });

    canvas.command('read')
        .description('Read content from the currently open Canvas panel')
        .action(async () => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_READ}`, {}, 'GET');
            if (data?.success) {
                if (!data.data) {
                    console.log('No Canvas panel is currently open.');
                    return;
                }
                console.log(`\n--- Canvas: ${data.data.title} ---`);
                console.log(data.data.content);
                console.log('---------------------------\n');
            }
        });

    canvas.command('open <name>')
        .description('Open a specific artifact by name')
        .action(async (name) => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_OPEN}`, { name }, 'POST');
            if (data?.success && data.data) {
                console.log(`Artifact "${name}" opened successfully.`);
            } else {
                console.log(`Could not find or open artifact "${name}".`);
            }
        });

    canvas.command('save <name> [path]')
        .description('Save an artifact to a local file')
        .action(async (name, filePath) => {
            const openRes = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_OPEN}`, { name });
            if (!openRes?.success || !openRes.data) {
                console.log(`Could not find or open artifact "${name}".`);
                return;
            }
            
            const readRes = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_READ}`, {}, 'GET');
            if (!readRes?.success || !readRes.data) {
                console.log('Failed to read canvas content.');
                return;
            }

            const fs = await import('node:fs');
            const path = await import('node:path');
            const targetPath = filePath || path.join(process.cwd(), `${name.replace(/[^a-z0-9]/gi, '_')}.md`);
            
            fs.writeFileSync(targetPath, readRes.data.content);
            console.log(`Artifact saved to: ${targetPath}`);
        });

    canvas.command('archive-artifacts')
        .description('Archive all artifacts from the current session locally')
        .option('-o, --output <dir>', 'Output directory', 'data/artifacts/gemini')
        .option('-f, --format <format>', 'Output format (md, qmd)', 'md')
        .option('-i, --incremental', 'Skip already archived artifacts', false)
        .action(async (opts) => {
            console.log(`[CLI] Archiving session artifacts (format: ${opts.format}, incremental: ${!!opts.incremental})...`);
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_ARCHIVE}`, { 
                outputDir: opts.output, 
                format: opts.format,
                incremental: !!opts.incremental
            });
            if (data?.success) {
                const files = data.data;
                console.log(`\n--- Archival Summary ---`);
                if (files.length === 0) {
                    console.log('No artifacts found to archive.');
                } else {
                    console.log(`Archived ${files.length} artifacts to ${opts.output}:`);
                    const path = await import('node:path');
                    files.forEach((f: string) => console.log(`- ${path.relative(process.cwd(), f)}`));
                }
                console.log('-------------------------\n');
            }
        });

    gemini.command('list-archived')
        .description('List locally archived artifacts from the registry')
        .option('-t, --type <type>', 'Filter by type (research_doc, canvas)', 'all')
        .action(async (opts) => {
            const response = await sendServerRequest(`/gemini/canvas/list-archived?type=${opts.type}`);
            if (response?.success) {
                const artifacts = response.data;
                console.log(`\n--- Archived Artifacts on Server (Type: ${opts.type}) ---`);
                if (artifacts.length === 0) {
                    console.log('No archived artifacts found.');
                } else {
                    artifacts.forEach((entry: any) => {
                        console.log(`[${entry.id}] ${entry.currentTitle || entry.originalTitle}`);
                        if (entry.markdownPath) console.log(`      Path: ${entry.markdownPath}`);
                        if (entry.references && entry.references.length > 0) {
                            console.log(`      Sources: ${entry.references.length}`);
                        }
                    });
                }
                console.log('-----------------------------------------------------\n');
            }
        });

    gemini.command('audio-overview <artifactId>')
        .description('Generate a NotebookLM audio overview for an archived artifact')
        .option('-n, --notebook <title>', 'Target notebook title')
        .option('-p, --prompt <text>', 'Custom audio generation prompt')
        .action(async (artifactId, opts) => {
            console.log(`Brdiging artifact ${artifactId} to NotebookLM audio...`);
            const data = await sendServerRequest('/gemini/canvas/audio-overview', {
                artifactId,
                notebookTitle: opts.notebook,
                customPrompt: opts.prompt
            });
            
            if (data?.success) {
                console.log(`Successfully triggered audio generation: ${data.artifactTitle || 'Pending'}`);
            } else {
                console.log('Failed to generate audio overview.');
            }
        });

    canvas.command('update [content]')
        .description('Update or append content in the active Canvas editor')
        .option('--append', 'Append instead of replacing', false)
        .option('-f, --file <path>', 'Path to local file to read content from')
        .action(async (content, opts) => {
            let finalContent = content;

            if (opts.file) {
                const fs = await import('node:fs');
                const path = await import('node:path');
                const resolvedPath = path.resolve(opts.file);
                if (!fs.existsSync(resolvedPath)) {
                    console.error(`Error: File not found at ${resolvedPath}`);
                    process.exit(1);
                }
                finalContent = fs.readFileSync(resolvedPath, 'utf8');
            } else if (!finalContent) {
                // Read from stdin if not interactive TTY
                if (process.stdin.isTTY) {
                    console.error('Error: Please provide content, specify a file with --file <path>, or pipe input via stdin.');
                    process.exit(1);
                }
                finalContent = await new Promise<string>((resolve) => {
                    let data = '';
                    process.stdin.on('data', chunk => { data += chunk; });
                    process.stdin.on('end', () => resolve(data));
                });
            }

            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_UPDATE}`, { content: finalContent, mode: opts.append ? 'append' : 'replace' }, 'POST');
            if (data?.success && data.data) console.log('Canvas updated successfully.');
        });

    canvas.command('tab <preview|code>')
        .description('Switch Canvas view tab')
        .action(async (tab) => {
            if (tab !== 'preview' && tab !== 'code') {
                console.error('Invalid tab name. Use "preview" or "code".');
                return;
            }
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_TAB}`, { tab }, 'POST');
            if (data?.success && data.data) console.log(`Switched to ${tab} tab.`);
        });

    canvas.command('close')
        .description('Close the Canvas side panel')
        .action(async () => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_CLOSE}`, {}, 'POST');
            if (data?.success && data.data) console.log('Canvas closed.');
        });

    canvas.command('versions')
        .description('List history versions of the current Canvas artifact')
        .action(async () => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_VERSIONS}`, {}, 'GET');
            if (data?.success) {
                console.log('\n--- Canvas Version History ---');
                if (data.data.length === 0) {
                    console.log('No history found or history button not accessible.');
                } else {
                    data.data.forEach((v: any) => {
                        console.log(`${v.id}: ${v.timestamp}`);
                    });
                }
                console.log('------------------------------\n');
            }
        });

    canvas.command('restore <versionId>')
        .description('Restore the Canvas artifact to a specific version')
        .action(async (versionId) => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_RESTORE}`, { versionId }, 'POST');
            if (data?.success && data.data) console.log(`Successfully restored version ${versionId}.`);
            else console.log(`Failed to restore version ${versionId}.`);
        });

    canvas.command('prompt <instruction>')
        .description('Send a modification prompt to the active Canvas')
        .action(async (instruction) => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_PROMPT}`, { instruction }, 'POST');
            if (data?.success && data.data) console.log('Prompt sent to Canvas.');
            else console.log('Failed to send prompt to Canvas.');
        });

    canvas.command('export [target]')
        .description('Export the Canvas artifact (default: docs)')
        .action(async (target) => {
            const data = await sendServerRequest(`/gemini/${GEMINI_API_ROUTES.CANVAS_EXPORT}`, { target: target || 'docs' }, 'POST');
            if (data?.success && data.data) console.log(`Export to ${target || 'docs'} triggered.`);
            else console.log('Failed to trigger export.');
        });
}
