/**
 * Artifact Registry Verification Script
 * 
 * Purpose: Demonstrates the registry creating REAL entries (not cleaned up)
 * Run: npx ts-node tests/verify-registry-demo.ts
 */

import { ArtifactRegistry } from '../src/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

async function runDemo() {
    console.log('='.repeat(60));
    console.log('ARTIFACT REGISTRY VERIFICATION DEMO');
    console.log('='.repeat(60));
    console.log('\nThis script creates REAL registry entries (not cleaned up).\n');

    // Use the real data directory
    const registry = new ArtifactRegistry('data');
    registry.load();

    console.log('--- STEP 1: Register a Session ---');
    const sessionId = registry.registerSession(
        'demo-gemini-session-12345',
        'Benefits of Green Tea for Health'
    );
    console.log(`Created session: ${sessionId}`);
    console.log(`  → Simulates: Gemini deep-research starting\n`);

    console.log('--- STEP 2: Register a Document ---');
    const docId = registry.registerDocument(
        sessionId,
        'demo-gdoc-abc123xyz',
        'Deep Dive: Green Tea Health Benefits'
    );
    console.log(`Created document: ${docId}`);
    console.log(`  → Simulates: Export to Google Docs completed`);
    console.log(`  → New title would be: "${docId} Deep Dive: Green Tea Health Benefits"\n`);

    console.log('--- STEP 3: Register an Audio ---');
    const audioId = registry.registerAudio(
        docId,
        'Green Tea Research Notebook',
        'Audio Overview'
    );
    console.log(`Created audio: ${audioId}`);
    console.log(`  → Simulates: NotebookLM audio generation completed`);
    console.log(`  → File would be saved as: ${audioId}.mp3`);
    console.log(`  → Artifact would be renamed to: "${audioId} Audio Overview"\n`);

    console.log('--- STEP 4: Show Lineage ---');
    const lineage = registry.getLineage(audioId);
    console.log('Lineage (child → parent):');
    lineage.forEach((entry, idx) => {
        const indent = '  '.repeat(idx);
        const label = entry.currentTitle || entry.query || entry.geminiSessionId;
        console.log(`${indent}${entry.type}: ${label}`);
    });
    console.log();

    console.log('--- STEP 5: Registry File Contents ---');
    const registryPath = path.join('data', 'artifact-registry.json');
    if (fs.existsSync(registryPath)) {
        const contents = fs.readFileSync(registryPath, 'utf-8');
        console.log(`File: ${registryPath}`);
        console.log(contents);
    } else {
        console.log(`ERROR: Registry file not found at ${registryPath}`);
    }

    console.log('='.repeat(60));
    console.log('DEMO COMPLETE - Entries remain in data/artifact-registry.json');
    console.log('='.repeat(60));
}

runDemo().catch(e => {
    console.error('Demo failed:', e);
    process.exit(1);
});
