import * as fs from 'fs';
import * as path from 'path';

// Character set for ID generation (excludes confusing chars: 0/O, 1/I/L)
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type ArtifactType = 'session' | 'document' | 'audio';

export interface ArtifactEntry {
    type: ArtifactType;
    parentId?: string;           // For doc/audio, links to parent
    createdAt: string;           // ISO timestamp

    // Session-specific
    geminiSessionId?: string;
    query?: string;

    // Document-specific
    googleDocId?: string;
    originalTitle?: string;
    currentTitle?: string;

    // Audio-specific
    notebookTitle?: string;
    localPath?: string;
}

export interface Registry {
    artifacts: Record<string, ArtifactEntry>;
}

export class ArtifactRegistry {
    private registry: Registry = { artifacts: {} };
    private filePath: string;

    constructor(dataDir: string = 'data') {
        this.filePath = path.join(dataDir, 'artifact-registry.json');

        // Ensure data directory exists
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    /**
     * Load registry from disk
     */
    load(): void {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                this.registry = JSON.parse(data);
                console.log(`[Registry] Loaded ${Object.keys(this.registry.artifacts).length} artifacts.`);
            }
        } catch (e) {
            console.error('[Registry] Failed to load:', e);
            this.registry = { artifacts: {} };
        }
    }

    /**
     * Save registry to disk
     */
    save(): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.registry, null, 2), 'utf-8');
        } catch (e) {
            console.error('[Registry] Failed to save:', e);
        }
    }

    /**
     * Generate a random base ID (3 chars)
     */
    generateBaseId(): string {
        let id: string;
        do {
            id = Array.from({ length: 3 }, () =>
                ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
            ).join('');
        } while (this.registry.artifacts[id]); // Ensure uniqueness
        return id;
    }

    /**
     * Get next sequence number for a parent (e.g., 01, 02, ...)
     */
    private getNextSequence(parentId: string): string {
        const children = Object.keys(this.registry.artifacts)
            .filter(id => id.startsWith(`${parentId}-`) && /^\d{2}$/.test(id.slice(parentId.length + 1, parentId.length + 3)));
        const nums = children.map(id => parseInt(id.slice(parentId.length + 1, parentId.length + 3), 10));
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        return next.toString().padStart(2, '0');
    }

    /**
     * Get next letter suffix for an audio (e.g., A, B, C, ...)
     */
    private getNextLetter(parentId: string): string {
        const children = Object.keys(this.registry.artifacts)
            .filter(id => id.startsWith(`${parentId}-`) && /^[A-Z]$/.test(id.slice(-1)));
        const letters = children.map(id => id.slice(-1).charCodeAt(0) - 65); // A=0, B=1, ...
        const next = letters.length > 0 ? Math.max(...letters) + 1 : 0;
        return String.fromCharCode(65 + next); // 0→A, 1→B, ...
    }

    /**
     * Register a new Gemini session
     * @returns The assigned base ID (e.g., "A1D")
     */
    registerSession(geminiSessionId: string, query: string): string {
        const id = this.generateBaseId();
        this.registry.artifacts[id] = {
            type: 'session',
            geminiSessionId,
            query,
            createdAt: new Date().toISOString()
        };
        this.save();
        console.log(`[Registry] Registered session: ${id} (query: "${query.substring(0, 30)}...")`);
        return id;
    }

    /**
     * Register a document export
     * @param parentId The session's base ID
     * @returns The assigned document ID (e.g., "A1D-01")
     */
    registerDocument(parentId: string, googleDocId: string, originalTitle: string): string {
        const seq = this.getNextSequence(parentId);
        const id = `${parentId}-${seq}`;
        const currentTitle = `${id} ${originalTitle}`;

        this.registry.artifacts[id] = {
            type: 'document',
            parentId,
            googleDocId,
            originalTitle,
            currentTitle,
            createdAt: new Date().toISOString()
        };
        this.save();
        console.log(`[Registry] Registered document: ${id} → "${currentTitle}"`);
        return id;
    }

    /**
     * Register an audio artifact
     * @param parentId The document's ID (e.g., "A1D-01")
     * @returns The assigned audio ID (e.g., "A1D-01-A")
     */
    registerAudio(parentId: string, notebookTitle: string, originalTitle: string, localPath?: string): string {
        const letter = this.getNextLetter(parentId);
        const id = `${parentId}-${letter}`;
        const currentTitle = `${id} ${originalTitle}`;

        this.registry.artifacts[id] = {
            type: 'audio',
            parentId,
            notebookTitle,
            originalTitle,
            currentTitle,
            localPath,
            createdAt: new Date().toISOString()
        };
        this.save();
        console.log(`[Registry] Registered audio: ${id} → "${currentTitle}"`);
        return id;
    }

    /**
     * Get artifact by ID
     */
    get(id: string): ArtifactEntry | undefined {
        return this.registry.artifacts[id];
    }

    /**
     * Get full lineage chain (child → parent → grandparent → ...)
     */
    getLineage(id: string): ArtifactEntry[] {
        const chain: ArtifactEntry[] = [];
        let current = this.registry.artifacts[id];

        while (current) {
            chain.push(current);
            if (current.parentId) {
                current = this.registry.artifacts[current.parentId];
            } else {
                break;
            }
        }
        return chain;
    }

    /**
     * List all artifact IDs
     */
    listIds(): string[] {
        return Object.keys(this.registry.artifacts);
    }

    /**
     * List artifacts by type
     */
    listByType(type: ArtifactType): string[] {
        return Object.entries(this.registry.artifacts)
            .filter(([_, entry]) => entry.type === type)
            .map(([id]) => id);
    }

    /**
     * Find document by Google Doc ID
     */
    findByGoogleDocId(googleDocId: string): { id: string; entry: ArtifactEntry } | undefined {
        for (const [id, entry] of Object.entries(this.registry.artifacts)) {
            if (entry.googleDocId === googleDocId) {
                return { id, entry };
            }
        }
        return undefined;
    }

    /**
     * Find audio by local path
     */
    findByLocalPath(localPath: string): { id: string; entry: ArtifactEntry } | undefined {
        for (const [id, entry] of Object.entries(this.registry.artifacts)) {
            if (entry.localPath === localPath) {
                return { id, entry };
            }
        }
        return undefined;
    }

    /**
     * Update an artifact's currentTitle (after rename)
     */
    updateTitle(id: string, currentTitle: string): void {
        const entry = this.registry.artifacts[id];
        if (entry) {
            entry.currentTitle = currentTitle;
            this.save();
        }
    }

    /**
     * Update an artifact's localPath (after download)
     */
    updateLocalPath(id: string, localPath: string): void {
        const entry = this.registry.artifacts[id];
        if (entry) {
            entry.localPath = localPath;
            this.save();
        }
    }
}

// Singleton instance for shared use
let registryInstance: ArtifactRegistry | null = null;

export function getRegistry(): ArtifactRegistry {
    if (!registryInstance) {
        registryInstance = new ArtifactRegistry();
        registryInstance.load();
    }
    return registryInstance;
}
