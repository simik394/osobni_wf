import * as fs from 'fs';
import * as path from 'path';
import { UniversalContext, GeminiActionDeps } from '../types';
import { getRegistry } from '../../core/artifact-registry';
import { listSessionArtifactsAction, readCanvasAction, openArtifactAction } from './canvas';
import { listDeepResearchDocsAction, readDeepResearchDocAction } from './research';
import { exportFullSessionAction } from './history';
import { extractResponseAction } from './extract-response';
import { formatContent } from '../utils';

/**
 * Archives all artifacts from the current Gemini session to local storage.
 * Supports both Canvas documents and Deep Research reports.
 */
export async function archiveArtifactsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { outputDir?: string, format?: 'md' | 'qmd', incremental?: boolean } = {}
): Promise<string[]> {
    const { log } = ctx;
    const { outputDir = 'data/artifacts/gemini', format = 'md', incremental = false } = options;
    const registry = getRegistry();
    const ext = format === 'qmd' ? 'qmd' : 'md';
    
    log(`Starting archival process to ${outputDir} (format: ${format}, incremental: ${incremental})...`);

    // 1. Get current session ID
    const currentUrl = ctx.page.url();
    const sessionId = currentUrl.includes('/app/') ? currentUrl.split('/app/')[1].split('?')[0] : 'unknown';
    
    // Ensure session is registered
    let parentId = 'unknown';
    const existingSession = Object.entries(registry.listIds()).find(([id, entry]: any) => entry?.geminiSessionId === sessionId);
    if (existingSession) {
        parentId = existingSession[0];
    } else {
        parentId = registry.registerSession(sessionId, 'Archived Session');
    }

    const sessionDir = path.join(outputDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    const archivedFiles: string[] = [];

    // Helper to check if artifact is already archived
    const isAlreadyArchived = (title: string, type: string) => {
        if (!incremental) return false;
        return Object.values(registry.listIds()).some((entry: any) => 
            entry.geminiSessionId === sessionId && 
            entry.originalTitle === title && 
            entry.type === type &&
            fs.existsSync(entry.markdownPath)
        );
    };

    // 2. Process Deep Research Documents
    log('Checking for Deep Research documents...');
    const researchDocs = await listDeepResearchDocsAction(ctx, deps);
    for (let i = 0; i < researchDocs.length; i++) {
        const docSummary = researchDocs[i]; // Minimal info
        if (isAlreadyArchived(docSummary.title, 'research_doc')) {
            log(`- Skipping already archived research doc: ${docSummary.title}`);
            continue;
        }

        const doc = await readDeepResearchDocAction(ctx, deps, i);
        if (doc) {
            const fileName = `${doc.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
            const filePath = path.join(sessionDir, fileName);
            
            let body = ``;
            if (doc.thoughts) body += `## AI Reasoning (Thoughts)\n${doc.thoughts}\n\n`;
            body += `## Report\n${doc.markdown}\n\n`;
            if (doc.references.length > 0) {
                body += `## Sources\n${doc.references.map(r => `- ${r}`).join('\n')}\n`;
            }

            const content = formatContent(body, doc.title, format, {
                type: 'Deep Research',
                session: sessionId,
                sources: doc.references
            });

            fs.writeFileSync(filePath, content, 'utf-8');
            
            // Register in registry
            const artifactId = registry.generateBaseId();
            (registry as any).registry.artifacts[artifactId] = {
                type: 'research_doc',
                parentId,
                geminiSessionId: sessionId,
                originalTitle: doc.title,
                currentTitle: doc.title,
                markdownPath: filePath,
                references: doc.references,
                createdAt: new Date().toISOString()
            };
            registry.save();
            
            archivedFiles.push(filePath);
            log(`Archived research doc: ${doc.title}`);
        }
    }

    // 3. Process Canvas Documents
    log('Checking for Canvas artifacts...');
    const canvasDocs = await listSessionArtifactsAction(ctx, deps);
    for (const canvas of canvasDocs) {
        if (isAlreadyArchived(canvas.name, 'canvas')) {
            log(`- Skipping already archived canvas: ${canvas.name}`);
            continue;
        }

        const opened = await openArtifactAction(ctx, deps, canvas.name);
        if (opened) {
            const doc = await readCanvasAction(ctx, deps);
            if (doc) {
                const fileName = `canvas_${doc.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
                const filePath = path.join(sessionDir, fileName);
                
                let body = `${doc.markdown}\n\n`;
                if (doc.references.length > 0) {
                    body += `## Sources\n${doc.references.map(r => `- ${r}`).join('\n')}\n`;
                }

                const content = formatContent(body, doc.title, format, {
                    type: 'Canvas',
                    session: sessionId,
                    sources: doc.references
                });

                fs.writeFileSync(filePath, content, 'utf-8');
                
                const artifactId = registry.generateBaseId();
                (registry as any).registry.artifacts[artifactId] = {
                    type: 'canvas',
                    parentId,
                    geminiSessionId: sessionId,
                    originalTitle: doc.title,
                    currentTitle: doc.title,
                    markdownPath: filePath,
                    references: doc.references,
                    createdAt: new Date().toISOString()
                };
                registry.save();

                archivedFiles.push(filePath);
                log(`Archived canvas doc: ${doc.title}`);
            }
            // Close canvas
            await ctx.page.keyboard.press('Escape');
        }
    }

    // 4. Export Session History
    const sessionFilePath = path.join(sessionDir, `session.${ext}`);
    if (incremental && fs.existsSync(sessionFilePath)) {
        log(`- Skipping session history export (already exists)`);
    } else {
        log('Exporting full session history...');
        const sessionExport = await exportFullSessionAction(ctx, { ...deps, extractResponse: extractResponseAction });
        
        const sessionContent = formatContent(sessionExport.markdown, sessionExport.title, format, {
            type: 'Chat Session',
            session: sessionId,
            turns: sessionExport.turns.length
        });

        fs.writeFileSync(sessionFilePath, sessionContent, 'utf-8');
        archivedFiles.push(sessionFilePath);
        log(`Archived full session history to session.${ext}`);
    }

    return archivedFiles;
}

/**
 * Synchronizes the local artifact registry to the Graph Store.
 */
export async function syncRegistryToGraphAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps & { researchManager?: any }
): Promise<{ synced: number, total: number }> {
    const { log } = ctx;
    const registry = getRegistry();
    const artifacts = (registry as any).registry.artifacts;
    const artifactIds = Object.keys(artifacts);
    
    log(`Syncing ${artifactIds.length} artifacts to Graph Store...`);
    
    let synced = 0;
    const manager = deps.researchManager;
    
    if (!manager) {
        log('No ResearchManager provided for sync.', 'error');
        return { synced: 0, total: artifactIds.length };
    }

    for (const id of artifactIds) {
        const art = artifacts[id];
        try {
            await manager.saveArtifact({
                id: art.geminiSessionId + '_' + id,
                type: art.type,
                title: art.currentTitle || art.originalTitle,
                markdownPath: art.markdownPath,
                references: art.references,
                sessionId: art.geminiSessionId
            });
            synced++;
        } catch (e: any) {
            log(`Failed to sync artifact ${id}: ${e.message}`, 'warn');
        }
    }

    log(`Sync complete. Synced ${synced}/${artifactIds.length} artifacts.`);
    return { synced, total: artifactIds.length };
}
