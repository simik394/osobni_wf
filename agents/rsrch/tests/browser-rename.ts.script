/**
 * Browser Integration Tests for Artifact Registry Rename Functions
 * 
 * Tests the actual browser automation for renaming:
 * 1. Google Docs title rename
 * 2. NotebookLM artifact rename
 * 
 * PREREQUISITES:
 * - Must be run with authenticated browser session
 * - Requires existing Google Doc ID
 * - Requires existing NotebookLM notebook with audio artifact
 * 
 * Run: npx ts-node tests/browser-rename.test.ts
 */

import { PerplexityClient } from '../src/client';
import { GeminiClient } from '../src/gemini-client';
import { NotebookLMClient } from '../src/notebooklm-client';

// ============================================================
// CONFIGURATION - Update these before running
// ============================================================

const CONFIG = {
    // Set to a real Google Doc ID you have access to
    // You can get this from a Google Docs URL: https://docs.google.com/document/d/{THIS_IS_THE_ID}/edit
    googleDocId: process.env.TEST_GDOC_ID || '',

    // Original title to restore after test (optional)
    googleDocOriginalTitle: process.env.TEST_GDOC_ORIGINAL_TITLE || '',

    // NotebookLM notebook title to test in
    notebookTitle: process.env.TEST_NOTEBOOK_TITLE || '',

    // Current artifact title to rename (must exist in the notebook)
    artifactCurrentTitle: process.env.TEST_ARTIFACT_TITLE || 'Audio Overview',
};

// ============================================================
// TEST RUNNER
// ============================================================

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    details?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
    console.log(`[TEST] ${msg}`);
}

function recordResult(name: string, passed: boolean, error?: string, details?: string) {
    results.push({ name, passed, error, details });
    if (passed) {
        console.log(`  ✅ ${name}`);
    } else {
        console.log(`  ❌ ${name}: ${error}`);
    }
    if (details) {
        console.log(`     Details: ${details}`);
    }
}

// ============================================================
// TESTS
// ============================================================

async function testGoogleDocsRename(gemini: GeminiClient): Promise<void> {
    log('\n--- Test: Google Docs Rename ---');

    if (!CONFIG.googleDocId) {
        recordResult(
            'Google Docs Rename',
            false,
            'SKIPPED: No TEST_GDOC_ID provided',
            'Set TEST_GDOC_ID environment variable to a valid Google Doc ID'
        );
        return;
    }

    const testTitle = `TEST-${Date.now()} Renamed Document`;

    try {
        log(`Attempting to rename doc ${CONFIG.googleDocId} to "${testTitle}"`);

        const success = await gemini.renameGoogleDoc(CONFIG.googleDocId, testTitle);

        if (success) {
            recordResult(
                'Google Docs Rename',
                true,
                undefined,
                `Successfully renamed to "${testTitle}"`
            );

            // Optionally restore original title
            if (CONFIG.googleDocOriginalTitle) {
                log(`Restoring original title: "${CONFIG.googleDocOriginalTitle}"`);
                await gemini.renameGoogleDoc(CONFIG.googleDocId, CONFIG.googleDocOriginalTitle);
            }
        } else {
            recordResult(
                'Google Docs Rename',
                false,
                'renameGoogleDoc returned false',
                'Check data/ folder for debug screenshots'
            );
        }
    } catch (e: any) {
        recordResult(
            'Google Docs Rename',
            false,
            e.message,
            'Exception thrown during rename'
        );
    }
}

async function testNotebookLMRename(notebook: NotebookLMClient): Promise<void> {
    log('\n--- Test: NotebookLM Artifact Rename ---');

    if (!CONFIG.notebookTitle) {
        recordResult(
            'NotebookLM Artifact Rename',
            false,
            'SKIPPED: No TEST_NOTEBOOK_TITLE provided',
            'Set TEST_NOTEBOOK_TITLE environment variable'
        );
        return;
    }

    const testTitle = `TEST-${Date.now()} Renamed Audio`;

    try {
        log(`Opening notebook: "${CONFIG.notebookTitle}"`);
        await notebook.openNotebook(CONFIG.notebookTitle);

        log(`Attempting to rename artifact "${CONFIG.artifactCurrentTitle}" to "${testTitle}"`);

        const success = await notebook.renameArtifact(CONFIG.artifactCurrentTitle, testTitle);

        if (success) {
            recordResult(
                'NotebookLM Artifact Rename',
                true,
                undefined,
                `Successfully renamed to "${testTitle}"`
            );

            // Restore original title
            log(`Restoring original title: "${CONFIG.artifactCurrentTitle}"`);
            await notebook.renameArtifact(testTitle, CONFIG.artifactCurrentTitle);
        } else {
            recordResult(
                'NotebookLM Artifact Rename',
                false,
                'renameArtifact returned false',
                'Check data/ folder for debug screenshots'
            );
        }
    } catch (e: any) {
        recordResult(
            'NotebookLM Artifact Rename',
            false,
            e.message,
            'Exception thrown during rename'
        );
    }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('='.repeat(60));
    console.log('BROWSER INTEGRATION TESTS: Rename Functions');
    console.log('='.repeat(60));
    console.log('\nConfiguration:');
    console.log(`  Google Doc ID: ${CONFIG.googleDocId || '(not set)'}`);
    console.log(`  Notebook Title: ${CONFIG.notebookTitle || '(not set)'}`);
    console.log(`  Artifact Title: ${CONFIG.artifactCurrentTitle || '(not set)'}`);
    console.log();

    if (!CONFIG.googleDocId && !CONFIG.notebookTitle) {
        console.log('⚠️  No test targets configured. Set environment variables:');
        console.log('   TEST_GDOC_ID=<google-doc-id>');
        console.log('   TEST_NOTEBOOK_TITLE=<notebook-name>');
        console.log('   TEST_ARTIFACT_TITLE=<artifact-name>  (optional, defaults to "Audio Overview")');
        console.log('\nExample:');
        console.log('   TEST_GDOC_ID=1abc123xyz TEST_NOTEBOOK_TITLE="My Research" npx ts-node tests/browser-rename.test.ts');
        process.exit(1);
    }

    const client = new PerplexityClient();

    try {
        log('Initializing browser...');
        await client.init();

        // Test Google Docs rename
        if (CONFIG.googleDocId) {
            const gemini = await client.createGeminiClient();
            await gemini.init();
            await testGoogleDocsRename(gemini);
        }

        // Test NotebookLM rename
        if (CONFIG.notebookTitle) {
            const notebook = await client.createNotebookClient();
            await testNotebookLMRename(notebook);
        }

    } catch (e: any) {
        console.error('Test setup failed:', e.message);
    } finally {
        await client.close();
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed && !r.error?.startsWith('SKIPPED')).length;
    const skipped = results.filter(r => r.error?.startsWith('SKIPPED')).length;

    results.forEach(r => {
        const status = r.passed ? '✅' : (r.error?.startsWith('SKIPPED') ? '⏭️' : '❌');
        console.log(`  ${status} ${r.name}`);
        if (r.error) console.log(`     ${r.error}`);
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
