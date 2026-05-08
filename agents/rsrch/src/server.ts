import express from 'express';
import * as path from 'path';
import cors from 'cors';
import { BrowserClient } from './clients/base';
import { GeminiClient } from './clients/gemini';
import { config } from './config';
import { getGraphStore } from './core/graph-store';
import { discordService } from './services/notification';

// Import Modular Routers
import { createNotebookRouter } from './routes/notebook-router';
import { createNotebookLMRouter } from './routes/notebooklm-router';
import { createWebhookRouter } from './routes/webhook-router';
import { createResearchRouter } from './routes/research-router';
import { createWorkflowRouter } from './routes/workflow-router';
import { createChatRouter, createGeminiRouter } from './routes/chat-router';
import { createKeepRouter } from './routes/keep-router';
import { createSystemRouter } from './routes/system-router';

// Initialize App
const app = express();
const port = Number(config.port || process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static dashboard files
app.use(express.static(path.join(__dirname, '../_site')));

// Initial State / Sidecar & Principal Instances
const client = new BrowserClient({ 
    verbose: true,
    profileId: config.auth.profileId
});
const graphStore = getGraphStore();
let activeGeminiClient: GeminiClient | null = null;

/**
 * Shared helper to get or initialize a Gemini client.
 */
async function getActiveGeminiClient(): Promise<GeminiClient> {
    if (!activeGeminiClient) {
        if (!client.isBrowserInitialized()) {
            console.log('[Server] Initializing browser for Gemini...');
            await client.init();
        }
        const g = await client.createGeminiClient();
        await g.init();
        activeGeminiClient = g;
    }
    return activeGeminiClient!;
}

// ----------------------------------------------------------------------------
// Health & Basic Routes
// ----------------------------------------------------------------------------

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        browser: client.isBrowserInitialized() ? 'ready' : 'not_initialized',
        mode: process.env.USE_WINDMILL === 'true' ? 'windmill-proxy (passive)' : 'local-execution'
    });
});

// ----------------------------------------------------------------------------
// Mounting Modular Routers
// ----------------------------------------------------------------------------

// Dependencies for Routers
const dependencies = {
    browserClient: client,
    getGeminiClient: getActiveGeminiClient,
    graphStore: graphStore,
    notifyResearchComplete: async (title: string, path?: string) => {
        console.log(`[Notification] Research complete: ${title}`);
        await discordService.sendWebhook({
            title: `Research Complete: ${title}`,
            description: `Audio artifact: ${path || 'none'}`,
            timestamp: new Date().toISOString()
        });
    }
};

// 1. NotebookLM Features
const notebookRouter = createNotebookRouter(dependencies);
const notebookLMRouter = createNotebookLMRouter(dependencies);
const webhookRouter = createWebhookRouter(dependencies);

app.use('/notebook', notebookRouter);
app.use('/notebooklm', notebookLMRouter);
app.use('/webhook', webhookRouter);

// 2. Deep Research & Jobs
const researchRouter = createResearchRouter(dependencies);
app.use('/deep-research', researchRouter);
app.use('/jobs', researchRouter);

// 3. High-level Workflows
const workflowRouter = createWorkflowRouter(dependencies);
app.use('/research-to-podcast', workflowRouter);
app.use('/jules', workflowRouter);

// 4. OpenAI-Compatible API
app.use('/v1', createChatRouter({ ...dependencies }));

// 5. Legacy Gemini Routes
app.use('/gemini', createGeminiRouter(dependencies));

// 6. Google Keep
app.use('/keep', createKeepRouter(dependencies));

// 7. System & Dashboard
app.use('/system', createSystemRouter(dependencies));

// ----------------------------------------------------------------------------
// Server Startup
// ----------------------------------------------------------------------------

export async function startServer(overridePort?: number) {
    const listenPort = overridePort || port;
    console.log('--- Rsrch Agent Server (Modular) ---');
    
    if (config.preinitBrowser) {
        try {
            await client.init();
            console.log('Browser pre-initialized successfully.');
        } catch (e) {
            console.warn('Browser pre-initialization failed.');
        }
    }

    return new Promise((resolve, reject) => {
        const server = app.listen(listenPort, '0.0.0.0', () => {
            console.log(`Server running at http://0.0.0.0:${listenPort}`);
            console.log(`Mode: ${process.env.USE_WINDMILL === 'true' ? 'Windmill Passive' : 'Local Execution'}`);
            resolve(server);
        });

        server.on('error', (err) => {
            console.error('[Server] Failed to start:', err);
            reject(err);
        });
    });
}

if (require.main === module) {
    process.on('uncaughtException', (err) => {
        console.error('UNCAUGHT EXCEPTION:', err);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('UNHANDLED REJECTION:', reason);
    });

    startServer().catch(err => {
        console.error('SERVER FATAL ERROR:', err);
        process.exit(1);
    });
}
