import fs from 'fs';
import path from 'path';

const COMMANDS_DIR = path.join(__dirname, '../src/commands');

interface CommandDoc {
    name: string;
    description: string;
    options: { flags: string; description: string }[];
    file: string;
    line: number;
}

function parseCommands(filePath: string): CommandDoc[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const commands: CommandDoc[] = [];

    let currentCmd: Partial<CommandDoc> | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Match .command('name <args>')
        const cmdMatch = line.match(/\.command\(['"](.+?)['"]\)/);
        if (cmdMatch) {
            if (currentCmd && currentCmd.name) {
                commands.push(currentCmd as CommandDoc);
            }
            currentCmd = {
                name: cmdMatch[1],
                description: '',
                options: [],
                file: path.basename(filePath),
                line: i + 1
            };
            continue;
        }

        if (!currentCmd) continue;

        // Match .description('...')
        const descMatch = line.match(/\.description\(['"](.+?)['"]\)/);
        if (descMatch) {
            currentCmd.description = descMatch[1];
        }

        // Match .option('-f, --flag', 'desc')
        const optMatch = line.match(/\.option\(['"](.+?)['"],\s*['"](.+?)['"]/);
        if (optMatch) {
            currentCmd.options = currentCmd.options || [];
            currentCmd.options.push({
                flags: optMatch[1],
                description: optMatch[2]
            });
        }

        // Identify action block start (loose check)
        if (line.includes('.action(')) {
            // We could mark end of definition here
        }
    }

    if (currentCmd && currentCmd.name) {
        commands.push(currentCmd as CommandDoc);
    }

    return commands;
}

function main() {
    console.log('---');
    console.log('title: "CLI Reference"');


    console.log('---');

    console.log('\n# CLI Commands\n');
    console.log('Reference for the `rsrch` command-line interface.\n');

    const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.ts'));

    for (const file of files) {
        const fullPath = path.join(COMMANDS_DIR, file);
        const commands = parseCommands(fullPath);

        if (commands.length === 0) continue;

        const groupName = path.basename(file, '.ts').toUpperCase();
        console.log(`## ${groupName} Commands\n`);

        for (const cmd of commands) {
            console.log(`### \`${cmd.name}\`\n`);
            console.log(`${cmd.description}\n`);

            if (cmd.options.length > 0) {
                console.log('**Options:**\n');
                console.log('| Flag | Description |');
                console.log('|------|-------------|');
                for (const opt of cmd.options) {
                    console.log(`| \`${opt.flags}\` | ${opt.description} |`);
                }
                console.log('\n');
            }

            // Here we could try to include the snippet if it existed.
            // For now, let's just link to source.
            console.log(`_Source: [${cmd.file}:L${cmd.line}](file://${fullPath}#L${cmd.line})_\n`);

            console.log('***');
        }
    }
}

main();
