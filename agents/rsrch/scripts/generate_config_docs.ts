import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(__dirname, '../src');
const CONFIG_FILE = path.join(SRC_DIR, 'config.ts');

function generateConfigDocs() {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');

    console.log('---');
    console.log('title: "Configuration Reference"');


    console.log('---');

    console.log('\n# Configuration\n');
    console.log('Run-time configuration for `rsrch`, defined in `src/config.ts`.\n');

    console.log('## Environment Variables\n');
    console.log('Priority: `process.env` > `config.json` > Defaults\n');

    console.log('| Variable | Path | Default | Type |');
    console.log('|----------|------|---------|------|');

    // Simple regex parsing for the config schema
    // Matches: key: z.type()...default(value)
    // This is heuristic but works for standard Zod definitions
    const lines = content.split('\n');
    let inSchema = false;
    let objectStack = 0;
    let currentPath: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.includes('const configSchema = z.object({')) {
            inSchema = true;
            objectStack = 1;
            continue;
        }

        if (!inSchema) continue;

        if (trimmed.includes('{')) {
            // Basic handling for nested objects like ntfy: z.object({
            const match = trimmed.match(/^(\w+):.*z\.object\({/);
            if (match) {
                currentPath.push(match[1]);
                objectStack++;
            }
            continue;
        }

        if (trimmed.includes('}')) {
            objectStack--;
            if (objectStack === 0) break;
            currentPath.pop();
            continue;
        }

        // Parse key: z.string().default('val')
        const keyMatch = trimmed.match(/^(\w+):/);
        if (keyMatch) {
            const key = keyMatch[1];
            const fullPath = [...currentPath, key].join('.');

            // Extract type
            let type = 'unknown';
            if (trimmed.includes('z.string()')) type = 'string';
            if (trimmed.includes('z.boolean()')) type = 'boolean';
            if (trimmed.includes('z.number()') || trimmed.includes('z.coerce.number()')) type = 'number';

            // Extract default
            let def = '-';
            const defaultMatch = trimmed.match(/\.default\((.*?)\)/);
            if (defaultMatch) {
                def = defaultMatch[1].replace(/['"]/g, '`');
            } else if (trimmed.includes('.optional()')) {
                def = '*Optional*';
            }

            // Guess Env Var (simple heuristic)
            let envVar = '-';
            // We can look at the merging logic at the bottom of the file for true env vars, 
            // but for now let's generate standard names
            const guessEnv = fullPath.split('.').map(p => p.toUpperCase().replace(/([a-z])([A-Z])/g, '$1_$2')).join('_');

            console.log(`| \`${guessEnv}\` | \`${fullPath}\` | ${def} | ${type} |`);
        }
    }

    console.log('\n## Usage');
    console.log('\nTo override defaults, create a `config.json` in the working directory or set environment variables.\n');

    console.log('### Example `config.json`');
    console.log('```json');
    console.log('{');
    console.log('  "port": 4000,');
    console.log('  "headless": true');
    console.log('}');
    console.log('```');
}

generateConfigDocs();
