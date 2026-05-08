import * as fs from 'fs';
import { UniversalContext } from '../types';
import { getRegistry } from '../../core/artifact-registry';
import { GeminiClient } from '../../clients/gemini';
import { NotebookLMClient } from '../../clients/notebooklm';

/**
 * Bridges Gemini research to NotebookLM audio generation.
 */
export async function researchToAudioAction(
    ctx: UniversalContext,
    options: {
        artifactId: string;
        notebookTitle?: string;
        customPrompt?: string;
        waitForCompletion?: boolean;
    }
): Promise<{ success: boolean; artifactTitle?: string }> {
    const { artifactId, notebookTitle, customPrompt, waitForCompletion = true } = options;
    const { log } = ctx;
    
    const registry = getRegistry();
    const artifact = registry.get(artifactId);
    
    if (!artifact) {
        throw new Error(`Artifact with ID ${artifactId} not found in registry.`);
    }

    if (!artifact.markdownPath || !fs.existsSync(artifact.markdownPath)) {
        throw new Error(`Local markdown file not found for artifact ${artifactId}.`);
    }

    const content = fs.readFileSync(artifact.markdownPath, 'utf-8');
    const title = artifact.currentTitle || artifact.originalTitle;

    log(`Bridging research "${title}" to NotebookLM audio...`);

    // We use the same context but different clients
    const notebookClient = new NotebookLMClient(ctx.page);
    
    // 1. Ensure we are in the notebook
    if (notebookTitle) {
        await notebookClient.openNotebook(notebookTitle);
    } else {
        // Just use the active one or home
    }

    // 2. Add text source
    log(`Adding source: ${title}`);
    await notebookClient.addSourceText(content, title || 'Research Document');

    // 3. Generate audio
    log('Triggering audio generation...');
    // generateAudioOverview(notebookTitle: string, sources?: string[], prompt?: string, wet: boolean = false)
    const result = await notebookClient.generateAudioOverview(
        notebookTitle || 'Research Overview',
        [title || 'Research Document'],
        customPrompt,
        waitForCompletion
    );

    return { success: true, artifactTitle: title || 'Research Document' };
}
