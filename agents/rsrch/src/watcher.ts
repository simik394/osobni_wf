/**
 * Research Watcher Service
 * 
 * Monitors Gemini for research completion and optionally triggers 
 * NotebookLM audio generation.
 * 
 * Usage:
 *   rsrch watch                    # Watch and notify on completion
 *   rsrch watch --audio            # Also generate NotebookLM audio
 *   rsrch watch --folder ~/audio   # Save audio to specific folder
 */

import { PerplexityClient } from './client';
import { GeminiClient, ResearchInfo } from './gemini-client';
import { NotebookLMClient } from './notebooklm-client';
import { notifyResearchComplete, loadConfigFromEnv } from './notify';
import * as path from 'path';
import * as fs from 'fs';

export interface WatcherOptions {
    generateAudio: boolean;
    audioFolder: string;
    pollIntervalMs: number;
    notifyTopic?: string;
}

const DEFAULT_OPTIONS: WatcherOptions = {
    generateAudio: false,
    audioFolder: process.env.HOME + '/research/audio',
    pollIntervalMs: 30000, // 30 seconds
};

interface ResearchState {
    sessionId: string | null;
    title: string | null;
    isComplete: boolean;
    lastCheck: number;
}

/**
 * Watch for Gemini research completion
 */
export async function watchForResearch(options: Partial<WatcherOptions> = {}): Promise<void> {
    const opts: WatcherOptions = { ...DEFAULT_OPTIONS, ...options };

    console.log('🔍 Starting Research Watcher...');
    console.log(`   Poll interval: ${opts.pollIntervalMs / 1000}s`);
    console.log(`   Audio generation: ${opts.generateAudio ? 'enabled' : 'disabled'}`);
    if (opts.generateAudio) {
        console.log(`   Audio folder: ${opts.audioFolder}`);
    }
    console.log('');

    // Load notification config
    loadConfigFromEnv();

    // Initialize client
    const client = new PerplexityClient();
    await client.init();
    const gemini = await client.createGeminiClient();
    await gemini.init();

    let lastKnownSession: string | null = null;
    let processedSessions = new Set<string>();

    console.log('👀 Watching for research completion...');
    console.log('   Press Ctrl+C to stop\n');

    // Polling loop
    while (true) {
        try {
            const state = await checkResearchState(gemini);

            if (state.isComplete && state.sessionId && !processedSessions.has(state.sessionId)) {
                console.log(`\n✅ Research complete: "${state.title || 'Untitled'}"`);
                console.log(`   Session: ${state.sessionId}`);

                // Mark as processed
                processedSessions.add(state.sessionId);

                // Process the completed research
                await processCompletedResearch(client, gemini, state, opts);
            } else if (state.sessionId && state.sessionId !== lastKnownSession) {
                console.log(`📊 Active research: "${state.title || 'In progress...'}" (${state.sessionId})`);
                lastKnownSession = state.sessionId;
            }

        } catch (e: any) {
            console.warn(`⚠️ Check failed: ${e.message}`);
        }

        // Wait before next poll
        await sleep(opts.pollIntervalMs);
    }
}

/**
 * Check current research state
 */
async function checkResearchState(gemini: GeminiClient): Promise<ResearchState> {
    try {
        const info = await gemini.getResearchInfo();

        // Check for completion indicators
        // Research is complete if we can get a title and there's content
        const isComplete = !!(info.title && info.firstHeading);

        return {
            sessionId: info.sessionId || null,
            title: info.title || null,
            isComplete,
            lastCheck: Date.now(),
        };
    } catch (e) {
        return {
            sessionId: null,
            title: null,
            isComplete: false,
            lastCheck: Date.now(),
        };
    }
}

/**
 * Process a completed research session
 */
async function processCompletedResearch(
    client: PerplexityClient,
    gemini: GeminiClient,
    state: ResearchState,
    opts: WatcherOptions
): Promise<void> {
    const title = state.title || 'Research';
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);

    let audioPath: string | undefined;

    if (opts.generateAudio) {
        console.log('\n🎧 Generating NotebookLM audio...');

        try {
            // Create audio folder if needed
            if (!fs.existsSync(opts.audioFolder)) {
                fs.mkdirSync(opts.audioFolder, { recursive: true });
            }

            const notebook = await client.createNotebookClient();

            // Create notebook with research title
            const notebookTitle = `Research: ${title}`;
            await notebook.createNotebook(notebookTitle);

            // Add the research as source (export to Google Docs first)
            console.log('   Exporting research to Google Docs...');
            const exportResult = await gemini.exportCurrentToGoogleDocs();

            if (exportResult.docUrl) {
                console.log('   Adding to NotebookLM...');
                await notebook.addSourceUrl(exportResult.docUrl);

                // Generate audio (wet run)
                console.log('   Generating audio overview...');
                await notebook.generateAudioOverview(notebookTitle, undefined, undefined, true, false);

                // Download audio
                audioPath = path.join(opts.audioFolder, `${timestamp}_${safeName}_overview.mp3`);
                console.log(`   Downloading to: ${audioPath}`);
                await notebook.downloadAudio(notebookTitle, audioPath);

                console.log('✅ Audio generated and saved!');
            } else {
                console.warn('⚠️ Could not export research to Docs');
            }

        } catch (e: any) {
            console.error(`❌ Audio generation failed: ${e.message}`);
        }
    }

    // Send notification
    console.log('\n📬 Sending notification...');
    await notifyResearchComplete(title, audioPath);
    console.log('✅ Notification sent!');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * One-shot check and process (for CLI)
 */
export async function checkAndProcess(options: Partial<WatcherOptions> = {}): Promise<boolean> {
    const opts: WatcherOptions = { ...DEFAULT_OPTIONS, ...options };

    loadConfigFromEnv();

    const client = new PerplexityClient();
    await client.init();

    try {
        const gemini = await client.createGeminiClient();
        await gemini.init();

        const state = await checkResearchState(gemini);

        if (state.isComplete && state.title) {
            console.log(`✅ Found completed research: "${state.title}"`);
            await processCompletedResearch(client, gemini, state, opts);
            return true;
        } else {
            console.log('❌ No completed research found');
            return false;
        }
    } finally {
        await client.close();
    }
}
