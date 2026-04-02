import { UniversalContext, NotebookLMActionDeps } from '../types';
import { getSourcesAction } from './sources';
import { getStudioArtifactsAction } from './studio';
import { getChatMessagesAction } from './query';
import { downloadAudioAction } from './download';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Scrapes a notebook's contents (sources, artifacts, optionally download audio).
 */
export async function scrapeNotebookAction(
    ctx: UniversalContext,
    deps: NotebookLMActionDeps,
    title: string,
    options: { downloadAudio?: boolean, outputDir?: string, filename?: string } = {}
): Promise<{
    title: string;
    platformId: string;
    sources: Array<{ type: string; title: string; url?: string }>;
    audioOverviews: Array<{ title: string; hasTranscript: boolean }>;
    artifacts: Array<{ type: 'audio' | 'note' | 'faq' | 'briefing' | 'timeline' | 'table' | 'presentation' | 'other'; title: string; details?: string; sourceCount?: number; absoluteTime?: string; id?: string }>;
    messages: Array<{ role: 'user' | 'ai'; contentPreview: string }>;
}> {
    const { page, log } = ctx;
    const { openNotebookAction } = await import('./navigation');

    log(`Scraping notebook: ${title}`);
    await openNotebookAction(ctx, deps, title);
    await deps.humanDelay(2000);

    const url = page.url();
    const idMatch = url.match(/notebook\/([a-zA-Z0-9_-]+)/);
    const platformId = idMatch ? idMatch[1] : title.toLowerCase().replace(/[^a-z0-9]/g, '');

    const sources = await getSourcesAction(ctx, deps);
    const artifacts = await getStudioArtifactsAction(ctx, deps);
    
    // Legacy support for audio overviews
    const audioOverviews = artifacts.filter(a => a.type === 'audio').map(a => ({
        title: a.title,
        hasTranscript: a.details?.toLowerCase().includes('transcript') || a.details?.toLowerCase().includes('přepis') || false
    }));

    if (options.downloadAudio && audioOverviews.length > 0) {
        const outputDir = options.outputDir || 'data/audio';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filename = options.filename
            ? (options.filename.endsWith('.mp3') ? options.filename : `${options.filename}.mp3`)
            : `${title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}_${Date.now()}.mp3`;

        const outputPath = path.join(outputDir, filename);

        try {
            await downloadAudioAction(ctx, deps, title, outputPath, { latestOnly: true });
            log(`Audio downloaded to: ${outputPath}`);
        } catch (e: any) {
            log(`Failed to download audio: ${e.message}`, 'error');
        }
    }

    const messages = await getChatMessagesAction(ctx, deps);

    return { title, platformId, sources, audioOverviews, artifacts, messages };
}
