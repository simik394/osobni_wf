
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

export interface GemConfig {
    name: string;
    instructions: string;
    files?: string[];
}

export function loadGemConfig(configPath: string): GemConfig {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    try {
        const parsed = yaml.load(content) as any;

        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid YAML format');
        }

        if (!parsed.name || !parsed.instructions) {
            throw new Error('Config must contain "name" and "instructions" fields');
        }

        // Resolve file paths relative to config file if they are relative
        let files: string[] = [];
        if (parsed.files && Array.isArray(parsed.files)) {
            const configDir = path.dirname(configPath);
            files = parsed.files.map((f: string) => {
                if (path.isAbsolute(f)) return f;
                return path.resolve(configDir, f);
            });
        }

        return {
            name: parsed.name,
            instructions: parsed.instructions,
            files
        };

    } catch (e: any) {
        throw new Error(`Failed to parse config: ${e.message}`);
    }
}
