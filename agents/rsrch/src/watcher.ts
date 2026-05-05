/**
 * Research Watcher Service
 * 
 * Monitors Gemini for research completion via REST API and 
 * triggers NotebookLM audio generation.
 * 
 * This follows the "Thin CLI" mandate by delegating all browser
 * heavy lifting to the rsrch server.
 */

import { discordService } from './services/notification';
import { config } from './config';
import * as fs from 'fs';

export interface WatcherOptions {
    generateAudio: boolean;
    submitToQueue: boolean;  // Submit to server queue (recommended)
    serverUrl: string;
    audioFolder: string;
    pollIntervalMs: number;
    notifyTopic?: string;
}

const DEFAULT_OPTIONS: WatcherOptions = {
    generateAudio: false,
    submitToQueue: true, // Default to queue mode in refactored version
    serverUrl: 'http://localhost:3000',
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
 * Watch for Gemini research completion via REST API
 */
export async function watchForResearch(options: Partial<WatcherOptions> = {}): Promise<void> {
    const opts: WatcherOptions = { ...DEFAULT_OPTIONS, ...options };

    console.log('🔍 Starting Research Watcher (API Mode)...');
    console.log(`   Server: ${opts.serverUrl}`);
    console.log(`   Poll interval: ${opts.pollIntervalMs / 1000}s`);
    console.log('');

    let lastKnownSession: string | null = null;
    let processedSessions = new Set<string>();

    console.log('👀 Watching for research completion...');
    console.log('   Press Ctrl+C to stop\n');

    // Polling loop
    while (true) {
        try {
            const state = await checkResearchState(opts.serverUrl);

            if (state.isComplete && state.sessionId && !processedSessions.has(state.sessionId)) {
                console.log(`\n✅ Research complete: "${state.title || 'Untitled'}"`);
                console.log(`   Session: ${state.sessionId}`);

                // Mark as processed
                processedSessions.add(state.sessionId);

                // Process the completed research
                await processCompletedResearch(state, opts);
            } else if (state.sessionId && state.sessionId !== lastKnownSession) {
                console.log(`📊 Active research: "${state.title || 'In progress...'}" (${state.sessionId})`);
                lastKnownSession = state.sessionId;
            } else if (!state.sessionId) {
                // Server might be idle or no active session
            }

        } catch (e: any) {
            console.warn(`⚠️ Poll failed: ${e.message}. Is the server running?`);
        }

        // Wait before next poll
        await sleep(opts.pollIntervalMs);
    }
}

/**
 * Check current research state via Server API
 */
async function checkResearchState(serverUrl: string): Promise<ResearchState> {
    try {
        const response = await fetch(`${serverUrl}/gemini/info`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const res = await response.json();
        if (!res.success) return { sessionId: null, title: null, isComplete: false, lastCheck: Date.now() };

        const info = res.data;

        // Research is complete if we have a title and a heading (server-side logic)
        const isComplete = !!(info.title && info.firstHeading);

        return {
            sessionId: info.sessionId || null,
            title: info.title || null,
            isComplete,
            lastCheck: Date.now(),
        };
    } catch (e) {
        throw e;
    }
}

/**
 * Process a completed research session by submitting to queue
 */
async function processCompletedResearch(
    state: ResearchState,
    opts: WatcherOptions
): Promise<void> {
    const title = state.title || 'Research';

    // Always submit to queue in the refactored version
    // If the user wants audio, the server handles it via the job queue.
    await submitToServerQueue(state, opts);

    // Send notification
    console.log('\n📬 Sending notification...');
    await discordService.sendNotification(title, { 
        title: 'Research Complete (Watcher)',
        description: `Session ${state.sessionId} is complete. Audio generation queued.`
    });

    console.log('✅ Notification sent!');
}

/**
 * Submit research to server queue for processing
 */
async function submitToServerQueue(
    state: ResearchState,
    opts: WatcherOptions
): Promise<void> {
    const title = state.title || 'Research';
    console.log(`\n📤 Submitting to server queue: "${title}"`);

    try {
        const response = await fetch(`${opts.serverUrl}/notebook/generate-audio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                notebookTitle: `Research: ${title}`,
                dryRun: false,
                metadata: {
                    source: 'watcher',
                    sessionId: state.sessionId,
                    detectedAt: new Date().toISOString()
                }
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Job queued successfully.`);
        } else {
            const error = await response.text();
            console.error(`❌ Queue submission failed: ${response.status} - ${error}`);
        }
    } catch (e: any) {
        console.error(`❌ Server connection failed: ${e.message}`);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * One-shot check and process (for CLI)
 */
export async function checkAndProcess(options: Partial<WatcherOptions> = {}): Promise<boolean> {
    const opts: WatcherOptions = { ...DEFAULT_OPTIONS, ...options };

    try {
        const state = await checkResearchState(opts.serverUrl);

        if (state.isComplete && state.title) {
            console.log(`✅ Found completed research: "${state.title}"`);
            await processCompletedResearch(state, opts);
            return true;
        } else {
            console.log('❌ No completed research found');
            return false;
        }
    } catch (e: any) {
        console.error(`❌ Error checking research state: ${e.message}`);
        return false;
    }
}
