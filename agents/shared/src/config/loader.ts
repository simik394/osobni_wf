import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import * as dotenv from 'dotenv';

// Load environment variables immediately
dotenv.config();

export type ConfigProfile = 'dev' | 'prod' | 'test' | 'default';

export interface ConfigOptions<T extends z.ZodType> {
    schema: T;
    appName: string;
    profile?: ConfigProfile;
    configPaths?: string[];
}

export class ConfigLoader<T extends z.ZodType> {
    private schema: T;
    private appName: string;
    private profile: ConfigProfile;
    private configPaths: string[];

    constructor(options: ConfigOptions<T>) {
        this.schema = options.schema;
        this.appName = options.appName;
        this.profile = options.profile || (process.env.NODE_ENV as ConfigProfile) || 'default';
        this.configPaths = options.configPaths || [
            process.cwd(),
            path.join(os.homedir(), '.config', this.appName),
            path.join('/etc', this.appName)
        ];
    }

    public load(): z.infer<T> {
        let loadedConfig: any = {};

        // 1. Load from config files (YAML/JSON)
        // Order: default -> profile specific
        // Files: config.yaml, config.json

        const filesToTry = [
            'config',
            `config.${this.profile}`
        ];

        const extensions = ['.yaml', '.yml', '.json'];

        for (const dir of this.configPaths) {
            for (const fileBase of filesToTry) {
                for (const ext of extensions) {
                    const filePath = path.join(dir, fileBase + ext);
                    if (fs.existsSync(filePath)) {
                        try {
                            const content = fs.readFileSync(filePath, 'utf-8');
                            let parsed: any;
                            if (ext === '.json') {
                                parsed = JSON.parse(content);
                            } else {
                                parsed = yaml.load(content);
                            }

                            // Deep merge (simple version)
                            loadedConfig = this.mergeDeep(loadedConfig, parsed);
                        } catch (e) {
                            console.warn(`Failed to load config file ${filePath}:`, e);
                        }
                    }
                }
            }
        }

        // 2. Load from Environment Variables
        const envConfig = this.mapEnvToConfig(this.appName.toUpperCase());
        loadedConfig = this.mergeDeep(loadedConfig, envConfig);

        // 3. Validate against schema
        return this.schema.parse(loadedConfig);
    }

    private mergeDeep(target: any, source: any): any {
        const isObject = (obj: any) => obj && typeof obj === 'object';

        if (!isObject(target) || !isObject(source)) {
            return source;
        }

        Object.keys(source).forEach(key => {
            const targetValue = target[key];
            const sourceValue = source[key];

            if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
                target[key] = targetValue.concat(sourceValue);
            } else if (isObject(targetValue) && isObject(sourceValue)) {
                target[key] = this.mergeDeep(Object.assign({}, targetValue), sourceValue);
            } else {
                target[key] = sourceValue;
            }
        });

        return target;
    }

    private mapEnvToConfig(prefix: string): any {
        const config: any = {};
        for (const key of Object.keys(process.env)) {
            if (key.startsWith(prefix + '_')) {
                const configKey = key.slice(prefix.length + 1); // remove PREFIX_

                // Split by double underscore
                // TEST_APP_APP__PORT -> configKey = APP__PORT
                // parts = ['app', 'port'] (because toCamelCase('app') -> 'app')

                const parts = configKey.split('__').map(p => {
                    // Convert each part to camelCase if it contains underscores
                    return this.toCamelCase(p.toLowerCase());
                });

                let current = config;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    current[part] = current[part] || {};
                    current = current[part];
                }
                const lastPart = parts[parts.length - 1];

                // Try to parse number/bool
                let value: any = process.env[key];
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (!isNaN(Number(value)) && value !== '') value = Number(value);

                current[lastPart] = value;
            }
        }
        return config;
    }

    private toCamelCase(str: string): string {
        return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    }
}
