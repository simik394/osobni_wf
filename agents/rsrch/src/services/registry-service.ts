import { getRegistry, ArtifactEntry } from '../core/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

export class RegistryService {
    async list(type?: string): Promise<Record<string, ArtifactEntry>> {
        const reg = getRegistry();
        const all = reg.listAll();
        if (!type) return all;

        return Object.fromEntries(
            Object.entries(all).filter(([_, v]) => v.type === type)
        );
    }

    async getStatus() {
        const reg = getRegistry();
        const artifacts = reg.listAll();
        const ids = Object.keys(artifacts);

        const stats: Record<string, number> = {};
        ids.forEach(id => {
            const type = artifacts[id].type;
            stats[type] = (stats[type] || 0) + 1;
        });

        const orphans: string[] = [];
        const artifactDirs = ['data/artifacts/gemini', 'data/artifacts/notebooklm', 'data/audio'];
        
        const registeredPaths = new Set(
            Object.values(artifacts)
                .map(a => a.markdownPath || a.localPath)
                .filter(Boolean)
                .map(p => path.resolve(p!))
        );

        for (const dir of artifactDirs) {
            const fullDir = path.join(process.cwd(), dir);
            if (!fs.existsSync(fullDir)) continue;

            const files = fs.readdirSync(fullDir, { recursive: true }) as string[];
            for (const file of files) {
                const fullPath = path.join(fullDir, file);
                if (fs.statSync(fullPath).isDirectory()) continue;
                
                if (!registeredPaths.has(path.resolve(fullPath))) {
                    orphans.push(fullPath);
                }
            }
        }

        return { stats, orphans };
    }

    async prune(dryRun: boolean = false): Promise<string[]> {
        const { orphans } = await this.getStatus();
        const deleted: string[] = [];

        for (const orphan of orphans) {
            if (!dryRun) {
                fs.unlinkSync(orphan);
            }
            deleted.push(orphan);
        }

        return deleted;
    }

    async getLineage(id: string) {
        const reg = getRegistry();
        return reg.getLineage(id);
    }

    async getArtifact(id: string) {
        const reg = getRegistry();
        return reg.get(id);
    }
}

export const registryService = new RegistryService();
