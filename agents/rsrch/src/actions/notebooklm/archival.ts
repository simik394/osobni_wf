import { UniversalContext, NotebookLMActionDeps } from '../types';
import { scrapeNotebookAction } from './sync';
import { exportNotebookHistoryAction } from './history';
import { archiveNotebookSourcesAction } from './extract-sources';
import { downloadArtifactAction, downloadAudioAction } from './download';
import { formatContent } from '../utils';
import { getRegistry } from '../../core/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Archives a full NotebookLM notebook locally.
 * Includes sources metadata, all text artifacts, and the latest audio overview.
 */
export async function archiveNotebookAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string,
    options: { outputDir?: string, format?: 'md' | 'qmd', extractSources?: boolean, incremental?: boolean } = {}
): Promise<string[]> {
    const { page, log } = ctx;
    const { 
        outputDir = 'data/artifacts/notebooklm', 
        format = 'md', 
        extractSources = false,
        incremental = false
    } = options;
    const archivedFiles: string[] = [];
    const ext = format === 'qmd' ? 'qmd' : 'md';
    const registry = getRegistry();

    log(`Starting NotebookLM archival for "${title}" (format: ${format}, sources: ${extractSources}, incremental: ${incremental})...`);

    // 1. Scrape notebook metadata
    const notebookData = await scrapeNotebookAction(ctx, deps, title);
    if (!notebookData) throw new Error('Failed to scrape notebook data');

    const notebookTitle = notebookData.title || title || 'Untitled_Notebook';
    const sessionDir = path.join(outputDir, notebookData.platformId);
    
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Helper to check registry
    const isAlreadyArchived = (title: string, type: string) => {
        if (!incremental) return false;
        return Object.values(registry.listIds()).some((entry: any) => 
            entry.parentId === notebookData.platformId && 
            entry.originalTitle === title && 
            entry.type === type &&
            (entry.markdownPath ? fs.existsSync(entry.markdownPath) : 
             entry.audioPath ? fs.existsSync(entry.audioPath) : 
             entry.path ? fs.existsSync(entry.path) : false)
        );
    };

    // 2. Download Artifacts (Notes/Guides)
    log('Processing notebook artifacts...');
    for (const artifact of notebookData.artifacts) {
        if (isAlreadyArchived(artifact.title, 'notebook_artifact')) {
            log(`- Skipping already archived artifact: ${artifact.title}`);
            continue;
        }

        const artifactPath = await downloadArtifactAction(ctx, deps, title, artifact.title, sessionDir);
        if (typeof artifactPath === 'string') {
            archivedFiles.push(artifactPath);
            
            // Register in registry
            const artifactId = registry.generateBaseId();
            (registry as any).registry.artifacts[artifactId] = {
                type: 'notebook_artifact',
                parentId: notebookData.platformId,
                platform: 'notebooklm',
                originalTitle: artifact.title,
                markdownPath: artifactPath,
                createdAt: new Date().toISOString()
            };
        }
    }

    // 3. Download Latest Audio Overview
    log('Processing audio overview...');
    if (isAlreadyArchived('Audio Overview', 'notebook_audio')) {
        log('- Skipping already archived audio');
    } else {
        const audioOutputPath = path.join(sessionDir, 'audio_overview.mp3');
        const audioSuccess = await downloadAudioAction(ctx, deps, title, audioOutputPath);
        if (audioSuccess) {
            archivedFiles.push(audioOutputPath);
            
            const artifactId = registry.generateBaseId();
            (registry as any).registry.artifacts[artifactId] = {
                type: 'notebook_audio',
                parentId: notebookData.platformId,
                platform: 'notebooklm',
                originalTitle: 'Audio Overview',
                audioPath: audioOutputPath,
                createdAt: new Date().toISOString()
            };
        }
    }

    // 4. Export Notebook Summary
    const summaryPath = path.join(sessionDir, `summary.${ext}`);
    if (incremental && fs.existsSync(summaryPath)) {
        log('- Skipping summary export');
    } else {
        const summaryMd = `# ${notebookTitle}\n\n## Sources\n${notebookData.sources.map(s => `- [${s.title}](${s.url || ''})`).join('\n')}\n\n## Artifacts\n${notebookData.artifacts.map(a => `- ${a.title} (${a.type})`).join('\n')}`;
        
        const summaryContent = formatContent(summaryMd, `Notebook Summary: ${notebookTitle}`, format, {
            platformId: notebookData.platformId,
            sourceCount: notebookData.sources.length
        });

        fs.writeFileSync(summaryPath, summaryContent);
        archivedFiles.push(summaryPath);
    }

    // 5. Extract Full Source Text (Optional)
    if (extractSources) {
        log('Extracting full source contents...');
        const sourceFiles = await archiveNotebookSourcesAction(ctx, deps, sessionDir, format);
        archivedFiles.push(...sourceFiles);
        
        // Register sources in registry
        try {
            sourceFiles.forEach(f => {
                const fileName = path.basename(f);
                const artifactId = registry.generateBaseId();
                if (!isAlreadyArchived(fileName, 'source_text')) {
                    (registry as any).registry.artifacts[artifactId] = {
                        type: 'source_text',
                        parentId: notebookData.platformId,
                        platform: 'notebooklm',
                        originalTitle: fileName,
                        markdownPath: f,
                        createdAt: new Date().toISOString()
                    };
                }
            });
        } catch (err) {}
    }

    // 6. Export Full Chat History
    const historyPath = path.join(sessionDir, `chat_history.${ext}`);
    if (incremental && fs.existsSync(historyPath)) {
        log('- Skipping chat history export');
    } else {
        log('Exporting full chat history...');
        const chatHistoryResult = await exportNotebookHistoryAction(ctx, deps);
        
        const historyContent = formatContent(chatHistoryResult.markdown, `Chat History: ${notebookTitle}`, format, {
            platformId: notebookData.platformId
        });

        fs.writeFileSync(historyPath, historyContent);
        archivedFiles.push(historyPath);
    }

    registry.save();
    log(`Archival complete. ${archivedFiles.length} items processed.`);
    return archivedFiles;
}

