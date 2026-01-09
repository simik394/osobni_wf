/**
 * Artifact Registry Tests
 * Run: npx ts-node tests/artifact-registry.test.ts
 */

import { ArtifactRegistry } from '../src/artifact-registry';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DIR = 'data/test-registry';
const TEST_FILE = path.join(TEST_DIR, 'artifact-registry.json');

// Cleanup before tests
function cleanup() {
    if (fs.existsSync(TEST_FILE)) {
        fs.unlinkSync(TEST_FILE);
    }
    if (fs.existsSync(TEST_DIR)) {
        fs.rmdirSync(TEST_DIR, { recursive: true });
    }
}

async function runTests() {
    console.log('🧪 Running Artifact Registry Tests\n');

    cleanup();

    const registry = new ArtifactRegistry(TEST_DIR);
    let passed = 0;
    let failed = 0;

    function test(name: string, condition: boolean) {
        if (condition) {
            console.log(`  ✅ ${name}`);
            passed++;
        } else {
            console.log(`  ❌ ${name}`);
            failed++;
        }
    }

    // === Test 1: ID Generation Uniqueness ===
    console.log('\n📋 Test 1: ID Generation Uniqueness');
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
        ids.add(registry.generateBaseId());
    }
    test('100 IDs are unique', ids.size === 100);
    test('ID length is 3', [...ids][0].length === 3);

    // === Test 2: Session Registration ===
    console.log('\n📋 Test 2: Session Registration');
    const sessionId = registry.registerSession('gemini-session-abc', 'History of Espresso');
    test('Session ID is 3 chars', sessionId.length === 3);

    const session = registry.get(sessionId);
    test('Session entry exists', session !== undefined);
    test('Session type is "session"', session?.type === 'session');
    test('Session has query', session?.query === 'History of Espresso');

    // === Test 3: Document Registration ===
    console.log('\n📋 Test 3: Document Registration');
    const docId = registry.registerDocument(sessionId, 'gdoc-123', 'Deep Research on Coffee');
    test('Doc ID starts with session ID', docId.startsWith(sessionId));
    test('Doc ID has format XXX-NN', /^[A-Z0-9]{3}-\d{2}$/.test(docId));

    const doc = registry.get(docId);
    test('Doc entry exists', doc !== undefined);
    test('Doc type is "document"', doc?.type === 'document');
    test('Doc has parentId', doc?.parentId === sessionId);
    test('Doc currentTitle has ID prefix', doc?.currentTitle?.startsWith(docId) === true);

    // === Test 4: Audio Registration ===
    console.log('\n📋 Test 4: Audio Registration');
    const audioId = registry.registerAudio(docId, 'Coffee Notebook', 'Audio Overview');
    test('Audio ID starts with doc ID', audioId.startsWith(docId));
    test('Audio ID has format XXX-NN-L', /^[A-Z0-9]{3}-\d{2}-[A-Z]$/.test(audioId));

    const audio = registry.get(audioId);
    test('Audio entry exists', audio !== undefined);
    test('Audio type is "audio"', audio?.type === 'audio');
    test('Audio currentTitle has ID prefix', audio?.currentTitle?.startsWith(audioId) === true);

    // === Test 5: Lineage ===
    console.log('\n📋 Test 5: Lineage Tracking');
    const lineage = registry.getLineage(audioId);
    test('Lineage has 3 entries (audio → doc → session)', lineage.length === 3);
    test('First in lineage is audio', lineage[0]?.type === 'audio');
    test('Second in lineage is document', lineage[1]?.type === 'document');
    test('Third in lineage is session', lineage[2]?.type === 'session');

    // === Test 6: Persistence ===
    console.log('\n📋 Test 6: Persistence');
    const registry2 = new ArtifactRegistry(TEST_DIR);
    registry2.load();
    const reloadedSession = registry2.get(sessionId);
    test('Session persists after reload', reloadedSession?.query === 'History of Espresso');

    // === Test 7: List by Type ===
    console.log('\n📋 Test 7: List by Type');
    const sessions = registry.listByType('session');
    const documents = registry.listByType('document');
    const audios = registry.listByType('audio');
    test('Found 1 session', sessions.length === 1);
    test('Found 1 document', documents.length === 1);
    test('Found 1 audio', audios.length === 1);

    // === Test 8: Second Audio (Letter Increment) ===
    console.log('\n📋 Test 8: Second Audio (Letter Suffix)');
    const audioId2 = registry.registerAudio(docId, 'Coffee Notebook', 'Audio Overview v2');
    test('Second audio ends with B', audioId2.endsWith('-B'));

    // === Summary ===
    console.log('\n' + '='.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
        console.log('✅ All tests passed!\n');
        cleanup();
    } else {
        console.log('❌ Some tests failed.\n');
        process.exit(1);
    }
}

runTests().catch(e => {
    console.error('Test execution error:', e);
    process.exit(1);
});
