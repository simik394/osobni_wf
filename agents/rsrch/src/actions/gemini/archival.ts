import * as fs from 'fs';
import * as path from 'path';
import { UniversalContext, GeminiActionDeps } from '../types';
import { getRegistry } from '../../core/artifact-registry';
import { listSessionArtifactsAction, readCanvasAction, openArtifactAction } from './canvas';
import { listDeepResearchDocsAction, readDeepResearchDocAction } from './research';

/**
 * Archives all artifacts from the current Gemini session to local storage.
 * Supports both Canvas documents and Deep Research reports.
 */
export async function archiveArtifactsAction(
    ctx: UniversalContext,
    deps: GeminiActionDeps,
    options: { outputDir?: string } = {}
): Promise<string[]> {
    const { log } = ctx;
    const { outputDir = 'data/artifacts/gemini' } = options;
    const registry = getRegistry();
    
    log(`Starting archival process to ${outputDir}...`);

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

    // 2. Process Deep Research Documents
    log('Checking for Deep Research documents...');
    const researchDocs = await listDeepResearchDocsAction(ctx, deps);
    for (let i = 0; i < researchDocs.length; i++) {
        const doc = await readDeepResearchDocAction(ctx, deps, i);
        if (doc) {
            const fileName = `${doc.title.replace(/[^a-z0-9]/gi, '_')}.md`;
            const filePath = path.join(sessionDir, fileName);
            
            let content = `# ${doc.title}\n\n`;
            if (doc.thoughts) content += `## AI Reasoning (Thoughts)\n${doc.thoughts}\n\n`;
            content += `## Report\n${doc.markdown}\n\n`;
            if (doc.references.length > 0) {
                content += `## Sources\n${doc.references.map(r => `- ${r}`).join('\n')}\n`;
            }

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
        const opened = await openArtifactAction(ctx, deps, canvas.name);
        if (opened) {
            const doc = await readCanvasAction(ctx, deps);
            if (doc) {
                const fileName = `canvas_${doc.title.replace(/[^a-z0-9]/gi, '_')}.md`;
                const filePath = path.join(sessionDir, fileName);
                
                let content = `# ${doc.title}\n\n${doc.markdown}\n\n`;
                if (doc.references.length > 0) {
                    content += `## Sources\n${doc.references.map(r => `- ${r}`).join('\n')}\n`;
                }

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

    return archivedFiles;
}
