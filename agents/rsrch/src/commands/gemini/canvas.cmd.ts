import { Command } from 'commander';
import { 
    runLocalGeminiAction, 
    getOptionsWithGlobals 
} from '../../cli/utils';

export function registerCanvasCommands(gemini: Command) {
    const canvas = gemini.command('canvas')
        .description('Manage Gemini Canvas and session artifacts');

    canvas.command('list')
        .description('List all artifacts in the current session (includes history scroll)')
        .option('--local', 'Use local execution', true)
        .action(async (opts, cmd) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const artifacts = await gemini.listArtifacts();
                console.log('\n--- Session Artifacts ---');
                if (artifacts.length === 0) {
                    console.log('No artifacts found in this session.');
                } else {
                    artifacts.forEach((a, i) => {
                        console.log(`${i + 1}. [${a.type}] ${a.name}`);
                    });
                }
                console.log('--------------------------\n');
            });
        });

    canvas.command('read')
        .description('Read content from the currently open Canvas panel')
        .option('--local', 'Use local execution', true)
        .action(async (opts, cmd) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const data = await gemini.readCanvas();
                if (!data) {
                    console.log('No Canvas panel is currently open.');
                    return;
                }
                console.log(`\n--- Canvas: ${data.title} ---`);
                console.log(data.content);
                console.log('---------------------------\n');
            });
        });

    canvas.command('open <name>')
        .description('Open a specific artifact by name')
        .option('--local', 'Use local execution', true)
        .action(async (name, opts, cmd) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const success = await gemini.openArtifact(name);
                if (success) {
                    console.log(`Artifact "${name}" opened successfully.`);
                } else {
                    console.log(`Could not find or open artifact "${name}".`);
                }
            });
        });

    canvas.command('save <name> [path]')
        .description('Save an artifact to a local file')
        .option('--local', 'Use local execution', true)
        .action(async (name, filePath, opts, cmd) => {
            await runLocalGeminiAction(async (client, gemini) => {
                const opened = await gemini.openArtifact(name);
                if (!opened) {
                    console.log(`Could not find or open artifact "${name}".`);
                    return;
                }
                
                const data = await gemini.readCanvas();
                if (!data) {
                    console.log('Failed to read canvas content.');
                    return;
                }

                const fs = await import('node:fs');
                const path = await import('node:path');
                const targetPath = filePath || path.join(process.cwd(), `${name.replace(/[^a-z0-9]/gi, '_')}.md`);
                
                fs.writeFileSync(targetPath, data.content);
                console.log(`Artifact saved to: ${targetPath}`);
            });
        });
}
