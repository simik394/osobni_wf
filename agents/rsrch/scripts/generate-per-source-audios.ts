import { PerplexityClient } from '../src/client';
import { getGraphStore } from '../src/graph-store';

/**
 * Generate audio overview for each source individually with custom prompts
 * 
 * Usage:
 *   npm run ts-node scripts/generate-per-source-audios.ts -- \
 *     --notebook "Notebook Title" \
 *     --profile personal \
 *     --prompt-template "Focus on insights from: {title}" \
 *     --wet
 */

interface Args {
    notebookTitle?: string;
    profileId: string;
    promptTemplate: string;
    dryRun: boolean;
    cdpEndpoint?: string;
}

function parseArguments(): Args {
    const args = process.argv.slice(2);
    let notebookTitle: string | undefined;
    let profileId = 'default';
    let promptTemplate = 'Provide a detailed analysis focusing specifically on: {title}';
    let dryRun = true;
    let cdpEndpoint: string | undefined;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--notebook') {
            notebookTitle = args[i + 1];
            i++;
        } else if (args[i] === '--profile') {
            profileId = args[i + 1];
            i++;
        } else if (args[i] === '--prompt-template') {
            promptTemplate = args[i + 1];
            i++;
        } else if (args[i] === '--wet') {
            dryRun = false;
        } else if (args[i] === '--cdp') {
            cdpEndpoint = args[i + 1];
            i++;
        }
    }

    return {
        notebookTitle,
        profileId,
        promptTemplate,
        dryRun,
        cdpEndpoint
    };
}

async function generatePerSourceAudios() {
    const args = parseArguments();

    if (!args.notebookTitle) {
        console.error('❌ Error: --notebook is required');
        console.error('Usage: npm run ts-node scripts/generate-per-source-audios.ts -- --notebook "Notebook Title" [--profile personal] [--wet]');
        process.exit(1);
    }

    console.log('\n📋 Configuration:');
    console.log(`  Notebook: ${args.notebookTitle}`);
    console.log(`  Profile: ${args.profileId}`);
    console.log(`  Prompt Template: ${args.promptTemplate}`);
    console.log(`  Mode: ${args.dryRun ? '🧪 DRY RUN' : '🌊 WET RUN (will generate audio)'}`);
    console.log('');

    const client = new PerplexityClient({ profileId: args.profileId, cdpEndpoint: args.cdpEndpoint });
    const store = getGraphStore();
    const graphHost = process.env.FALKORDB_HOST || 'localhost';

    try {
        // Initialize client
        console.log(`[Init] Connecting to browser (profile: ${args.profileId})...`);
        await client.init({ profileId: args.profileId, cdpEndpoint: args.cdpEndpoint });

        // Create NotebookLM client
        const notebook = await client.createNotebookClient();

        // Open the notebook
        console.log(`\n[Notebook] Opening: "${args.notebookTitle}"...`);
        await notebook.openNotebook(args.notebookTitle);

        // Get all sources
        console.log('[Sources] Fetching sources list...');
        const sources = await notebook.getSources();

        if (sources.length === 0) {
            console.log('⚠️  No sources found in this notebook.');
            process.exit(0);
        }

        console.log(`\n✅ Found ${sources.length} sources:\n`);
        sources.forEach((source, index) => {
            console.log(`  ${index + 1}. [${source.type}] ${source.title}`);
        });

        // Connect to graph for syncing
        await store.connect(graphHost, parseInt(process.env.FALKORDB_PORT || '6379'));

        // Generate audio for each source
        console.log(`\n🎵 Generating audio for each source...\n`);

        for (let i = 0; i < sources.length; i++) {
            const source = sources[i];
            console.log(`\n[${i + 1}/${sources.length}] Processing: "${source.title}"`);
            console.log(`   Type: ${source.type}`);

            // Create custom prompt for this source
            const customPrompt = args.promptTemplate.replace(/{title}/g, source.title);
            console.log(`   Prompt: "${customPrompt}"`);

            try {
                // Generate audio for this specific source
                const result = await notebook.generateAudioOverview(
                    args.notebookTitle,
                    [source.title],  // Select only this source
                    customPrompt,
                    true,  // Wait for completion
                    args.dryRun
                );

                if (result.success) {
                    if (args.dryRun) {
                        console.log(`   ✅ [DRY RUN] Audio generation simulated successfully`);
                    } else {
                        console.log(`   ✅ Audio generated: "${result.artifactTitle}"`);

                        // Sync to graph
                        try {
                            console.log(`   [Graph] Syncing notebook state...`);
                            const data = await notebook.scrapeNotebook(args.notebookTitle, false);
                            const syncResult = await store.syncNotebook(data);

                            // Link audio to this specific source
                            if (result.artifactTitle) {
                                await store.linkAudioToSources(
                                    syncResult.id.replace('nb_', ''),
                                    result.artifactTitle,
                                    [source.title]
                                );
                                console.log(`   [Graph] Linked audio to source in graph`);
                            }
                        } catch (e: any) {
                            console.error(`   ⚠️  Failed to sync to graph: ${e.message}`);
                        }
                    }
                } else {
                    console.error(`   ❌ Failed to generate audio`);
                }

                // Wait between generations to avoid rate limits
                if (!args.dryRun && i < sources.length - 1) {
                    console.log(`   ⏸  Waiting 10 seconds before next generation...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }

            } catch (err: any) {
                console.error(`   ❌ Error: ${err.message}`);
                // Continue with next source even if one fails
            }
        }

        console.log(`\n\n🎉 Completed processing ${sources.length} sources!`);

        if (args.dryRun) {
            console.log('\n💡 This was a DRY RUN. To actually generate audio, add --wet flag');
        }

    } catch (error: any) {
        console.error('\n❌ Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await store.disconnect();
        await client.close();
    }
}

// Run the script
generatePerSourceAudios().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
